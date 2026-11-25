// Focus Astro · 우주선 대기 PoC
// 1) 목업 배율 (pocs/mockup 과 같음)  2) 배경·행성 무작위 선택과 프리로드  3) 인사말·상태 표시줄 시계

const $ = (sel) => document.querySelector(sel);
const root = document.documentElement;
const app = $('#app');
const params = new URLSearchParams(location.search);

/* 1. 표시 모드 & 배율 ------------------------------------------------ */

const FRAME = { w: 425.5, h: 924 };
const MOBILE_QUERY = '(hover: none) and (pointer: coarse)';
const forced = params.get('frame');

function layout() {
  const mode = forced === '1' ? 'mockup' : forced === '0' ? 'full' : matchMedia(MOBILE_QUERY).matches ? 'full' : 'mockup';
  if (root.dataset.mode !== mode) root.dataset.mode = mode;
  let s = 1;
  if (mode === 'mockup') {
    s = Math.min((innerHeight - 96) / FRAME.h, (innerWidth - 48) / FRAME.w, 1.25);
    s = Math.max(s, 0.35);
  }
  root.style.setProperty('--s', String(s));
  // 프레임 PNG는 목업 모드일 때만 받는다(모바일 전체 화면에서는 불필요한 요청)
  const frame = $('.frame');
  if (mode === 'mockup' && !frame.getAttribute('src')) frame.src = frame.dataset.src;
}
let raf = 0;
const scheduleLayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
addEventListener('resize', scheduleLayout);
visualViewport?.addEventListener('resize', scheduleLayout);
layout();

/* 2. 배경·행성 무작위 선택 ------------------------------------------- */
// ?bg=<우주 파일 이름(확장자 제외)> · ?planet=<행성 id> 로 고정할 수 있다(캡처·비교용).

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const stem = (path) => path.split('/').pop().replace(/\.[^.]+$/, '');

// 로드·디코드가 끝나면 true. 실패하면 false (거부하지 않는다: 두 장을 모두 기다린 뒤 판단하기 위해)
function load(src) {
  return new Promise((resolve) => {
    const img = new Image();
    // onload 뒤의 decode() 거부는 디코드 시점만 못 앞당긴 것이므로 성공으로 본다
    img.onload = () => Promise.resolve(img.decode?.()).catch(() => {}).then(() => resolve(true));
    img.onerror = () => { console.warn(`이미지를 불러오지 못함: ${src}`); resolve(false); };
    img.src = src;
  });
}

let manifest = null;
let current = { space: null, planet: null };
let token = 0; // 연속으로 다시 뽑을 때 늦게 끝난 이전 로드가 덮어쓰지 않게 한다

async function choose({ fixed = false } = {}) {
  const my = ++token;
  const wantBg = fixed && params.get('bg');
  const wantPlanet = fixed && params.get('planet');
  // 다시 뽑을 때는 직전과 다른 것을 고른다
  const spaces = manifest.space.filter((s) => s !== current.space);
  const planets = manifest.planets.filter((p) => p !== current.planet);
  const space = (wantBg && manifest.space.find((s) => stem(s) === wantBg)) || pick(spaces.length ? spaces : manifest.space);
  const planet = (wantPlanet && manifest.planets.find((p) => p.id === wantPlanet)) || pick(planets.length ? planets : manifest.planets);

  app.classList.remove('is-ready');
  // 장면이 페이드아웃되는 동안 두 장을 함께 받아 디코드까지 끝낸 뒤 한 번에 보여준다
  const [okSpace, okPlanet] = await Promise.all([load(space), load(planet.src), new Promise((r) => setTimeout(r, fixed ? 0 : 450))]);
  if (my !== token) return;

  // 하나라도 실패하면 이전 장면을 그대로 다시 보여준다. 첫 로드라면 받은 것만 반영한다(우주선은 항상 보인다)
  const first = !current.planet;
  if (okSpace && (okPlanet || first)) {
    app.style.setProperty('--space-img', `url("${space}")`);
    app.dataset.space = stem(space);
    current.space = space;
  }
  if (okPlanet && (okSpace || first)) {
    app.style.setProperty('--glow', planet.glow);
    $('#planetImg').src = planet.src;
    $('#placeName').textContent = planet.name;
    app.dataset.planet = planet.id;
    current.planet = planet;
  }
  requestAnimationFrame(() => { if (my === token) app.classList.add('is-ready'); });
}

async function init() {
  const res = await fetch('assets/manifest.json');
  manifest = await res.json();
  await choose({ fixed: true });
}

init().catch((err) => {
  console.error(err);
  app.classList.add('is-ready'); // 매니페스트가 없어도 우주선은 보여준다
});

addEventListener('keydown', (e) => {
  // 길게 눌러 생기는 자동 반복은 무시한다(입력마다 이미지 두 장을 새로 받게 된다)
  if ((e.key === 'r' || e.key === 'R') && !e.repeat && !e.metaKey && !e.ctrlKey && manifest) choose();
});

// 휴대폰에는 R 키가 없으므로 행성 이름을 탭해도 다시 뽑는다
$('.place').addEventListener('click', () => { if (manifest) choose(); });

/* 3. 인사말 · 상태 표시줄 시계 --------------------------------------- */

const h = new Date().getHours();
$('#greet').textContent = h < 5 ? '고요한 새벽입니다!' : h < 12 ? '좋은 아침입니다!' : h < 18 ? '좋은 오후입니다!' : '좋은 저녁입니다!';

function tick() {
  const d = new Date();
  $('#sbTime').textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}
tick();
setInterval(tick, 15_000);

// iOS: 핀치·더블탭 확대와 길게 눌러 뜨는 메뉴를 막아 앱처럼 동작하게 한다
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
app.addEventListener('contextmenu', (e) => e.preventDefault());
