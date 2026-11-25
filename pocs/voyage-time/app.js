import { BODIES, REGION_LABEL } from './planets.js';
import { DEFAULTS, MODELS, simulate, sitting, fmtDur, fmtDist, fmtSpeed, C_PER_LYH } from './sim.js';
import { VERSION_RE, nextVersion, sameBalance, toQuery } from './freeze.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REGION_COLOR = { solar: 'var(--solar)', edge: 'var(--edge)', near: 'var(--near)', far: 'var(--far)', deep: 'var(--deep)' };
const cycVoyage = (p) => p.focusMin + p.restMin * p.restSpeed; // 1사이클 동안 쌓이는 항해 시간
const cyc = (min, p) => `${(min / cycVoyage(p)).toFixed(2)}사이클`;
const fmtCycles = (c) => (c < 10 ? c.toFixed(2) : Math.round(c).toLocaleString());

// ─── 컨트롤 정의 ─────────────────────────────────────────────
const CONTROLS = [
  {
    group: '추천 모델: 목표 구간 + 워프 래칫', models: ['warp'], items: [
      { key: 'firstLegMin', label: '첫 구간 목표 시간', min: 5, max: 120, step: 5, unit: '분', hint: (p) => `항해 ${cyc(p.firstLegMin, p)} · 지구 → 금성` },
      { key: 'lastLegMin', label: '마지막 구간 목표 시간', min: 30, max: 480, step: 5, unit: '분', hint: (p) => `항해 ${cyc(p.lastLegMin, p)} · → SWEEPS-11 b` },
      { key: 'shape', label: '증가 곡선', min: 0.3, max: 3, step: 0.1, unit: '', hint: (p) => (p.shape < 0.95 ? '초반에 빨리 늘어남' : p.shape > 1.05 ? '후반에 몰아서 늘어남' : '일정 비율로 늘어남(지수)') },
    ],
  },
  {
    group: '연속 지수 가속', models: ['exp'], items: [
      { key: 'expTotalH', label: '전체 항해 시간 H', min: 5, max: 400, step: 5, unit: '시간' },
      { key: 'expPower', label: '지수 p', min: 0.5, max: 3, step: 0.1, unit: '', hint: () => 'T(d) = H·(ln(1+d/s) ÷ ln(1+d최대/s))^p' },
      { key: 'expScaleAU', label: '기준 거리 s', min: 0.01, max: 5, step: 0.01, unit: 'AU', hint: () => '이 거리부터 가속이 붙는다' },
    ],
  },
  {
    group: '기획서 원안', models: ['linear'], items: [
      { key: 'linLyPerH', label: '속도', min: 0.1, max: 100, step: 0.1, unit: '광년/h', hint: (p) => `= ${fmtSpeed(p.linLyPerH)} · 원안은 1광년/시간` },
    ],
  },
  {
    group: '포모도로', items: [
      { key: 'focusMin', label: '집중', min: 10, max: 60, step: 5, unit: '분' },
      { key: 'restMin', label: '휴식', min: 0, max: 30, step: 1, unit: '분' },
      { key: 'restSpeed', label: '휴식 중 항해 속도', min: 0, max: 1, step: 0.05, unit: '배', hint: (p) => (p.restSpeed === 0 ? '휴식 중에는 멈춤' : `자동 항해 · 1사이클 = 항해 ${cycVoyage(p)}분`) },
    ],
  },
  {
    group: '경로', items: [
      { key: 'waypoints', type: 'check', label: '헬리오포즈·오르트 구름을 중간 기착지로 넣기' },
      { key: 'minLegMin', label: '최소 구간 시간', min: 0, max: 60, step: 1, unit: '분', hint: () => '같은 항성계 이동(프록시마 b→d 등) · 궤도 진입 연출' },
    ],
  },
  {
    group: '플레이어 가정', items: [
      { key: 'cyclesPerDay', label: '하루 사이클', min: 0.5, max: 8, step: 0.5, unit: '회', hint: (p) => `하루 ${fmtDur(p.cyclesPerDay * (p.focusMin + p.restMin))} (휴식 포함)` },
      { key: 'maxSittingCycles', label: '한 번에 최대 사이클', min: 1, max: 8, step: 0.5, unit: '회', hint: (p) => `한 번 앉아서 ${fmtDur(p.maxSittingCycles * (p.focusMin + p.restMin))}까지` },
      { key: 'targetDays', label: '완주 목표 기간', min: 7, max: 365, step: 1, unit: '일' },
    ],
  },
];

// ─── 상태(URL 동기화) ───────────────────────────────────────
function loadParams() {
  const q = new URLSearchParams(location.search);
  const p = { ...DEFAULTS };
  for (const [k, v] of q) {
    if (!(k in DEFAULTS)) continue;
    if (k === 'model') { if (v in MODELS) p.model = v; } else if (k === 'waypoints') p.waypoints = v !== '0';
    else if (v !== '' && isFinite(+v)) p[k] = +v;
  }
  // 범위를 벗어난 URL 값은 컨트롤 범위로 자른다
  for (const g of CONTROLS) for (const c of g.items) {
    if (c.type !== 'check') p[c.key] = Math.min(c.max, Math.max(c.min, p[c.key]));
  }
  return p;
}
function saveParams() {
  const s = toQuery(P);
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}
let P = loadParams();
let R = null;

// ─── 컨트롤 렌더 ───────────────────────────────────────────
function buildControls() {
  const el = $('#controls');
  let html = `<div class="group"><h3>밸런스 모델</h3><div class="seg" role="group" aria-label="밸런스 모델">${Object.entries(MODELS)
    .map(([k, m]) => `<button type="button" data-model="${k}" aria-pressed="${P.model === k}"><span>${m.name}</span><span class="tag">${m.tag}</span></button>`)
    .join('')}</div></div>`;
  for (const g of CONTROLS) {
    html += `<div class="group" ${g.models ? `data-models="${g.models.join(' ')}"` : ''}><h3>${g.group}</h3>`;
    for (const c of g.items) {
      if (c.type === 'check') {
        html += `<label class="check-ctl"><input type="checkbox" data-key="${c.key}" ${P[c.key] ? 'checked' : ''}><span>${c.label}</span></label>`;
        continue;
      }
      html += `<div class="ctl" data-ctl="${c.key}">
        <div class="ctl-top"><label for="n-${c.key}">${c.label}</label>
          <span class="val"><input id="n-${c.key}" type="number" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${P[c.key]}"><span class="unit">${c.unit}</span></span></div>
        <input type="range" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${P[c.key]}" aria-label="${c.label}">
        <div class="hint" data-hint="${c.key}"></div></div>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    P.model = b.dataset.model;
    update();
  });
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    if (e.target.type === 'checkbox') P[k] = e.target.checked;
    else {
      const c = CONTROLS.flatMap((g) => g.items).find((x) => x.key === k);
      const v = parseFloat(e.target.value);
      if (!isFinite(v) || v < c.min || v > c.max) return;
      P[k] = v;
      el.querySelectorAll(`[data-key="${k}"]`).forEach((x) => { if (x !== e.target) x.value = v; });
    }
    update();
  });
}

function syncControls() {
  const el = $('#controls');
  el.querySelectorAll('[data-model]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.model === P.model)));
  el.querySelectorAll('[data-models]').forEach((g) => { g.hidden = !g.dataset.models.split(' ').includes(P.model); });
  for (const g of CONTROLS) for (const c of g.items) {
    el.querySelectorAll(`[data-key="${c.key}"]`).forEach((x) => {
      if (x.type === 'checkbox') x.checked = !!P[c.key];
      else if (document.activeElement !== x) x.value = P[c.key];
    });
    const h = el.querySelector(`[data-hint="${c.key}"]`);
    if (h) h.textContent = c.hint ? c.hint(P) : '';
    const box = el.querySelector(`[data-ctl="${c.key}"]`);
    if (box) box.classList.toggle('changed', P[c.key] !== DEFAULTS[c.key]);
  }
}

// ─── KPI · 체크 ──────────────────────────────────────────
function renderKPIs(r) {
  const t = r.totals;
  const prox = r.legs.find((l) => l.to.en === 'Proxima Cen b');
  const top = r.legs[r.legs.length - 1];
  const kpi = (k, v, s) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('#kpis').innerHTML = [
    kpi('전체 완주 집중 시간', fmtDur(t.focus), `항해 ${fmtDur(t.voyage)} (휴식 항해 포함)`),
    kpi('실제 소요 (휴식 포함)', fmtDur(t.wall), `${fmtCycles(t.cycles)}사이클 · 출항 ${r.legs.length}번`),
    kpi('완주 기간', `${t.days.toLocaleString()}일`, `하루 ${P.cyclesPerDay}사이클 가정`),
    kpi('최장 구간', fmtDur(t.maxLeg.wall), `→ ${t.maxLeg.to.ko}`),
    kpi('첫 별 프록시마 b', prox ? fmtDur(prox.cumFocus) : '-', prox ? `누적 집중 · ${prox.day}일째` : ''),
    kpi('최고 순항 속도', fmtSpeed(top.cruise), `워프 상승 ${t.warpSteps}회`),
  ].join('');
}

function renderChecks(r) {
  const ok = r.checks.filter((c) => c.ok).length;
  $('#checkScore').innerHTML = `<b style="color:${ok === r.checks.length ? 'var(--ok)' : 'var(--warn)'}">${ok}/${r.checks.length}</b> 통과`;
  $('#checks').innerHTML = r.checks.map((c) => `<div class="chk ${c.ok ? 'ok' : 'bad'}">
    <span class="badge">${c.ok ? 'PASS' : 'FAIL'}</span>
    <span class="l">${esc(c.label)}</span><span class="vv">${esc(c.value)}</span><span class="h">${esc(c.hint)}</span></div>`).join('');
}

// ─── 차트 ────────────────────────────────────────────────
const W = (id) => Math.max(320, $(id).clientWidth);
const niceStep = (span, n = 5) => {
  const raw = span / n;
  const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 1440];
  return steps.find((s) => s >= raw) ?? Math.pow(10, Math.ceil(Math.log10(raw)));
};
const tickMin = (m) => (m === 0 ? "0분" : fmtDur(m));

function legTip(l) {
  return `<b>${esc(l.to.ko)}</b> · ${fmtDist(l.to.d)}<br>${esc(l.from.ko)}에서 ${fmtDist(l.gap)}<br>항해 ${fmtDur(l.voyage)}${l.target ? ` (목표 ${fmtDur(l.target)})` : ''}<br>실제 소요 ${fmtDur(l.wall)} · 집중 ${fmtDur(l.focus)}<br>순항 ${fmtSpeed(l.cruise)}${l.warpUp ? ' ▲워프' : ''} · ${l.day}일째 도착`;
}

function chartLegs(r) {
  const w = W('#chartLegs'), h = 270, m = { l: 52, r: 12, t: 16, b: 44 };
  const iw = w - m.l - m.r, ih = h - m.t - m.b;
  const cap = r.sittingCap;
  const maxWall = Math.max(...r.legs.map((l) => l.wall));
  const yMax = Math.max(cap * 1.15, Math.min(maxWall * 1.05, cap * 2));
  const y = (v) => m.t + ih - (Math.min(v, yMax) / yMax) * ih;
  const n = r.legs.length, bw = iw / n;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="구간별 소요 시간 막대 차트">`;
  const step = niceStep(yMax);
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    s += `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${tickMin(v)}</text>`;
  }
  // 영역 띠
  let start = 0;
  for (let i = 0; i <= n; i++) {
    if (i === n || r.legs[i].to.region !== r.legs[start].to.region) {
      const reg = r.legs[start].to.region, x0 = m.l + start * bw, x1 = m.l + i * bw;
      s += `<rect x="${x0 + 1}" y="${h - m.b + 8}" width="${Math.max(0, x1 - x0 - 2)}" height="3" rx="1.5" fill="${REGION_COLOR[reg]}" opacity=".8"/>`;
      if (x1 - x0 > 44) s += `<text x="${(x0 + x1) / 2}" y="${h - m.b + 26}" text-anchor="middle">${REGION_LABEL[reg].replace(/ \(.*\)/, '')}</text>`;
      start = i;
    }
  }
  r.legs.forEach((l, i) => {
    const x = m.l + i * bw + bw * 0.14, bwi = bw * 0.72, top = y(l.wall);
    const color = REGION_COLOR[l.to.region];
    s += `<rect class="hit" data-tip="${esc(legTip(l))}" x="${x}" y="${top}" width="${bwi}" height="${Math.max(1, m.t + ih - top)}" rx="${Math.min(3, bwi / 3)}" fill="${l.fits ? color : 'var(--bad)'}" opacity="${l.to.kind === 'waypoint' ? 0.5 : 0.9}"/>`;
    if (l.target) s += `<line x1="${x}" x2="${x + bwi}" y1="${y(l.target)}" y2="${y(l.target)}" stroke="var(--text)" stroke-opacity=".35" stroke-width="1"/>`;
    if (l.wall > yMax) s += `<text x="${x + bwi / 2}" y="${m.t - 4}" text-anchor="middle" style="fill:var(--bad)">↑</text>`;
    if (l.warpUp && r.p.model !== 'linear') s += `<path d="M${x + bwi / 2 - 3.5},${top - 4} l3.5,-5 l3.5,5z" fill="var(--accent)"/>`;
  });
  s += `<line class="thr2" x1="${m.l}" x2="${w - m.r}" y1="${y(r.cycleWall)}" y2="${y(r.cycleWall)}"/>`;
  s += `<line class="thr" x1="${m.l}" x2="${w - m.r}" y1="${y(cap)}" y2="${y(cap)}"/>`;
  s += `<text x="${w - m.r}" y="${y(cap) - 6}" text-anchor="end" style="fill:var(--warn)">한 번에 최대 ${fmtDur(cap)}</text>`;
  s += `<line class="axis" x1="${m.l}" x2="${w - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
  $('#chartLegs').innerHTML = s;
  $('#legendRegions').innerHTML = Object.entries(REGION_LABEL).map(([k, v]) => `<span><i style="background:${REGION_COLOR[k]}"></i>${v}</span>`).join('')
    + (r.p.model === 'warp' ? '<span><i style="background:var(--text);opacity:.35;height:2px"></i>목표 시간</span>' : '')
    + '<span><i style="background:var(--bad)"></i>한 번에 불가</span>';
}

const AXIS_D = [
  [1 / 63241, '1 AU'], [100 / 63241, '100 AU'], [0.1, '0.1광년'], [1, '1광년'], [10, '10광년'], [100, '100광년'], [1000, '1,000광년'], [10000, '1만 광년'],
];

function chartReach(r) {
  const w = W('#chartReach'), h = 260, m = { l: 66, r: 16, t: 14, b: 30 };
  const iw = w - m.l - m.r, ih = h - m.t - m.b;
  const xs = r.legs.map((l) => l.cumFocus / 60);
  const xMax = xs[xs.length - 1] || 1;
  const lo = Math.log10(r.legs[0].to.d) - 0.3, hi = Math.log10(r.legs[r.legs.length - 1].to.d) + 0.2;
  const x = (v) => m.l + (v / xMax) * iw;
  const y = (d) => m.t + ih - ((Math.log10(d) - lo) / (hi - lo)) * ih;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="누적 집중 시간 대비 도달 거리">`;
  for (const [d, lab] of AXIS_D) s += `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(d)}" y2="${y(d)}"/><text x="${m.l - 8}" y="${y(d) + 4}" text-anchor="end">${lab}</text>`;
  const step = niceStepH(xMax);
  for (let v = 0; v <= xMax + 1e-9; v += step) s += `<text x="${x(v)}" y="${h - 8}" text-anchor="middle">${fmtHourTick(v)}</text>`;
  s += `<polyline fill="none" stroke="var(--accent)" stroke-opacity=".55" stroke-width="1.5" points="${r.legs.map((l, i) => `${x(xs[i])},${y(l.to.d)}`).join(' ')}"/>`;
  r.legs.forEach((l, i) => {
    s += `<circle class="hit" data-tip="${esc(legTip(l))}" cx="${x(xs[i])}" cy="${y(l.to.d)}" r="${l.to.kind === 'waypoint' ? 3 : 4}" fill="${REGION_COLOR[l.to.region]}" stroke="var(--card)" stroke-width="1.5"/>`;
  });
  const lab = (en, txt, dy = -10, left = false) => {
    const i = r.legs.findIndex((l) => l.to.en === en);
    if (i >= 0) s += `<text x="${left ? x(xs[i]) - 6 : Math.min(x(xs[i]) + 6, w - m.r - 4)}" y="${y(r.legs[i].to.d) + dy}" text-anchor="${left || x(xs[i]) > w - 120 ? 'end' : 'start'}" style="fill:var(--text)">${txt}</text>`;
  };
  lab('Neptune', '해왕성', 14); lab('Proxima Cen b', '프록시마 b ', -12, true); lab('SWEEPS-11 b', 'SWEEPS-11 b', 16);
  s += `<line class="axis" x1="${m.l}" x2="${w - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
  $('#chartReach').innerHTML = s;
}
const niceStepH = (span) => {
  const raw = span / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw);
};
const fmtHourTick = (hh) => (hh >= 1e4 ? `${(hh / 1e4).toFixed(0)}만h` : `${+hh.toFixed(1)}h`);

function chartSpeed(r) {
  const w = W('#chartSpeed'), h = 260, m = { l: 58, r: 12, t: 14, b: 30 };
  const iw = w - m.l - m.r, ih = h - m.t - m.b;
  const cs = r.legs.map((l) => Math.max(l.cruise * C_PER_LYH, 1e-6));
  const lo = Math.floor(Math.log10(Math.min(...cs))), hi = Math.ceil(Math.log10(Math.max(...cs)) + 1e-9);
  const span = Math.max(1, hi - lo);
  const n = r.legs.length;
  const x = (i) => m.l + (i / n) * iw;
  const y = (c) => m.t + ih - ((Math.log10(c) - lo) / span) * ih;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="구간별 순항 속도">`;
  const every = span > 8 ? 2 : 1;
  for (let k = lo; k <= hi; k += every) s += `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(10 ** k)}" y2="${y(10 ** k)}"/><text x="${m.l - 8}" y="${y(10 ** k) + 4}" text-anchor="end">${fmtSpeed(10 ** k / C_PER_LYH)}</text>`;
  if (lo <= 0 && hi >= 0) s += `<text x="${w - m.r}" y="${y(1) - 5}" text-anchor="end" style="fill:var(--warn)">광속</text><line x1="${m.l}" x2="${w - m.r}" y1="${y(1)}" y2="${y(1)}" stroke="var(--warn)" stroke-opacity=".5"/>`;
  let d = '';
  r.legs.forEach((l, i) => { d += `${i ? 'L' : 'M'}${x(i)},${y(cs[i])} L${x(i + 1)},${y(cs[i])} `; });
  s += `<path d="${d}" fill="none" stroke="var(--accent2)" stroke-width="2"/>`;
  r.legs.forEach((l, i) => {
    s += `<rect class="hit" data-tip="${esc(legTip(l))}" x="${x(i)}" y="${m.t}" width="${iw / n}" height="${ih}" fill="transparent"/>`;
    if (l.warpUp && r.p.model === 'warp') s += `<circle cx="${x(i)}" cy="${y(cs[i])}" r="2.6" fill="var(--accent)"/>`;
  });
  s += `<text x="${m.l}" y="${h - 8}">지구</text><text x="${w - m.r}" y="${h - 8}" text-anchor="end">SWEEPS-11 b</text>`;
  s += `<line class="axis" x1="${m.l}" x2="${w - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
  $('#chartSpeed').innerHTML = s;
}

// ─── 계산기 ──────────────────────────────────────────────
function fillSelect(sel, pts, keep, fallbackIdx, skipLast) {
  const opts = pts.map((b, i) => (skipLast && i === pts.length - 1 ? '' : `<option value="${esc(b.en)}">${i}. ${esc(b.ko)}</option>`)).join('');
  sel.innerHTML = opts;
  sel.value = pts.some((b) => b.en === keep) ? keep : pts[fallbackIdx].en;
}

function setupCalcs() {
  ['#calcFrom', '#calcTo', '#reachFrom', '#reachCycles'].forEach((id) => $(id).addEventListener('input', () => renderCalcs(R)));
}

function packSittings(legs, cap) {
  let n = 0, used = Infinity;
  for (const l of legs) {
    if (used + l.wall > cap + 1e-6) { n++; used = 0; }
    used += l.wall;
  }
  return n;
}

function renderCalcs(r) {
  const pts = r.pts;
  const f0 = $('#calcFrom').value || 'Earth', t0 = $('#calcTo').value || pts[pts.length - 1].en, rf = $('#reachFrom').value || 'Earth';
  fillSelect($('#calcFrom'), pts, f0, 0);
  fillSelect($('#calcTo'), pts, t0, pts.length - 1);
  fillSelect($('#reachFrom'), pts, rf, 0, true);

  const cell = (k, v) => `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  // 구간 계산기
  const fi = pts.findIndex((b) => b.en === $('#calcFrom').value), ti = pts.findIndex((b) => b.en === $('#calcTo').value);
  if (ti <= fi) {
    $('#calcOut').innerHTML = `<div class="cell wide">도착지를 출발지보다 먼 곳으로 고른다.</div>`;
  } else {
    const legs = r.legs.slice(fi, ti);
    const V = legs.reduce((a, l) => a + l.voyage, 0);
    const st = sitting(V, r.p);
    const fits = st.wall <= r.sittingCap + 1e-6;
    const n = packSittings(legs, r.sittingCap);
    const days = Math.ceil(st.cycles / r.p.cyclesPerDay - 1e-9);
    $('#calcOut').innerHTML = [
      cell('거리', fmtDist(pts[ti].d - pts[fi].d)),
      cell('항해 시간', fmtDur(V)),
      cell('집중 시간', fmtDur(st.focus)),
      cell('실제 소요', fmtDur(st.wall)),
      cell('사이클', `${fmtCycles(st.cycles)}회`),
      cell('기간', `${days.toLocaleString()}일`),
      `<div class="cell wide ${fits ? 'ok' : 'bad'}">${fits
        ? `한 번에 출항 가능 · 한 번 최대 ${fmtDur(r.sittingCap)} 이내 · 지나가는 목적지 ${ti - fi - 1}곳`
        : `한 번에 가기엔 길다 · 중간 목적지에 기착해 최소 <b>${n}번</b> 나눠 출항해야 한다${legs.some((l) => !l.fits) ? ' (한 번에 못 가는 구간 포함)' : ''}`}</div>`,
    ].join('');
  }

  // 역산 계산기
  const si = pts.findIndex((b) => b.en === $('#reachFrom').value);
  const cycles = Math.max(0, parseFloat($('#reachCycles').value) || 0);
  const F = r.p.focusMin, Rm = r.p.restMin, rs = r.p.restSpeed;
  const wall = cycles * (F + Rm);
  const k = Math.floor(wall / (F + Rm) + 1e-9), rem = wall - k * (F + Rm);
  let budget = k * cycVoyage(r.p) + Math.min(rem, F) + Math.max(0, rem - F) * rs;
  let reached = si, used = 0;
  for (let i = si; i < r.legs.length; i++) {
    if (used + r.legs[i].voyage <= budget + 1e-6) { used += r.legs[i].voyage; reached = i + 1; } else break;
  }
  const next = r.legs[reached];
  const frac = next ? Math.min(1, (budget - used) / next.voyage) : 0;
  const pos = next ? next.from.d + next.gap * frac : pts[reached].d;
  $('#reachOut').innerHTML = [
    cell('도착하는 곳', reached > si ? esc(pts[reached].ko) : '없음'),
    cell('도착 횟수', `${reached - si}곳`),
    cell('현재 거리', fmtDist(pos)),
    cell('항해 시간', fmtDur(budget)),
    cell('집중 시간', fmtDur(k * F + Math.min(rem, F))),
    cell('실제 소요', fmtDur(wall)),
    next
      ? `<div class="cell wide">다음 목적지 <b>${esc(next.to.ko)}</b>까지 ${Math.round(frac * 100)}% · 항해 ${fmtDur(next.voyage - (budget - used))} 더 필요${wall > r.sittingCap ? ' · <span style="color:var(--warn)">한 번 최대 시간을 넘는 연속 항해</span>' : ''}</div>`
      : '<div class="cell wide ok">최종 목적지까지 모두 도착</div>',
  ].join('');
}

// ─── 비교 · 표 ───────────────────────────────────────────
function renderCompare() {
  const rows = Object.entries(MODELS).map(([k, m]) => {
    const r = simulate(BODIES, { ...P, model: k });
    const prox = r.legs.find((l) => l.to.en === 'Proxima Cen b');
    const ok = r.checks.filter((c) => c.ok).length;
    return `<tr data-model="${k}" class="${P.model === k ? 'active' : ''}">
      <td class="l"><b>${m.name}</b><span class="pill">${m.tag}</span></td>
      <td class="num">${fmtDur(r.totals.focus)}</td><td class="num">${r.totals.days.toLocaleString()}일</td>
      <td class="num">${fmtDur(r.totals.maxLeg.wall)}</td>
      <td class="num" style="color:${r.totals.overLegs.length ? 'var(--bad)' : 'inherit'}">${r.totals.overLegs.length}개</td>
      <td class="num">${prox ? fmtDur(prox.cumFocus) : '-'}</td>
      <td class="num">${fmtDur(r.legs[0].voyage)}</td>
      <td><span class="pill ${ok === r.checks.length ? 'ok' : 'bad'}">${ok}/${r.checks.length}</span></td></tr>`;
  }).join('');
  $('#cmp').innerHTML = `<thead><tr><th class="l">모델</th><th>완주 집중</th><th>완주 기간</th><th>최장 구간</th><th>한 번에 불가</th><th>프록시마 b 집중</th><th>첫 구간</th><th>체크</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderTable(r) {
  const thumb = (b) => (b.img
    ? `<img class="thumb" src="assets/planets/${b.img}.jpg" alt="" loading="lazy">`
    : `<span class="thumb ph">${b.kind === 'waypoint' ? '◌' : '?'}</span>`);
  const name = (b) => `<div class="name" ${b.note ? `data-tip="${esc(esc(b.note))}"` : ''}>${thumb(b)}<div><span class="dot" style="background:${REGION_COLOR[b.region]}"></span>${esc(b.ko)}<small>${esc(b.en)}</small></div></div>`;
  const cap = r.sittingCap;
  const head = `<thead><tr><th>#</th><th class="l">목적지</th><th>거리</th><th class="col-opt">구간 거리</th><th class="col-opt">목표</th><th>항해</th><th>실제 소요</th><th class="col-opt">사이클</th><th>누적 집중</th><th>도착일</th><th>순항 속도</th><th>한 번에</th></tr></thead>`;
  const earth = r.pts[0];
  let body = `<tr><td class="num">0</td><td class="l">${name(earth)}</td><td class="num">0</td><td class="col-opt"></td><td class="col-opt"></td><td colspan="2" class="l muted">출발점</td><td class="col-opt"></td><td colspan="4"></td></tr>`;
  body += r.legs.map((l) => `<tr class="${l.to.kind === 'waypoint' ? 'wp' : ''} ${l.fits ? '' : 'over'}">
    <td class="num">${esc(l.to.no)}</td>
    <td class="l">${name(l.to)}</td>
    <td class="num">${fmtDist(l.to.d)}</td>
    <td class="num col-opt">${fmtDist(l.gap)}</td>
    <td class="num muted col-opt">${l.target ? fmtDur(l.target) : '-'}</td>
    <td class="num">${fmtDur(l.voyage)}</td>
    <td class="num">${fmtDur(l.wall)}<span class="bar-in" style="width:${Math.min(60, (l.wall / cap) * 48).toFixed(1)}px;${l.fits ? '' : 'background:var(--bad)'}"></span></td>
    <td class="num col-opt">${fmtCycles(l.cycles)}</td>
    <td class="num" data-tip="누적 실제(휴식 포함) ${fmtDur(l.cumWall)}">${fmtDur(l.cumFocus)}</td>
    <td class="num">${l.day.toLocaleString()}일째</td>
    <td class="num">${l.warpUp && r.p.model === 'warp' ? '<span class="up">▲</span> ' : ''}${fmtSpeed(l.cruise)}</td>
    <td>${l.fits ? '<span class="pill ok">가능</span>' : '<span class="pill bad">불가</span>'}</td></tr>`).join('');
  $('#table').innerHTML = head + `<tbody>${body}</tbody>`;
}

// ─── 밸런스 기록 (docs/design/freeze/balance/{version}) ──────────────────
let FROZEN = []; // 서버에서 받은 기록 목록
let API = 'unknown'; // 'ok' | 'off'
let FROZEN_DIR = 'docs/design/freeze/balance';

async function loadFrozen() {
  try {
    const res = await fetch('api/balance', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    FROZEN = j.versions || [];
    FROZEN_DIR = j.dir || FROZEN_DIR;
    API = 'ok';
  } catch {
    API = 'off';
  }
  renderFrozen();
}

const matchFrozen = () => FROZEN.filter((v) => sameBalance({ ...DEFAULTS, ...v.params }, P));

function renderFrozen() {
  const same = matchFrozen();
  const badge = $('#frozenBadge');
  badge.hidden = same.length === 0;
  badge.textContent = same.length ? `${same.map((v) => v.version).join(', ')} 기록과 같음` : '';
  $('#frozenDir').textContent = `${FROZEN_DIR}/{version}`;
  const list = $('#frozenList');
  if (API === 'off') {
    list.innerHTML = `<p class="frozen-empty">기록 기능은 로컬 서버에서만 동작한다. <code>node scripts/serve.mjs</code>로 실행한다.</p>`;
    $('#btnFreeze').title = 'node scripts/serve.mjs로 실행해야 기록할 수 있다';
    return;
  }
  $('#btnFreeze').title = '';
  if (!FROZEN.length) {
    list.innerHTML = `<p class="frozen-empty">아직 기록이 없다. 밸런스가 정해지면 상단의 <b>밸런스 기록</b>을 누른다.</p>`;
    return;
  }
  list.innerHTML = [...FROZEN].reverse().map((v) => `<div class="frozen-row ${same.includes(v) ? 'current' : ''}">
    <span class="ver">${esc(v.version)}</span>
    <div class="meta"><b>${esc(v.modelName)}</b> · 체크 ${esc(v.checksPassed)} · ${v.days}일 완주 · 집중 ${fmtDur(v.focusMin)} · 최장 ${fmtDur(v.maxLegWallMin)} · ${esc(v.frozenAt.slice(0, 10))}
      <div class="memo" title="${esc(v.memo || '')}">${v.memo ? esc(v.memo.split('\n')[0]) : '<span class="muted">메모 없음</span>'}</div>
      <div class="muted small mono">${esc(v.path)}/</div></div>
    <button class="btn" type="button" data-load="${esc(v.version)}">${same.includes(v) ? '현재 설정' : '불러오기'}</button></div>`).join('');
}

function freezeSummary() {
  const ok = R.checks.filter((c) => c.ok).length;
  const fails = R.checks.filter((c) => !c.ok);
  const same = matchFrozen();
  $('#freezeSum').innerHTML = [
    `<div><b>${esc(MODELS[P.model].name)}</b> · 체크 <b style="color:${fails.length ? 'var(--warn)' : 'var(--ok)'}">${ok}/${R.checks.length}</b> · ${R.totals.days}일 완주 · 집중 ${fmtDur(R.totals.focus)} · 최장 구간 ${fmtDur(R.totals.maxLeg.wall)}</div>`,
    ...fails.map((c) => `<div class="warn">FAIL · ${esc(c.label)} (${esc(c.value)})</div>`),
    same.length ? `<div class="warn">이미 ${same.map((v) => v.version).join(', ')}에 같은 밸런스가 기록돼 있다.</div>` : '',
  ].join('');
  const v = $('#freezeVersion').value.trim();
  $('#freezePath').textContent = `${FROZEN_DIR}/${VERSION_RE.test(v) ? v : '{version}'}/`;
}

function openFreeze() {
  if (API !== 'ok') { toast('기록하려면 node scripts/serve.mjs로 실행해야 합니다'); return; }
  $('#freezeVersion').value = nextVersion(FROZEN.map((v) => v.version));
  $('#freezeMemo').value = '';
  $('#freezeErr').hidden = true;
  freezeSummary();
  $('#freezeDlg').showModal();
  $('#freezeMemo').focus();
}

async function submitFreeze(e) {
  e.preventDefault();
  const version = $('#freezeVersion').value.trim();
  const err = $('#freezeErr');
  const showErr = (m) => { err.textContent = m; err.hidden = false; };
  if (!VERSION_RE.test(version)) return showErr('버전 형식은 v1, v1.1, v1.2.3 입니다.');
  if (FROZEN.some((v) => v.version === version)) return showErr(`${version}은(는) 이미 있습니다. 다른 버전을 입력하세요.`);
  const btn = $('#freezeSubmit');
  btn.disabled = true;
  try {
    const res = await fetch('api/balance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, memo: $('#freezeMemo').value, params: P }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return showErr(j.error || `기록 실패 (${res.status})`);
    $('#freezeDlg').close();
    toast(`${j.path}/ 에 기록했습니다`);
    await loadFrozen();
  } catch {
    showErr('서버에 연결할 수 없습니다.');
  } finally {
    btn.disabled = false;
  }
}

function setupFreeze() {
  $('#btnFreeze').addEventListener('click', openFreeze);
  $('#freezeForm').addEventListener('submit', submitFreeze);
  $('#freezeCancel').addEventListener('click', () => $('#freezeDlg').close());
  $('#freezeVersion').addEventListener('input', freezeSummary);
  $('#frozenList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-load]');
    if (!b) return;
    const v = FROZEN.find((x) => x.version === b.dataset.load);
    if (!v) return;
    P = { ...DEFAULTS, ...v.params };
    update();
    toast(`${v.version} 밸런스를 불러왔습니다`);
  });
  loadFrozen();
}

// ─── 공통 ────────────────────────────────────────────────
function update() {
  saveParams();
  syncControls();
  R = simulate(BODIES, P);
  $('#bodyCount').textContent = BODIES.filter((b) => b.kind !== 'origin' && b.kind !== 'waypoint').length;
  renderKPIs(R);
  renderChecks(R);
  renderCharts();
  renderCalcs(R);
  renderCompare();
  renderTable(R);
  renderFrozen();
}
function renderCharts() { chartLegs(R); chartReach(R); chartSpeed(R); }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 1600);
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('복사 실패 · 주소창을 직접 복사하세요'); }
}

function setupTooltip() {
  const tip = $('#tip');
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  });
}

function init() {
  if (matchMedia('(max-width: 900px)').matches) $('#panel').open = false;
  buildControls();
  setupCalcs();
  setupTooltip();
  setupFreeze();
  $('#cmp').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-model]');
    if (tr) { P.model = tr.dataset.model; update(); }
  });
  $('#btnReset').addEventListener('click', () => { P = { ...DEFAULTS }; update(); toast('추천 밸런스로 되돌렸습니다'); });
  $('#btnLink').addEventListener('click', () => copy(location.href, '설정 링크를 복사했습니다'));
  $('#btnJson').addEventListener('click', () => {
    const out = {
      params: P,
      totals: { focusMin: +R.totals.focus.toFixed(1), wallMin: +R.totals.wall.toFixed(1), days: R.totals.days },
      legs: R.legs.map((l) => ({
        to: l.to.en, distanceLy: l.to.d, voyageMin: +l.voyage.toFixed(2), wallMin: +l.wall.toFixed(2),
        cruiseLyPerHour: l.cruise, cruiseC: +(l.cruise * C_PER_LYH).toPrecision(4), warpUp: l.warpUp, day: l.day,
      })),
    };
    copy(JSON.stringify(out, null, 2), '밸런스 JSON을 복사했습니다');
  });
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderCharts, 120); });
  update();
}

init();
