// Focus Astro · 설정(이륙) UI PoC
//   카드 슬라이드: scroller.js (영상 슬라이드인터페이스.mov 의 움직임 재현)
//   카드 데이터: data/planets.js (docs/design/refs/planet/README.md 에서 자동 생성)
// URL: ?frame=0|1  ?sb=1  ?debug=1  ?sel=<index>
import { PLANETS } from './data/planets.js';
import { Scroller } from './scroller.js';

const q = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const root = document.documentElement;

/* ---------- 목업 배율 ---------- */
function fit() {
  if (root.dataset.mode !== 'mockup') return;
  const s = Math.min(1, (innerHeight - 40) / 924, (innerWidth - 40) / 425.5);
  root.style.setProperty('--s', s.toFixed(4));
}
addEventListener('resize', fit); fit();
const scaleOf = (el) => el.getBoundingClientRect().width / el.offsetWidth || 1;

/* ---------- 포맷 ---------- */
const fmtMin = (m) => {
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60), r = m % 60;
  return h < 100 ? `${h}시간${r ? ` ${r}분` : ''}` : `${h.toLocaleString('ko-KR')}시간`;
};

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 1800);
}

/* =========================================================
   카드
   ========================================================= */
const CARD_W = 168, GAP = 10, PITCH = CARD_W + GAP;
const track = $('#cardsTrack');
const cardsEl = $('#cards');
const cards = PLANETS.map((d, i) => {
  const c = document.createElement('div');
  c.className = 'card'; c.dataset.i = i;
  c.setAttribute('role', 'button'); c.setAttribute('aria-label', `${d.name}, ${d.dist}, 집중 ${fmtMin(d.min)}`);
  c.innerHTML = `<span class="c-top"><img class="thumb" src="${d.img}" alt="" draggable="false" loading="${Math.abs(i - 1) < 6 ? 'eager' : 'lazy'}"><b class="badge"><svg class="i-rocket"><use href="#i-rocket"/></svg>${d.code}</b></span>`
    + `<span class="nm${d.name.length > 9 ? ' long' : ''}">${d.name}</span><span class="en">${d.en} · ${d.kind}</span>`
    + `<span class="note">${d.note}</span>`
    + `<span class="c-rows"><span class="row"><i>거리</i><b>${d.dist}</b></span><span class="row"><i>집중</i><b>${fmtMin(d.min)}</b></span></span>`;
  track.appendChild(c);
  return c;
});
const offsetOf = (i) => i * PITCH;

const dbg = $('#debug');
const scroller = new Scroller({
  el: cardsEl,
  max: () => offsetOf(PLANETS.length - 1),
  width: () => cardsEl.offsetWidth,
  scale: () => scaleOf(cardsEl),
  render: (x) => {
    track.style.transform = `translate3d(${-(CARD_W / 2) - x}px,0,0)`;
    if (root.dataset.debug === '1') dbg.textContent = `x ${x.toFixed(1)}  v ${(scroller?.v ?? 0).toFixed(3)} px/ms  ${scroller?.mode ?? ''}`;
  },
  on: {
    // 손가락이 머문 카드만 하이라이트(영상: 짧은 지연 뒤 파랗게, 드래그가 시작되면 페이드 아웃)
    press(target) { clearTimeout(pressT); if (target) pressT = setTimeout(() => target.classList.add('is-press'), 70); pressEl = target; },
    dragStart() { clearPress(); },
    release() { clearTimeout(pressT); const el = pressEl; if (el && !el.classList.contains('is-press')) el.classList.add('is-press'); setTimeout(() => el?.classList.remove('is-press'), 110); pressEl = null; },
    tap(target) { if (target) select(+target.dataset.i, true); },
  },
});
let pressT, pressEl = null;
function clearPress() { clearTimeout(pressT); pressEl?.classList.remove('is-press'); pressEl = null; }

/* =========================================================
   눈금자: 목적지마다 큰 눈금 하나(128px 간격, 사이 5칸)
   시안처럼 금성 30분 · 화성 1시간 · 수성 1시간 30분이 128px 간격으로 놓인다.
   ========================================================= */
const RULER_GAP = 128, SUB = 6;
const rTrack = $('#rulerTrack');
const labels = [];
// 첫/마지막 목적지 바깥에도 작은 눈금을 이어 그려 끝이 잘려 보이지 않게 한다(마스크로 페이드)
for (let k = 1; k < SUB; k++) {
  for (const at of [-k, (PLANETS.length - 1) * SUB + k]) {
    const t = document.createElement('i');
    t.className = 'tick' + (k === SUB / 2 ? ' mid' : '');
    t.style.left = `${(at * RULER_GAP) / SUB}px`;
    rTrack.appendChild(t);
  }
}
for (let i = 0; i < PLANETS.length; i++) {
  for (let k = 0; k < SUB; k++) {
    if (i === PLANETS.length - 1 && k > 0) break;
    const t = document.createElement('i');
    t.className = 'tick' + (k === 0 ? ' major' : k === SUB / 2 ? ' mid' : '');
    t.style.left = `${i * RULER_GAP + (k * RULER_GAP) / SUB}px`;
    rTrack.appendChild(t);
  }
  const l = document.createElement('span');
  l.className = 'tick-label'; l.textContent = fmtMin(PLANETS[i].min);
  l.style.left = `${i * RULER_GAP}px`;
  rTrack.appendChild(l); labels.push(l);
}
let rulerPos = 0; // 눈금자 위치(목적지 index 단위, 실수)
function setRuler(pos, animate) {
  rulerPos = Math.max(0, Math.min(PLANETS.length - 1, pos));
  rTrack.style.transition = animate ? 'transform .45s cubic-bezier(.22,1,.36,1)' : 'none';
  rTrack.style.transform = `translate3d(${-rulerPos * RULER_GAP}px,0,0)`;
  const on = Math.round(rulerPos);
  labels.forEach((l, i) => l.classList.toggle('is-on', i === on));
  const r = $('#ruler');
  r.setAttribute('aria-valuemin', 0); r.setAttribute('aria-valuemax', PLANETS.length - 1);
  r.setAttribute('aria-valuenow', on); r.setAttribute('aria-valuetext', `${PLANETS[on].name} · ${fmtMin(PLANETS[on].min)}`);
}

/* =========================================================
   선택
   ========================================================= */
let sel = -1;
function select(i, animate = true, { ruler = true, scroll = true } = {}) {
  i = Math.max(0, Math.min(PLANETS.length - 1, i));
  if (i !== sel) {
    cards[sel]?.classList.remove('is-sel'); cards[i].classList.add('is-sel'); sel = i;
    if (animate) navigator.vibrate?.(6);
  }
  if (ruler) setRuler(i, animate);
  if (scroll) animate ? scroller.animateTo(offsetOf(i)) : scroller.set(offsetOf(i));
}

/* 눈금자 드래그 → 가장 가까운 목적지를 실시간 선택, 카드 줄도 따라간다 */
const rulerEl = $('#ruler');
let rd = null;
rulerEl.addEventListener('pointerdown', (e) => { rd = { x: e.clientX, p: rulerPos, s: scaleOf(rulerEl) }; rulerEl.setPointerCapture(e.pointerId); });
rulerEl.addEventListener('pointermove', (e) => {
  if (!rd) return;
  setRuler(rd.p - (e.clientX - rd.x) / rd.s / RULER_GAP, false);
  const i = Math.round(rulerPos);
  if (i !== sel) select(i, true, { ruler: false });
});
const rulerEnd = () => { if (!rd) return; rd = null; select(Math.round(rulerPos), true); };
rulerEl.addEventListener('pointerup', rulerEnd); rulerEl.addEventListener('pointercancel', rulerEnd);
const keyNav = (e) => {
  if (e.key === 'ArrowRight') { select(sel + 1); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { select(sel - 1); e.preventDefault(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target === cardsEl) { depart(); e.preventDefault(); }
};
rulerEl.addEventListener('keydown', keyNav);
cardsEl.addEventListener('keydown', keyNav);

/* ---------- 헤더 / 버튼 ---------- */
$('#backBtn').addEventListener('click', () => toast('PoC: 메인 화면은 없습니다'));
$('#searchBtn').addEventListener('click', () => toast('PoC: 검색은 준비 중입니다'));
$('#shuffleBtn').addEventListener('click', () => {
  let j; do j = Math.floor(Math.random() * PLANETS.length); while (j === sel && PLANETS.length > 1);
  select(j);
});
function depart() { const d = PLANETS[sel]; toast(`${d.name}(으)로 출항 · 집중 ${fmtMin(d.min)}`); }
$('#departBtn').addEventListener('click', depart);

/* ---------- 시작 ---------- */
const start = Number.isFinite(+q.get('sel')) && q.get('sel') !== null ? +q.get('sel') : 1; // 시안: 화성
select(start, false);

window.__setup = { scroller, PLANETS, select, offsetOf, get sel() { return sel; } };
