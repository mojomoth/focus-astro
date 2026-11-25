// 밸런스 기록(freeze) 문서 생성. 브라우저와 서버(scripts/serve.mjs)가 같이 쓴다.
// 서버는 클라이언트가 보낸 params만 믿고, 여기서 다시 시뮬레이션해서 파일을 만든다.
import { BODIES } from './planets.js';
import { DEFAULTS, MODELS, simulate, fmtDur, fmtDist, fmtSpeed, C_PER_LYH } from './sim.js';

export const VERSION_RE = /^v\d+(\.\d+){0,2}$/; // v1, v1.1, v1.2.3

export const PARAM_LABEL = {
  model: '밸런스 모델',
  focusMin: '집중(분)',
  restMin: '휴식(분)',
  restSpeed: '휴식 중 항해 속도(배)',
  waypoints: '중간 기착지(헬리오포즈·오르트 구름)',
  minLegMin: '최소 구간 시간(분)',
  firstLegMin: '첫 구간 목표 시간(분)',
  lastLegMin: '마지막 구간 목표 시간(분)',
  shape: '증가 곡선',
  expTotalH: '연속 지수: 전체 항해 시간(시간)',
  expPower: '연속 지수: 지수 p',
  expScaleAU: '연속 지수: 기준 거리 s(AU)',
  linLyPerH: '원안: 속도(광년/시간)',
  cyclesPerDay: '하루 사이클',
  maxSittingCycles: '한 번에 최대 사이클',
  targetDays: '완주 목표 기간(일)',
};

// 모델과 상관없는 파라미터는 기록에서 뺀다
const MODEL_KEYS = {
  warp: ['firstLegMin', 'lastLegMin', 'shape'],
  exp: ['expTotalH', 'expPower', 'expScaleAU'],
  linear: ['linLyPerH'],
};
const ALL_MODEL_KEYS = Object.values(MODEL_KEYS).flat();

/** 알 수 없는 키를 버리고 타입을 맞춘다. 잘못된 값이면 예외 */
export function sanitizeParams(input) {
  const p = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in (input || {}))) continue;
    const v = input[k];
    if (k === 'model') {
      if (!(v in MODELS)) throw new Error(`알 수 없는 모델: ${v}`);
      p.model = v;
    } else if (typeof DEFAULTS[k] === 'boolean') {
      p[k] = !!v;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`잘못된 값: ${k}=${v}`);
      p[k] = n;
    }
  }
  if (p.focusMin <= 0) throw new Error('집중 시간은 0보다 커야 한다');
  if (p.cyclesPerDay <= 0 || p.maxSittingCycles <= 0) throw new Error('사이클 값은 0보다 커야 한다');
  return p;
}

export function relevantKeys(p) {
  return Object.keys(DEFAULTS).filter((k) => !ALL_MODEL_KEYS.includes(k) || MODEL_KEYS[p.model].includes(k));
}

export function toQuery(p) {
  const q = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) {
    if (p[k] !== DEFAULTS[k]) q.set(k, typeof p[k] === 'boolean' ? (p[k] ? '1' : '0') : String(p[k]));
  }
  return q.toString();
}

/** 두 파라미터 묶음이 같은 밸런스인지 (모델과 관련된 키만 비교) */
export function sameBalance(a, b) {
  if (a.model !== b.model) return false;
  return relevantKeys(a).every((k) => a[k] === b[k]);
}

export function buildFreeze({ version, memo = '', params, frozenAt = new Date() }) {
  if (!VERSION_RE.test(version)) throw new Error('버전 형식은 v1, v1.1, v1.2.3 이다');
  const p = sanitizeParams(params);
  const r = simulate(BODIES, p);
  const date = frozenAt.toISOString();
  const query = toQuery(p);
  const passed = r.checks.filter((c) => c.ok).length;

  const json = {
    version,
    frozenAt: date,
    memo,
    model: p.model,
    modelName: MODELS[p.model].name,
    params: Object.fromEntries(relevantKeys(p).map((k) => [k, p[k]])),
    query,
    totals: {
      focusMin: round(r.totals.focus),
      voyageMin: round(r.totals.voyage),
      wallMin: round(r.totals.wall),
      cycles: round(r.totals.cycles),
      days: r.totals.days,
      maxLegWallMin: round(r.totals.maxLeg.wall),
      maxLegTo: r.totals.maxLeg.to.en,
      warpSteps: r.totals.warpSteps,
    },
    checks: r.checks.map((c) => ({ id: c.id, label: c.label, ok: c.ok, value: c.value })),
    checksPassed: `${passed}/${r.checks.length}`,
    legs: r.legs.map((l) => ({
      no: l.to.no,
      to: l.to.en,
      ko: l.to.ko,
      kind: l.to.kind || 'planet',
      distanceLy: l.to.d,
      gapLy: l.gap,
      targetMin: l.target != null ? round(l.target) : null,
      voyageMin: round(l.voyage),
      wallMin: round(l.wall),
      focusMin: round(l.focus),
      cumFocusMin: round(l.cumFocus),
      cumWallMin: round(l.cumWall),
      day: l.day,
      cruiseLyPerHour: Number(l.cruise.toPrecision(6)),
      cruiseC: Number((l.cruise * C_PER_LYH).toPrecision(4)),
      warpUp: l.warpUp,
      fitsOneSitting: l.fits,
    })),
  };

  const md = [];
  md.push(`# 항해 밸런스 ${version}`, '');
  md.push(`- **기록일:** ${date.slice(0, 10)} (${date})`);
  md.push(`- **모델:** ${MODELS[p.model].name} (${MODELS[p.model].tag})`);
  md.push(`- **체크:** ${passed}/${r.checks.length} 통과`);
  md.push(`- **재현:** \`pocs/voyage-time\` 시뮬레이터를 ${query ? `\`?${query}\` 쿼리로 연다` : '쿼리 없이 연다(추천 기본값과 같다)'}. 기록 목록의 **불러오기**로도 열 수 있다`);
  md.push(`- **데이터:** \`balance.json\` (구간별 수치, 앱 구현용)`);
  if (memo.trim()) md.push('', '## 메모', '', memo.trim());
  md.push('', '## 요약', '');
  const prox = r.legs.find((l) => l.to.en === 'Proxima Cen b');
  md.push('| 항목 | 값 |', '| --- | --- |');
  md.push(`| 전체 완주 집중 시간 | ${fmtDur(r.totals.focus)} |`);
  md.push(`| 실제 소요 (휴식 포함) | ${fmtDur(r.totals.wall)} · ${round(r.totals.cycles)}사이클 · 출항 ${r.legs.length}번 |`);
  md.push(`| 완주 기간 | ${r.totals.days}일 (하루 ${p.cyclesPerDay}사이클) |`);
  md.push(`| 최장 구간 | ${fmtDur(r.totals.maxLeg.wall)} (→ ${r.totals.maxLeg.to.ko}) |`);
  if (prox) md.push(`| 첫 별 프록시마 b | 누적 집중 ${fmtDur(prox.cumFocus)} · ${prox.day}일째 |`);
  md.push(`| 최고 순항 속도 | ${fmtSpeed(r.legs[r.legs.length - 1].cruise)} · 워프 상승 ${r.totals.warpSteps}회 |`);

  md.push('', '## 밸런스 체크', '', '| 결과 | 기준 | 값 |', '| --- | --- | --- |');
  for (const c of r.checks) md.push(`| ${c.ok ? 'PASS' : '**FAIL**'} | ${c.label} | ${c.value} |`);

  md.push('', '## 파라미터', '', '| 파라미터 | 키 | 값 | 기본값 |', '| --- | --- | --- | --- |');
  for (const k of relevantKeys(p)) {
    const v = k === 'model' ? MODELS[p[k]].name : p[k];
    const d = k === 'model' ? MODELS[DEFAULTS[k]].name : DEFAULTS[k];
    md.push(`| ${PARAM_LABEL[k] || k} | \`${k}\` | ${p[k] !== DEFAULTS[k] ? `**${v}**` : v} | ${d} |`);
  }

  md.push('', '## 구간표', '', '| # | 목적지 | 거리 | 항해 | 실제 소요 | 누적 집중 | 도착일 | 순항 속도 | 한 번에 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const l of r.legs) {
    md.push(`| ${l.to.no} | ${l.to.ko}${l.to.kind === 'waypoint' ? ' (기착지)' : ''} | ${fmtDist(l.to.d)} | ${fmtDur(l.voyage)} | ${fmtDur(l.wall)} | ${fmtDur(l.cumFocus)} | ${l.day}일째 | ${l.warpUp && p.model === 'warp' ? '▲ ' : ''}${fmtSpeed(l.cruise)} | ${l.fits ? '가능' : '**불가**'} |`);
  }
  md.push('', '---', '', '이 폴더는 기록 시점의 스냅숏이다. 같은 버전을 덮어쓰지 않는다. 바꿀 때는 새 버전으로 기록한다.', '');

  return { json, markdown: md.join('\n'), passed, total: r.checks.length };
}

const round = (v) => Math.round(v * 100) / 100;

/** 다음 버전 제안: 가장 큰 메이저 + 1 */
export function nextVersion(versions) {
  const majors = versions.map((v) => parseInt(String(v).slice(1), 10)).filter(Number.isFinite);
  return `v${majors.length ? Math.max(...majors) + 1 : 1}`;
}
