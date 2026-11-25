// Focus Astro · UI Clone
// 화면: 메인(첫 화면) → 이륙(목적지 설정) → 출항(집중/휴식)
// URL 파라미터
//   ?screen=main|takeoff|focus|rest  시작 화면
//   ?demo=1     시안과 같은 값으로 고정(타이머 정지) — 스크린샷 비교용
//   ?speed=60   시간 배속(데모용)
//   ?frame=0|1  전체 화면 / 목업,  ?sb=1 가상 상태 표시줄,  ?still=1 애니메이션 정지

const q = new URLSearchParams(location.search);
const DEMO = q.get('demo') === '1';
const SPEED = Math.max(1, Number(q.get('speed')) || 1);
const $ = (s, el = document) => el.querySelector(s);

/* ---------- 목업 배율 ---------- */
function fit() {
  if (document.documentElement.dataset.mode !== 'mockup') return;
  const s = Math.min(1, (innerHeight - 40) / 924, (innerWidth - 40) / 425.5);
  document.documentElement.style.setProperty('--s', s.toFixed(4));
}
addEventListener('resize', fit); fit();

/* ---------- 데이터 ---------- */
// 시간 = 목표 집중 시간(분). 1시간 = 1 항해 단위(시안 기준: 화성 1시간).
const DEST = [
  // map: 393×852 기준 지도 좌표(px), size: 지름(px), subs: 함께 표시되는 위성
  { code: 'VEN', name: '금성', img: 'assets/planets/venus.png', min: 15, au: 0.28, map: [230, 109], size: 40 },
  { code: 'LUN', name: '달', img: 'assets/gen/moon.png', min: 30, au: 0.0026, map: [52, 162], size: 34 },
  { code: 'MRS', name: '화성', img: 'assets/planets/mars.png', min: 60, au: 0.52, map: [280, 308], size: 46, subs: ['PHO', 'DEI'] },
  { code: 'JUP', name: '목성', img: 'assets/planets/jupiter.png', min: 90, au: 4.2, map: [65, 409], size: 54 },
  { code: 'SAT', name: '토성', img: 'assets/planets/saturn.png', min: 120, au: 8.54, map: [255, 384], size: 88, wide: true },
  { code: 'CER', name: '세레스', img: 'assets/gen/ceres.png', min: 150, au: 1.77, map: [335, 170], size: 28 },
];
const SET_MIN = 30;   // 집중 1세트
const REST_MIN = 10;  // 세트 사이 휴식

const fmtMin = (m) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`);
const fmtAU = (au) => (au < 0.01 ? `${(au * 149597870.7 / 1e4).toFixed(1)}만 km` : `${au.toFixed(2)} AU`);
const pad = (n) => String(n).padStart(2, '0');
const clock = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; };

/* ---------- 상태 ---------- */
const state = { view: 'main', dest: DEST[2], todayMin: 0, place: '지구' };

/* ---------- 토스트 ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2200);
}

/* ---------- 라우팅 ---------- */
function show(view) {
  state.view = view;
  $('#app').dataset.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
  if (view === 'takeoff') requestAnimationFrame(layoutRoute);
}

/* =========================================================
   메인
   ========================================================= */
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? '고요한 밤입니다!' : h < 11 ? '좋은 아침입니다!' : h < 17 ? '좋은 오후입니다!' : '좋은 저녁입니다!';
}
function renderMain() {
  $('#greet').textContent = DEMO ? '좋은 저녁입니다!' : greeting();
  $('#place').textContent = state.place;
  $('#todayText').textContent = `오늘 집중 ${fmtMin(state.todayMin).replace('0분', '0분')}`;
}
$('#toTakeoff').addEventListener('click', () => show('takeoff'));
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => { x.classList.toggle('is-active', x === t); x.setAttribute('aria-selected', x === t); });
  if (t !== document.querySelector('.tab')) toast('준비 중인 기능입니다');
}));

/* =========================================================
   이륙: 궤도 지도 + 거리 슬라이드 + 목적지 카드
   ========================================================= */
const map = $('#orbitMap');
const nodes = DEST.map((d) => {
  const n = document.createElement('button');
  n.type = 'button'; n.className = 'node'; n.dataset.code = d.code; n.setAttribute('aria-label', `${d.name} ${fmtMin(d.min)}`);
  n.style.left = `${d.map[0]}px`; n.style.top = `${d.map[1]}px`;
  const w = d.size, h = d.wide ? d.size * 0.4 : d.size;
  const ico = '<svg class="i-rocket"><use href="#i-rocket"/></svg>';
  n.innerHTML = `<img src="${d.img}" alt="" style="width:${w}px;height:${h}px">`
    + `<span class="tag" style="left:${d.wide ? 6 : w * 0.3}px;top:${d.wide ? 6 : h * 0.18}px">${ico}${d.code}</span>`
    + (d.subs || []).map((c, k) => `<span class="tag sub" style="left:${w * 0.55}px;top:${-h * 0.62 + k * 14}px">${ico}${c}</span>`).join('');
  n.addEventListener('click', () => select(d, true));
  map.appendChild(n);
  return n;
});

const HOME = [157, 284];
function layoutRoute() {
  const [x1, y1] = HOME, [x2, y2] = state.dest.map;
  const L = $('#routeLine');
  L.setAttribute('x1', x1); L.setAttribute('y1', y1); L.setAttribute('x2', x2); L.setAttribute('y2', y2);
}
addEventListener('resize', layoutRoute);

/* 눈금자: 5분 = 23.5px, 15분 ~ 150분 */
const PX_PER_MIN = 128 / 30;
const MIN_MIN = 15, MAX_MIN = 150;
const track = $('#rulerTrack');
for (let m = 0; m <= 180; m += 5) {
  const t = document.createElement('i');
  t.className = 'tick' + (m % 30 === 0 ? ' major' : m % 15 === 0 ? ' mid' : '');
  t.style.left = `${m * PX_PER_MIN}px`;
  track.appendChild(t);
  if (m % 30 === 0 && m > 0) {
    const l = document.createElement('span');
    l.className = 'tick-label'; l.dataset.min = m; l.textContent = fmtMin(m);
    l.style.left = `${m * PX_PER_MIN}px`;
    track.appendChild(l);
  }
}
let rulerMin = 60;
function setRuler(min, animate) {
  rulerMin = Math.min(MAX_MIN, Math.max(MIN_MIN, min));
  track.style.transition = animate ? 'transform .45s cubic-bezier(.22,1,.36,1)' : 'none';
  track.style.transform = `translateX(${-rulerMin * PX_PER_MIN}px)`;
  $('#ruler').setAttribute('aria-valuenow', Math.round(rulerMin));
  $('#ruler').setAttribute('aria-valuetext', fmtMin(Math.round(rulerMin / 5) * 5));
  track.querySelectorAll('.tick-label').forEach((l) => l.classList.toggle('is-on', Math.abs(+l.dataset.min - rulerMin) < 7.5));
}
const nearest = (min) => DEST.reduce((a, b) => (Math.abs(b.min - min) < Math.abs(a.min - min) ? b : a));

/* 카드 */
const cardsTrack = $('#cardsTrack');
const CARD_W = 92, GAP = 8;
const cards = DEST.map((d) => {
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'card';
  c.innerHTML = `<b class="badge"><svg class="i-rocket"><use href="#i-rocket"/></svg>${d.code}</b><span class="nm">${d.name}</span><span class="tm">${fmtMin(d.min)}</span>`;
  c.addEventListener('click', () => { if (!cardDrag.moved) select(d, true); });
  cardsTrack.appendChild(c);
  return c;
});
function cardsTo(i, px = 0) {
  cardsTrack.style.transform = `translateX(${-(i * (CARD_W + GAP) + CARD_W / 2) + px}px)`;
}

function select(d, moveRuler) {
  state.dest = d;
  const i = DEST.indexOf(d);
  nodes.forEach((n, k) => n.classList.toggle('is-sel', k === i));
  cards.forEach((c, k) => { c.classList.toggle('is-sel', k === i); c.classList.toggle('far', Math.abs(k - i) > 1); });
  cardsTo(i);
  if (moveRuler) setRuler(d.min, true);
  layoutRoute();
}

/* 눈금자 드래그 */
const ruler = $('#ruler');
let rd = null;
ruler.addEventListener('pointerdown', (e) => { rd = { x: e.clientX, m: rulerMin, s: ruler.getBoundingClientRect().width / ruler.offsetWidth }; ruler.setPointerCapture(e.pointerId); });
ruler.addEventListener('pointermove', (e) => {
  if (!rd) return;
  setRuler(rd.m - (e.clientX - rd.x) / rd.s / PX_PER_MIN, false);
  const d = nearest(rulerMin);
  if (d !== state.dest) { select(d, false); navigator.vibrate?.(6); }
});
const rulerEnd = () => { if (!rd) return; rd = null; select(nearest(rulerMin), true); };
ruler.addEventListener('pointerup', rulerEnd); ruler.addEventListener('pointercancel', rulerEnd);
ruler.addEventListener('keydown', (e) => {
  const i = DEST.indexOf(state.dest);
  if (e.key === 'ArrowRight' && i < DEST.length - 1) select(DEST[i + 1], true);
  if (e.key === 'ArrowLeft' && i > 0) select(DEST[i - 1], true);
});

/* 카드 스와이프 */
const cardDrag = { x: 0, on: false, moved: false, s: 1 };
const cardsEl = $('#cards');
cardsEl.addEventListener('pointerdown', (e) => { Object.assign(cardDrag, { x: e.clientX, on: true, moved: false, s: cardsEl.getBoundingClientRect().width / cardsEl.offsetWidth }); });
cardsEl.addEventListener('pointermove', (e) => {
  if (!cardDrag.on) return;
  const dx = (e.clientX - cardDrag.x) / cardDrag.s;
  if (Math.abs(dx) > 6 && !cardDrag.moved) { cardDrag.moved = true; cardsEl.setPointerCapture(e.pointerId); cardsTrack.classList.add('dragging'); }
  if (cardDrag.moved) cardsTo(DEST.indexOf(state.dest), dx);
});
const cardEnd = (e) => {
  if (!cardDrag.on) return;
  cardDrag.on = false; cardsTrack.classList.remove('dragging');
  if (!cardDrag.moved) return;
  const dx = (e.clientX - cardDrag.x) / cardDrag.s;
  const i = DEST.indexOf(state.dest);
  const j = Math.min(DEST.length - 1, Math.max(0, i - Math.round(dx / (CARD_W + GAP))));
  select(DEST[j], true);
  setTimeout(() => { cardDrag.moved = false; }, 0);
};
cardsEl.addEventListener('pointerup', cardEnd); cardsEl.addEventListener('pointercancel', cardEnd);

$('#backBtn').addEventListener('click', () => show('main'));
$('#shuffleBtn').addEventListener('click', () => {
  const pool = DEST.filter((d) => d !== state.dest);
  select(pool[Math.floor(Math.random() * pool.length)], true);
});
$('#departBtn').addEventListener('click', () => startVoyage(state.dest));

/* =========================================================
   출항: 집중 / 휴식 (포모도로)
   ========================================================= */
const flight = $('.v-flight');
const voyage = { dest: null, sets: 1, set: 1, phase: 'focus', left: 0, focusDone: 0, ahead: 128, last: 0, raf: 0 };

function setLen(v, s) { return Math.min(SET_MIN, v.dest.min - (s - 1) * SET_MIN) * 60; }

function startVoyage(d, opts = {}) {
  Object.assign(voyage, { dest: d, sets: Math.ceil(d.min / SET_MIN), set: 1, phase: 'focus', focusDone: 0, ahead: 128 + Math.floor(Math.random() * 40) });
  voyage.left = setLen(voyage, 1);
  Object.assign(voyage, opts);
  $('#rcToName').textContent = d.name; $('#rcToCode').textContent = d.code;
  show('flight');
  renderFlight();
  cancelAnimationFrame(voyage.raf);
  voyage.last = performance.now();
  if (!DEMO) voyage.raf = requestAnimationFrame(tick);
}

function tick(now) {
  const dt = ((now - voyage.last) / 1000) * SPEED;
  voyage.last = now;
  voyage.left -= dt;
  if (voyage.phase === 'focus') voyage.focusDone += dt;
  if (voyage.left <= 0) nextPhase();
  if (state.view === 'flight') { renderFlight(); voyage.raf = requestAnimationFrame(tick); }
}

function nextPhase() {
  if (voyage.phase === 'focus') {
    voyage.focusDone = Math.min(voyage.focusDone, voyage.set * SET_MIN * 60);
    if (voyage.set >= voyage.sets) return arrive();
    voyage.phase = 'rest'; voyage.left = REST_MIN * 60;
    toast('휴식 시간 · 우주선이 정지합니다');
  } else {
    voyage.set += 1; voyage.phase = 'focus'; voyage.left = setLen(voyage, voyage.set);
    toast(`집중 ${voyage.set}/${voyage.sets} 세트 시작`);
  }
}

function arrive() {
  cancelAnimationFrame(voyage.raf);
  state.todayMin += voyage.dest.min;
  state.place = voyage.dest.name;
  renderMain();
  show('main');
  toast(`${voyage.dest.name} 도착! 오늘 ${fmtMin(state.todayMin)} 집중했어요`);
}

let lastChip = '';
function renderFlight() {
  const v = voyage, d = v.dest, rest = v.phase === 'rest';
  flight.dataset.phase = v.phase;
  const p = Math.min(1, v.focusDone / (d.min * 60));
  $('#flKicker').textContent = rest ? '휴식 중 · 우주선 정지' : `${d.name}까지 항해 중`;
  $('#flTimer').textContent = clock(v.left);
  $('#flSub').textContent = rest ? `다음 집중 ${v.set + 1}/${v.sets} 세트까지` : `집중 ${v.set}/${v.sets} 세트 · ${setLen(v, v.set) / 60}분 집중`;
  // 앞선 우주선: 진행할수록 줄어든다
  const ahead = Math.max(0, Math.round(v.ahead * (1 - p * 0.9)));
  const chip = rest ? 'rest' : `ahead:${ahead}`;
  if (chip !== lastChip) {
    lastChip = chip;
    $('#flightChip').innerHTML = rest
      ? '<svg class="i-moon"><use href="#i-moon"/></svg><span>포커스 감지 꺼짐</span>'
      : `<svg class="i-rocket"><use href="#i-rocket"/></svg><span>앞선 우주선 ${ahead}척</span>`;
  }
  const pct = `${(p * 100).toFixed(2)}%`;
  $('#rcFill').style.width = pct; $('#rcShip').style.left = pct;
  $('#rcDist').innerHTML = `<b>${fmtAU(d.au * p)}</b> / ${fmtAU(d.au)}`;
  // 다른 우주선 (함께 항해 중인 승무원)
  $('#mateA').textContent = `SoyA · ${fmtAU(d.au * Math.min(1, p + (rest ? 0.02 : 0.04)))}`;
  $('#mateB').textContent = `Min · ${fmtAU(d.au * Math.max(0, p - (rest ? -0.02 : 0.02)))}`;
}

$('#skipRestBtn').addEventListener('click', () => { if (voyage.phase === 'rest') { voyage.left = 0; nextPhase(); renderFlight(); } });
$('#stopBtn').addEventListener('click', () => { $('#confirm').hidden = false; });
$('#cfKeep').addEventListener('click', () => { $('#confirm').hidden = true; });
$('#cfStop').addEventListener('click', () => {
  $('#confirm').hidden = true; cancelAnimationFrame(voyage.raf);
  show('main'); toast('항해를 중단했습니다');
});
// 앱을 벗어나면 실패 (집중 중에만)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.view === 'flight' && voyage.phase === 'focus' && !DEMO && q.get('strict') === '1') {
    cancelAnimationFrame(voyage.raf); show('main'); toast('앱을 벗어나 항해가 실패했습니다');
  }
});

/* 속도선: 집중 중에만 오른쪽→왼쪽으로 흐르는 빛줄기 */
const cv = $('#streaks'), cx = cv.getContext('2d');
let W = 0, H = 0, lines = [];
function sizeCanvas() {
  const dpr = Math.min(3, devicePixelRatio || 1);
  W = cv.offsetWidth; H = cv.offsetHeight;
  cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lines = Array.from({ length: 80 }, () => spawn(true));
}
// 30%는 우주선 높이(엔진 분사 줄기) 근처에 몰아서 속도감을 준다
function spawn(any) {
  const z = Math.random(), wake = Math.random() < 0.3;
  const shipY = H * 0.457;
  const y = wake ? shipY + (Math.random() - 0.5) * 120 : Math.random() * H;
  return { x: any ? Math.random() * W * 1.4 : W + Math.random() * 60, y, len: 70 + z * (wake ? 240 : 170), v: 160 + z * 1000, a: (wake ? 0.14 : 0.06) + z * 0.3, w: z > 0.8 ? 1.3 : 0.8 };
}
let lastS = performance.now();
function drawStreaks(now) {
  const dt = Math.min(0.05, (now - lastS) / 1000); lastS = now;
  if (state.view === 'flight' && flight.dataset.phase === 'focus') {
    cx.clearRect(0, 0, W, H);
    for (const l of lines) {
      if (!DEMO && document.documentElement.dataset.still !== '1') l.x -= l.v * dt;
      if (l.x + l.len < 0) Object.assign(l, spawn(false));
      const g = cx.createLinearGradient(l.x, 0, l.x + l.len, 0);
      g.addColorStop(0, `rgba(190,225,255,${l.a})`); g.addColorStop(1, 'rgba(190,225,255,0)');
      cx.strokeStyle = g; cx.lineWidth = l.w; cx.beginPath(); cx.moveTo(l.x, l.y); cx.lineTo(l.x + l.len, l.y); cx.stroke();
    }
  }
  requestAnimationFrame(drawStreaks);
}
new ResizeObserver(sizeCanvas).observe(cv);
requestAnimationFrame(drawStreaks);

/* =========================================================
   시작
   ========================================================= */
renderMain();
setRuler(60, false);
select(DEST[2], false);

const start = q.get('screen');
if (start === 'takeoff') show('takeoff');
else if (start === 'focus' || start === 'rest') {
  const mars = DEST[2];
  // 시안 값: 집중 24:13 남음(0.05 AU) / 휴식 08:42 남음(0.26 AU)
  if (start === 'focus') startVoyage(mars, DEMO ? { left: 24 * 60 + 13, focusDone: 5 * 60 + 47, ahead: 140 } : {});
  else startVoyage(mars, { phase: 'rest', set: 1, left: 8 * 60 + 42, focusDone: 30 * 60 });
}
