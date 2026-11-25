// 항해 시간 계산 모델. DOM 없이 순수 함수로만 구성한다(node에서도 import 가능).
//
// 용어
//  - 항해 시간(voyage): 우주선이 실제로 움직인 시간. 집중 구간은 1배, 휴식 구간은 restSpeed배로 쌓인다.
//  - 실제 소요 시간(wall): 휴식까지 포함한 벽시계 시간. 30분 집중 + 10분 휴식 = 1사이클(40분).
//  - 구간(leg): 직전 목적지에서 다음 목적지까지. 앱은 실패하면 지구로 돌아가므로(로그라이크)
//    한 구간은 한 번 앉은 자리(sitting)에서 끝나야 한다. 구간마다 사이클 처음부터 새로 출발한다고 본다.

export const C_PER_LYH = 8765.8128; // 1광년/시간 = 광속의 8,765.8배 (1율리우스년 = 8,765.8128시간)
export const LY_KM = 9.4607e12;

export const DEFAULTS = Object.freeze({
  model: 'warp',
  // 포모도로
  focusMin: 30,
  restMin: 10,
  restSpeed: 1, // 휴식 중 자동 항해 속도 배율 (기획서: 휴식에도 거리가 쌓인다)
  // 경로
  waypoints: true, // 헬리오포즈·오르트 구름 중간 기착지
  minLegMin: 10, // 같은 항성계 안 이동처럼 거리가 거의 0인 구간의 최소 시간(궤도 진입 연출)
  // [추천] 목표 구간 시간 + 워프 래칫
  firstLegMin: 30, // 첫 구간(지구→금성) 목표 항해 시간
  lastLegMin: 80, // 마지막 구간 목표 항해 시간 (2사이클 = 하루 사용 시간)
  shape: 0.6, // 1=구간 시간이 일정 비율로 늘어남(지수), <1 초반에 빨리 늘어남, >1 후반에 몰아서 늘어남
  // 연속 지수 가속 (거리 로그)
  expTotalH: 40,
  expPower: 1.5,
  expScaleAU: 0.1,
  // 기획서 원안
  linLyPerH: 1,
  // 플레이어 가정
  cyclesPerDay: 2,
  maxSittingCycles: 2,
  targetDays: 30,
});

export const MODELS = {
  warp: { name: '목표 구간 + 워프 래칫', tag: '추천' },
  exp: { name: '연속 지수 가속', tag: '물리형' },
  linear: { name: '등속 1시간 = 1광년', tag: '기획서 원안' },
};

/** 항해 시간 V분을 한 번에 채울 때의 실제 소요 시간·집중 시간 (사이클 처음부터 출발) */
export function sitting(V, p) {
  const F = p.focusMin, R = p.restMin, r = p.restSpeed;
  if (!(V > 1e-9)) return { wall: 0, focus: 0, cycles: 0 };
  const P = F + R * r; // 한 사이클 동안 쌓이는 항해 시간
  let k = Math.floor(V / P + 1e-9);
  let rem = V - k * P;
  if (rem < 1e-9) rem = 0;
  let wall = k * (F + R);
  let focus = k * F;
  if (rem > 0) {
    focus += Math.min(rem, F);
    wall += rem <= F ? rem : F + (rem - F) / r;
  } else if (r === 0 && k > 0) {
    wall -= R; // 휴식에 움직이지 않으면 마지막 집중이 끝나는 순간 도착
  }
  return { wall, focus, cycles: wall / (F + R) };
}

export function route(bodies, p) {
  return bodies.filter((b) => b.kind !== 'waypoint' || p.waypoints);
}

/** 모델별로 각 구간의 항해 시간(분)과 순항 속도(광년/시간)를 계산한다 */
function legTimes(pts, p) {
  const n = pts.length - 1; // 지구 제외
  const out = [];
  const minLeg = p.minLegMin;

  if (p.model === 'warp') {
    // 1) 구간마다 목표 시간을 정한다: first → last를 지수 곡선으로 잇는다.
    // 2) 그 시간 안에 도착하려면 필요한 속도 = 구간 거리 / 목표 시간.
    // 3) 우주선은 감속하지 않는다: 속도 = max(이전 속도, 필요한 속도). 필요할 때만 워프 단계가 오른다.
    // 4) 그래서 실제 구간 시간은 목표 시간 이하. 거리가 0에 가까우면 최소 시간(minLeg)을 쓴다.
    let v = 0;
    for (let i = 1; i <= n; i++) {
      const gap = pts[i].d - pts[i - 1].d;
      const s = n === 1 ? 1 : Math.pow((i - 1) / (n - 1), p.shape);
      const target = p.firstLegMin * Math.pow(p.lastLegMin / p.firstLegMin, s);
      const need = gap / (target / 60);
      const warpUp = need > v * (1 + 1e-9);
      if (warpUp) v = need;
      const t = gap > 0 ? (gap / v) * 60 : 0;
      out.push({ voyage: Math.max(t, minLeg), cruise: v, target, warpUp });
    }
    return out;
  }

  if (p.model === 'exp') {
    // 누적 시간 T(d) = H · (ln(1 + d/s) / ln(1 + dmax/s))^p
    // p = 1이면 속도가 거리에 비례(= 시간에 대해 지수적으로 가속). p > 1이면 초반을 압축한다.
    const s = p.expScaleAU / 63241;
    const L = (d) => Math.log(1 + d / s);
    const Lmax = L(pts[n].d);
    const H = p.expTotalH * 60;
    const T = (d) => H * Math.pow(L(d) / Lmax, p.expPower);
    // 순간 속도 dd/dT (광년/분 → 광년/시간)
    const vAt = (d) => {
      const l = Math.max(L(d), 1e-12);
      return ((d + s) * Math.pow(Lmax, p.expPower)) / (H * p.expPower * Math.pow(l, p.expPower - 1)) * 60;
    };
    let prev = 0;
    let lastV = 0;
    for (let i = 1; i <= n; i++) {
      const t = Math.max(T(pts[i].d), prev + minLeg);
      const v = vAt(pts[i].d);
      out.push({ voyage: t - prev, cruise: v, warpUp: v > lastV * 1.0001 });
      lastV = Math.max(lastV, v);
      prev = t;
    }
    return out;
  }

  // linear: 기획서 원안(등속). 비교용이라 최소 시간 보정을 하지 않는다(같은 항성계만 예외).
  const v = p.linLyPerH;
  for (let i = 1; i <= n; i++) {
    const gap = pts[i].d - pts[i - 1].d;
    out.push({ voyage: gap > 0 ? (gap / v) * 60 : minLeg, cruise: v, warpUp: i === 1 });
  }
  return out;
}

export function simulate(bodies, params) {
  const p = { ...DEFAULTS, ...params };
  const pts = route(bodies, p);
  const times = legTimes(pts, p);
  const cycleWall = p.focusMin + p.restMin;
  const dayCap = p.cyclesPerDay * cycleWall;
  const sittingCap = p.maxSittingCycles * cycleWall;

  let cumVoyage = 0, cumFocus = 0, cumWall = 0;
  let day = 1, dayUsed = 0;
  const legs = times.map((lt, idx) => {
    const to = pts[idx + 1], from = pts[idx];
    const st = sitting(lt.voyage, p);
    cumVoyage += lt.voyage; cumFocus += st.focus; cumWall += st.wall;
    // 도착일: 구간은 날짜 사이에 쪼갤 수 없다. 오늘 남은 시간에 안 들어가면 다음 날 출항한다.
    //   하루 사용 시간보다 긴 구간은 그날 상한을 넘겨 한 번에 가야 하고, 그만큼 날짜를 더 쓴 것으로 본다.
    if (dayUsed > 0 && dayUsed + st.wall > dayCap + 1e-6) { day += 1; dayUsed = 0; }
    const overDay = st.wall > dayCap + 1e-6;
    if (overDay) { day += Math.ceil(st.wall / dayCap - 1e-9) - 1; dayUsed = dayCap; } else dayUsed += st.wall;
    return {
      i: idx + 1, from, to, gap: to.d - from.d,
      voyage: lt.voyage, target: lt.target, cruise: lt.cruise, warpUp: lt.warpUp,
      wall: st.wall, focus: st.focus, cycles: st.cycles,
      fits: st.wall <= sittingCap + 1e-6, overDay,
      cumVoyage, cumFocus, cumWall, day,
    };
  });

  const totals = {
    voyage: cumVoyage, focus: cumFocus, wall: cumWall,
    cycles: cumWall / cycleWall, days: legs.length ? legs[legs.length - 1].day : 0,
    maxLeg: legs.reduce((a, l) => (l.wall > a.wall ? l : a), legs[0]),
    minLeg: legs.reduce((a, l) => (l.wall < a.wall ? l : a), legs[0]),
    overLegs: legs.filter((l) => !l.fits),
    overDayLegs: legs.filter((l) => l.overDay),
    warpSteps: legs.filter((l) => l.warpUp).length,
  };
  const checks = makeChecks(legs, totals, p);
  return { p, pts, legs, totals, checks, cycleWall, sittingCap, dayCap };
}

function makeChecks(legs, t, p) {
  const proxima = legs.find((l) => l.to.en === 'Proxima Cen b');
  const day1 = legs.filter((l) => l.day === 1).length;
  let decel = 0;
  for (let i = 1; i < legs.length; i++) if (legs[i].cruise < legs[i - 1].cruise * 0.999) decel++;
  const first = legs[0];
  const fmt = fmtDur;
  return [
    {
      id: 'first', label: `첫 집중 ${p.focusMin}분 안에 첫 행성 도착`,
      ok: first.wall <= p.focusMin + 1e-6 && first.voyage >= 5,
      value: `${first.to.ko} ${fmt(first.wall)}째 도착`,
      hint: first.voyage < 5 ? '너무 빨라 출항 연출이 끝나기 전에 도착' : '첫 세션에서 도착 경험을 줘야 한다',
    },
    {
      id: 'sitting', label: `모든 구간이 한 번에 ${p.maxSittingCycles}사이클(${fmt(p.maxSittingCycles * (p.focusMin + p.restMin))}) 이내`,
      ok: t.overLegs.length === 0,
      value: t.overLegs.length ? `${t.overLegs.length}개 초과 · 최장 ${fmt(t.maxLeg.wall)}` : `최장 ${fmt(t.maxLeg.wall)} (${t.maxLeg.to.ko})`,
      hint: '실패하면 지구로 돌아가므로 한 구간은 한 번 앉은 자리에서 끝나야 한다',
    },
    {
      id: 'days', label: `하루 ${p.cyclesPerDay}사이클로 ${p.targetDays}일 안에 완주`,
      ok: t.days <= p.targetDays && t.overDayLegs.length === 0,
      value: `${t.days.toLocaleString()}일 · 집중 ${fmt(t.focus)}${t.overDayLegs.length ? ` · 하루 ${fmt(p.cyclesPerDay * (p.focusMin + p.restMin))} 넘는 구간 ${t.overDayLegs.length}개` : ''}`,
      hint: '구간은 날짜 사이에 쪼갤 수 없다. 매일 같은 시간만 써도 모든 행성에 도달해야 한다',
    },
    {
      id: 'mono', label: '우주선이 감속하지 않음 (속도 단조 증가)',
      ok: decel === 0,
      value: decel ? `${decel}번 감속` : `워프 상승 ${t.warpSteps}회`,
      hint: '속도가 줄면 성장 감각이 깨진다',
    },
    {
      id: 'day1', label: '첫날 3곳 이상 도착 (초반 이탈 방지)',
      ok: day1 >= 3,
      value: `첫날 ${day1}곳 · ${legs.filter((l) => l.day === 1).map((l) => l.to.ko).join(', ')}`,
      hint: '첫 사용일에 도착 경험을 여러 번 줘야 다음 날 다시 온다',
    },
    {
      id: 'proxima', label: '프록시마 b(첫 별)까지 누적 집중 3~8시간',
      ok: !!proxima && proxima.cumFocus >= 180 && proxima.cumFocus <= 480,
      value: proxima ? `집중 ${fmt(proxima.cumFocus)} · ${proxima.day}일째` : '-',
      hint: '기획서 기준 4시간 15분. 공유 카드가 나오는 첫 큰 성취',
    },
  ];
}

/** 분 → 사람이 읽는 시간 */
export function fmtDur(min) {
  if (!isFinite(min)) return '∞';
  if (min < 1 / 60) return `${(min * 60).toPrecision(2)}초`;
  if (min < 1) return `${Math.round(min * 60)}초`;
  const total = Math.round(min);
  if (total < 60) return `${total}분`;
  const h = Math.floor(total / 60), m = total - h * 60;
  if (h < 48) return m ? `${h}시간 ${m}분` : `${h}시간`;
  if (h < 24 * 365) return `${h.toLocaleString()}시간`;
  return `${(h / (24 * 365)).toFixed(1)}년(연속)`;
}

/** 광년 → 표시 문자열 */
export function fmtDist(ly) {
  if (ly === 0) return '0';
  const au = ly * 63241;
  if (au < 1000) return `${au < 10 ? au.toFixed(2) : au.toFixed(1)} AU`;
  if (ly < 10) return `${ly.toFixed(2)} 광년`;
  return `${ly.toLocaleString(undefined, { maximumFractionDigits: ly < 100 ? 1 : 0 })} 광년`;
}

/** 광년/시간 → 광속 배수 */
export function fmtSpeed(lyh) {
  const c = lyh * C_PER_LYH;
  if (c < 1) return `${c.toFixed(c < 0.1 ? 3 : 2)}c`;
  if (c < 1e4) return `${Math.round(c).toLocaleString()}c`;
  const t = (v, d) => v.toFixed(d).replace(/\.0$/, '');
  if (c < 1e8) return `${t(c / 1e4, c < 1e5 ? 1 : 0)}만c`;
  return `${t(c / 1e8, 1)}억c`;
}
