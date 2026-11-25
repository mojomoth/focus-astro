// Focus Astro · 웹앱 목업 PoC
// 1) 표시 모드(목업/전체 화면)와 배율  2) 터치 인터랙션  3) 카메라·마이크 권한

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const root = document.documentElement;
const app = $('#app');

/* =========================================================
   1. 표시 모드 & 배율
   ========================================================= */

const FRAME = { w: 425.5, h: 924 };        // 논리 px (원본 851×1848 의 1/2)
// 너비가 아니라 입력 장치로 판별한다: 좁은 데스크톱 창은 목업을 축소해서 보여준다.
const MOBILE_QUERY = '(hover: none) and (pointer: coarse)';
const forced = new URLSearchParams(location.search).get('frame'); // '1' | '0' | null
let scale = 1;

function resolveMode() {
  if (forced === '1') return 'mockup';
  if (forced === '0') return 'full';
  return matchMedia(MOBILE_QUERY).matches ? 'full' : 'mockup';
}

function layout() {
  const mode = resolveMode();
  if (root.dataset.mode !== mode) root.dataset.mode = mode;

  if (mode === 'mockup') {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 세로: 위 여백 + 아래 캡션 영역, 가로: 좌우 여백
    scale = Math.min((vh - 96) / FRAME.h, (vw - 48) / FRAME.w, 1.25);
    scale = Math.max(scale, 0.35);
  } else {
    scale = 1;
  }
  root.style.setProperty('--s', String(scale));
  renderEnv();
}

let layoutRaf = 0;
const scheduleLayout = () => {
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(layout);
};
window.addEventListener('resize', scheduleLayout);
window.visualViewport?.addEventListener('resize', scheduleLayout);
screen.orientation?.addEventListener?.('change', scheduleLayout);

/** 화면 좌표(client) → 앱 내부 논리 좌표. 목업 모드에선 transform scale 을 되돌린다. */
function toLocal(el, e) {
  const r = el.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}

/* =========================================================
   2. 공통 UI: 누름 피드백, 햅틱, 토스트
   ========================================================= */

const PRESSABLE = '.tab, .btn, .fab, .icon-btn';

// 터치에서는 :active 가 늦거나 안 붙는 경우가 있어 pointer 이벤트로 직접 처리한다.
app.addEventListener('pointerdown', (e) => {
  const el = e.target.closest(PRESSABLE);
  if (!el || el.disabled) return;
  el.classList.add('is-pressed');
  const release = () => {
    el.classList.remove('is-pressed');
    el.removeEventListener('pointerup', release);
    el.removeEventListener('pointercancel', release);
    el.removeEventListener('pointerleave', release);
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
});

function haptic(ms = 8) {
  // Android Chrome 만 지원. iOS Safari 는 무시된다.
  try { navigator.vibrate?.(ms); } catch { /* noop */ }
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2200);
}

// iOS Safari: 핀치 줌 / 더블탭 줌 방지 (앱처럼 동작)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
// 길게 눌러 뜨는 컨텍스트 메뉴 방지 (텍스트 선택 영역 제외)
app.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.scroll')) e.preventDefault();
});

/* 인사말 */
(() => {
  const h = new Date().getHours();
  const word = h < 5 ? '고요한 새벽입니다' : h < 12 ? '좋은 아침입니다' : h < 18 ? '좋은 오후입니다' : '좋은 저녁입니다';
  $('#greet').textContent = `${word}, 항해사님`;
})();

/* =========================================================
   3. 탭 내비게이션
   ========================================================= */

app.dataset.view = 'home';

function go(view) {
  if (app.dataset.view === view) return;
  const prev = app.dataset.view;
  app.dataset.view = view;
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
  $$('.tab').forEach((t) => {
    const on = t.dataset.to === view;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  haptic(6);
  if (prev === 'check') stopAllMedia(); // 화면을 떠나면 카메라·마이크를 반드시 끈다
  if (view === 'check') refreshPermissions();
  if (view === 'info') renderEnv();
}

$$('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.to)));

/* =========================================================
   4. 목적지 시트 + 스와이프 캐러셀
   ========================================================= */

// 1시간 집중 = 1광년. 태양계 안은 초 단위로 지나간다.
const LY_SECONDS = 3600;
const DESTS = [
  { name: '해왕성 궤도', dist: '30 AU', ly: 30 / 63241, color: 'radial-gradient(circle at 35% 35%, #9fd4ff, #2f63c9 60%, #0d1d52)', glow: 'rgba(80,140,255,.35)' },
  { name: '헬리오포즈', dist: '120 AU', ly: 120 / 63241, color: 'radial-gradient(circle at 35% 35%, #ffe2a8, #c9733a 55%, #3b1608)', glow: 'rgba(255,170,90,.3)' },
  { name: '오르트 구름', dist: '1.5 광년', ly: 1.5, color: 'radial-gradient(circle at 35% 35%, #e9f4ff, #8aa7c9 50%, #1e2a3e)', glow: 'rgba(200,225,255,.28)' },
  { name: '프록시마 센타우리', dist: '4.25 광년', ly: 4.25, color: 'radial-gradient(circle at 35% 35%, #ffb59a, #e0442a 55%, #4a0b05)', glow: 'rgba(255,90,60,.4)' },
  { name: '알파 센타우리 A', dist: '4.37 광년', ly: 4.37, color: 'radial-gradient(circle at 35% 35%, #fffbe6, #ffd45e 50%, #7a4b06)', glow: 'rgba(255,215,100,.45)' },
  { name: '바너드별', dist: '5.96 광년', ly: 5.96, color: 'radial-gradient(circle at 35% 35%, #ffc6a0, #c2502c 55%, #3a0e05)', glow: 'rgba(255,120,70,.35)' },
  { name: '시리우스 A', dist: '8.6 광년', ly: 8.6, color: 'radial-gradient(circle at 35% 35%, #ffffff, #b9d8ff 45%, #3b63b8)', glow: 'rgba(170,210,255,.55)' },
];
const ITEM_W = 120;

function formatDuration(ly) {
  const sec = Math.round(ly * LY_SECONDS);
  if (sec < 60) return `집중 약 ${sec}초`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `집중 ${h}시간 ${m}분` : `집중 ${m}분`;
}

const track = $('#track');
const carousel = $('#carousel');
track.innerHTML = DESTS.map((d, i) => `
  <div class="dest" data-i="${i}">
    <div class="dest-orb" style="background:${d.color};--glow:${d.glow}"></div>
    <div class="dest-name">${d.name}</div>
  </div>`).join('');
const destEls = $$('.dest', track);

let current = 3;
let dragX = 0;

function renderCarousel(snap = true) {
  track.classList.toggle('is-snapping', snap);
  track.style.transform = `translate3d(${-(current * ITEM_W + ITEM_W / 2) + dragX}px,0,0)`;
  destEls.forEach((el, i) => el.classList.toggle('is-current', i === current));
  const d = DESTS[current];
  $('#destDist').textContent = d.dist;
  $('#destTime').textContent = formatDuration(d.ly);
  carousel.setAttribute('aria-label', `목적지 ${d.name}, ${d.dist}`);
}

function select(i) {
  const next = Math.max(0, Math.min(DESTS.length - 1, i));
  if (next !== current) haptic(5);
  current = next;
  renderCarousel(true);
}

// 가로 스와이프: 방향이 정해지기 전엔 캡처하지 않는다(세로 제스처와 충돌 방지)
(() => {
  let id = null, sx = 0, sy = 0, lastX = 0, lastT = 0, vx = 0, axis = null;

  carousel.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || id !== null) return; // 두 번째 손가락은 무시
    id = e.pointerId; axis = null;
    const p = toLocal(carousel, e);
    sx = lastX = p.x; sy = p.y; lastT = e.timeStamp; vx = 0;
  });

  carousel.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const p = toLocal(carousel, e);
    const dx = p.x - sx, dy = p.y - sy;
    if (!axis) {
      if (Math.hypot(dx, dy) < 6) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'x') carousel.setPointerCapture(id);
    }
    if (axis !== 'x') return;
    const dt = Math.max(1, e.timeStamp - lastT);
    vx = (p.x - lastX) / dt; lastX = p.x; lastT = e.timeStamp;
    // 양 끝에서는 저항감
    const atEdge = (current === 0 && dx > 0) || (current === DESTS.length - 1 && dx < 0);
    dragX = atEdge ? dx * 0.35 : dx;
    renderCarousel(false);
  });

  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (axis === 'x') {
      // 끈 거리만큼 이동하고, 빠른 플릭이면 최소 한 칸은 넘긴다(한 번에 최대 2칸)
      let steps = Math.round(-dragX / ITEM_W);
      if (steps === 0 && Math.abs(vx) > 0.35) steps = vx < 0 ? 1 : -1;
      steps = Math.max(-2, Math.min(2, steps));
      dragX = 0;
      select(current + steps);
    } else if (axis === null) {
      // 탭: 탭한 항목으로 이동
      const hit = e.target.closest?.('.dest');
      if (hit) select(Number(hit.dataset.i));
    }
    axis = null;
  };
  // 취소(시스템 제스처, 캡처 상실)는 선택을 바꾸지 않고 원위치
  const cancel = (e) => {
    if (e.pointerId !== id) return;
    id = null; axis = null; vx = 0; dragX = 0;
    renderCarousel(true);
  };
  carousel.addEventListener('pointerup', end);
  carousel.addEventListener('pointercancel', cancel);
  carousel.addEventListener('lostpointercapture', (e) => { if (axis === 'x') cancel(e); });

  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { select(current + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { select(current - 1); e.preventDefault(); }
  });

  // 데스크톱 트랙패드 가로 스크롤
  let wheelAcc = 0, wheelTimer = 0;
  carousel.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    wheelAcc += e.deltaX;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelAcc = 0; }, 160);
    if (Math.abs(wheelAcc) > 60) { select(current + Math.sign(wheelAcc)); wheelAcc = 0; }
  }, { passive: false });
})();

const sheet = $('#sheet');
const backdrop = $('#sheetBackdrop');
let lastFocus = null;

function openSheet() {
  lastFocus = document.activeElement;
  sheet.hidden = false; backdrop.hidden = false;
  sheet.style.setProperty('--drag', '0px');
  renderCarousel(false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.classList.add('is-open'); backdrop.classList.add('is-open');
    carousel.focus({ preventScroll: true });
  }));
  haptic(12);
}

function closeSheet() {
  sheet.classList.remove('is-open', 'is-dragging'); backdrop.classList.remove('is-open');
  sheet.style.setProperty('--drag', '0px');
  const done = () => { if (!sheet.classList.contains('is-open')) { sheet.hidden = true; backdrop.hidden = true; } };
  sheet.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 500);
  lastFocus?.focus?.({ preventScroll: true });
}

$('#launchBtn').addEventListener('click', openSheet);
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

$('#departBtn').addEventListener('click', () => {
  const d = DESTS[current];
  haptic([10, 40, 18]);
  closeSheet();
  setTimeout(() => toast(`🚀 ${d.name}(으)로 출항 — 항해 화면은 voyage PoC`), 250);
});

// 시트 아래로 끌어 닫기: 그립·제목 영역에서만 시작한다(본문 스크롤/캐러셀과 충돌 방지)
(() => {
  const handle = '.sheet-grip, .sheet-title, .sheet-sub';
  let id = null, sy = 0, dy = 0, lastY = 0, lastT = 0, vy = 0;
  // 시트 자체가 움직이므로 요소 기준 좌표가 아니라 clientY 차이를 배율로 나눈다
  sheet.addEventListener('pointerdown', (e) => {
    if (id !== null || e.button > 0 || !e.target.closest(handle)) return;
    id = e.pointerId; sy = lastY = e.clientY; dy = 0; vy = 0; lastT = e.timeStamp;
    sheet.setPointerCapture(id);
    sheet.classList.add('is-dragging');
  });
  sheet.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    vy = (e.clientY - lastY) / scale / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY; lastT = e.timeStamp;
    dy = (e.clientY - sy) / scale;
    const v = dy < 0 ? dy * 0.2 : dy; // 위로는 고무줄처럼
    sheet.style.setProperty('--drag', `${v}px`);
  });
  const finish = (e, commit) => {
    if (e.pointerId !== id) return;
    id = null;
    sheet.classList.remove('is-dragging');
    if (commit && (dy > 110 || vy > 0.6)) closeSheet();
    else sheet.style.setProperty('--drag', '0px');
  };
  sheet.addEventListener('pointerup', (e) => finish(e, true));
  sheet.addEventListener('pointercancel', (e) => finish(e, false));
})();

/* =========================================================
   5. 카메라 · 마이크 권한
   ========================================================= */

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
const hasMedia = !!navigator.mediaDevices?.getUserMedia;

const LABEL = {
  unknown: '알 수 없음', prompt: '요청 전', granted: '허용됨', denied: '거부됨',
  live: '사용 중', unsupported: '사용 불가', error: '오류',
};

const media = {
  cam: { stream: null, facing: 'user', deviceId: undefined, cams: [], perm: 'unknown', busy: false },
  mic: { stream: null, ctx: null, raf: 0, perm: 'unknown', busy: false },
};

const ui = {
  cam: { state: $('#camState'), hint: $('#camHint'), btn: $('#camBtn') },
  mic: { state: $('#micState'), hint: $('#micHint'), btn: $('#micBtn') },
};

function setState(kind, state, hint) {
  const u = ui[kind];
  u.state.dataset.state = state;
  u.state.textContent = LABEL[state] ?? state;
  if (hint !== undefined) u.hint.textContent = hint;
  const live = !!media[kind].stream;
  u.btn.textContent = live ? (kind === 'cam' ? '카메라 끄기' : '마이크 끄기') : (kind === 'cam' ? '카메라 켜기' : '마이크 켜기');
  u.btn.disabled = !hasMedia || media[kind].busy;
}

function deniedHint() {
  // iframe 에 삽입된 경우엔 부모 페이지의 권한 위임(allow 속성)이 없어도 NotAllowedError 가 난다
  if (window.self !== window.top) return '권한이 거부되었거나, 이 페이지를 감싼 iframe에 allow="camera; microphone" 위임이 없습니다. 단독 탭으로 열어 다시 시도하세요.';
  if (isIOS) return '권한이 거부되었습니다. 주소창의 ‘가가’ › 웹사이트 설정, 또는 설정 › Safari › 카메라/마이크에서 허용한 뒤 새로고침하세요.';
  return '권한이 거부되었습니다. 주소창 왼쪽 사이트 정보(자물쇠) › 권한에서 허용한 뒤 다시 시도하세요.';
}

function errorToState(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return ['denied', deniedHint()];
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return ['error', '사용할 수 있는 장치를 찾지 못했습니다.'];
    case 'NotReadableError':
    case 'TrackStartError':
      return ['error', '다른 앱이나 탭이 장치를 사용 중입니다. 해당 앱을 닫고 다시 시도하세요.'];
    case 'OverconstrainedError':
      return ['error', '요청한 조건(해상도/방향)을 만족하는 장치가 없습니다.'];
    case 'SecurityError':
      return ['unsupported', '보안 정책(HTTPS, iframe allow 속성)으로 차단되었습니다.'];
    case 'AbortError':
      return ['error', '장치 시작이 중단되었습니다. 다시 시도하세요.'];
    default:
      return ['error', err?.message || '알 수 없는 오류'];
  }
}

const permStatus = {};
async function queryPermission(kind) {
  const name = kind === 'cam' ? 'camera' : 'microphone';
  try {
    if (!permStatus[kind]) {
      permStatus[kind] = await navigator.permissions.query({ name });
      permStatus[kind].addEventListener('change', () => {
        media[kind].perm = permStatus[kind].state;
        if (!media[kind].stream) setState(kind, media[kind].perm, media[kind].perm === 'denied' ? deniedHint() : '');
      });
    }
    return permStatus[kind].state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown'; // Firefox(카메라), 구형 Safari 등 Permissions API 미지원
  }
}

async function refreshPermissions() {
  const insecure = !window.isSecureContext;
  $('#secureNotice').hidden = !insecure;
  $('#originText').textContent = location.origin;

  for (const kind of ['cam', 'mic']) {
    if (!hasMedia) {
      setState(kind, 'unsupported', insecure ? 'HTTPS가 아니어서 API가 노출되지 않습니다.' : '이 브라우저는 getUserMedia를 지원하지 않습니다.');
      continue;
    }
    if (media[kind].stream) { setState(kind, 'live'); continue; }
    const p = await queryPermission(kind);
    media[kind].perm = p;
    const hint = p === 'denied' ? deniedHint()
      : p === 'prompt' || p === 'unknown' ? '버튼을 누르면 브라우저가 권한을 요청합니다.'
      : '';
    setState(kind, p, hint);
  }
}

/* --- 공통: 요청 세대(generation) ---
   권한 팝업·장치 시작은 수 초가 걸릴 수 있다. 그 사이 탭 이동/백그라운드/끄기를 하면 세대를 올리고,
   각 await 뒤에 세대가 바뀌었으면 늦게 도착한 스트림을 즉시 정지한다. */
const gen = { cam: 0, mic: 0 };
const stopTracks = (s) => s?.getTracks().forEach((t) => t.stop());

/* --- 카메라 --- */
const video = $('#camVideo');
const preview = $('#camPreview');
const flipBtn = $('#camFlip');

async function startCam(deviceId) {
  const m = media.cam;
  if (m.busy || m.stream) return; // 연타 방지
  const my = ++gen.cam;
  m.busy = true; setState('cam', 'prompt', '권한을 요청하는 중…');
  let stream = null;
  try {
    const size = { width: { ideal: 1280 }, height: { ideal: 960 } };
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: m.facing }, ...size },
    });
    if (my !== gen.cam) { stopTracks(stream); return; }
    m.stream = stream;
    video.srcObject = stream;
    // iOS: playsinline + muted 가 있어야 전체 화면 전환 없이 재생된다.
    await video.play().catch(() => {});
    if (my !== gen.cam) return; // stopCam 이 이미 정리함

    const track = stream.getVideoTracks()[0];
    const st = track.getSettings?.() ?? {};
    m.deviceId = st.deviceId;
    if (st.facingMode) m.facing = st.facingMode;
    // 방향 정보가 없는 웹캠은 사용자 쪽으로 보고 거울 모드
    preview.dataset.facing = st.facingMode || 'user';
    preview.classList.add('is-live');
    track.addEventListener('ended', () => { if (m.stream === stream) stopCam('카메라가 다른 앱이나 시스템에 의해 중단되었습니다.'); });

    // 권한을 얻은 뒤에야 장치 목록(deviceId/label)이 정확하다.
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    if (my !== gen.cam) return;
    m.cams = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
    flipBtn.hidden = m.cams.length < 2;

    m.busy = false;
    m.perm = 'granted';
    setState('cam', 'live', `${track.label || '카메라'} · ${st.width ?? '?'}×${st.height ?? '?'}`);
    haptic(10);
  } catch (err) {
    if (my !== gen.cam) { stopTracks(stream); return; }
    stopTracks(stream);
    m.stream = null; video.srcObject = null; preview.classList.remove('is-live');
    m.busy = false;
    const [state, hint] = errorToState(err);
    if (state === 'denied') m.perm = 'denied';
    setState('cam', state, hint);
  }
}

function stopCam(hint = '') {
  const m = media.cam;
  gen.cam++;            // 진행 중인 요청 무효화
  m.busy = false;
  stopTracks(m.stream);
  m.stream = null;
  video.srcObject = null;
  preview.classList.remove('is-live');
  flipBtn.hidden = true;
  setState('cam', m.perm, hint);
}

$('#camBtn').addEventListener('click', () => (media.cam.stream ? stopCam() : startCam()));
flipBtn.addEventListener('click', async () => {
  const m = media.cam;
  if (m.busy) return;
  // facingMode 만 바꾸면 방향 정보가 없는 웹캠에서 같은 장치가 다시 잡힌다 → 다음 deviceId 를 명시
  const ids = (m.cams ?? []).map((d) => d.deviceId);
  const next = ids.length > 1 ? ids[(ids.indexOf(m.deviceId) + 1) % ids.length] : undefined;
  if (!next) m.facing = m.facing === 'user' ? 'environment' : 'user';
  // iOS 는 카메라 두 개를 동시에 열 수 없으므로 먼저 정지 후 재요청
  stopCam();
  await startCam(next);
});

/* --- 마이크 --- */
const meter = $('#micMeter');
const BARS = 28;
meter.innerHTML = '<i></i>'.repeat(BARS);
const bars = $$('i', meter);
const levels = new Array(BARS).fill(0);

/** 마이크 자원을 모두 놓는다: rAF, 트랙, AudioContext, 미터 */
function releaseMic() {
  const m = media.mic;
  cancelAnimationFrame(m.raf);
  stopTracks(m.stream);
  m.stream = null;
  m.ctx?.close().catch(() => {});
  m.ctx = null;
  meter.classList.remove('is-live');
  levels.fill(0);
  bars.forEach((b) => (b.style.height = ''));
}

async function startMic() {
  const m = media.mic;
  if (m.busy || m.stream) return;
  const my = ++gen.mic;
  m.busy = true; setState('mic', 'prompt', '권한을 요청하는 중…');
  // AudioContext 는 사용자 제스처(클릭) 안에서 만들어야 iOS 에서 suspended 로 멈추지 않는다.
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = Ctx ? new Ctx() : null;
  m.ctx = ctx;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (my !== gen.mic) { stopTracks(stream); ctx?.close().catch(() => {}); return; }
    m.stream = stream;
    if (!ctx) throw Object.assign(new Error('Web Audio API를 지원하지 않습니다.'), { name: 'NotSupportedError' });
    await ctx.resume();
    if (my !== gen.mic) return; // stopMic 이 이미 정리함

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let last = 0;
    const tick = (t) => {
      m.raf = requestAnimationFrame(tick);
      if (t - last < 50) return; // 20fps 면 충분
      last = t;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8); // dBFS
      levels.shift(); levels.push(Math.max(0, Math.min(1, (db + 60) / 50)));
      for (let i = 0; i < BARS; i++) bars[i].style.height = `${6 + levels[i] * 94}%`;
    };
    m.raf = requestAnimationFrame(tick);
    meter.classList.add('is-live');
    const track = stream.getAudioTracks()[0];
    track.addEventListener('ended', () => { if (m.stream === stream) stopMic('마이크가 다른 앱이나 시스템에 의해 중단되었습니다.'); });

    m.busy = false;
    m.perm = 'granted';
    setState('mic', 'live', track.label || '');
    haptic(10);
  } catch (err) {
    if (my !== gen.mic) { stopTracks(stream); ctx?.close().catch(() => {}); return; }
    // 스트림을 받은 뒤 오디오 초기화가 실패해도 트랙까지 반드시 정지한다
    releaseMic();
    stopTracks(stream);
    m.busy = false;
    const [state, hint] = errorToState(err);
    if (state === 'denied') m.perm = 'denied';
    setState('mic', state, hint);
  }
}

function stopMic(hint = '') {
  gen.mic++;
  media.mic.busy = false;
  releaseMic();
  setState('mic', media.mic.perm, hint);
}

$('#micBtn').addEventListener('click', () => (media.mic.stream ? stopMic() : startMic()));

/** 켜져 있거나 요청 중인 장치를 모두 정지 */
function stopAllMedia() {
  if (media.cam.stream || media.cam.busy) stopCam();
  if (media.mic.stream || media.mic.busy) stopMic();
}

// 백그라운드 전환·페이지 이탈 시 장치를 놓아 준다(카메라 표시등 끄기, iOS 인터럽트 대비)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopAllMedia();
  else if (app.dataset.view === 'check') refreshPermissions();
});
window.addEventListener('pagehide', stopAllMedia);

/* =========================================================
   6. 환경 정보 + 멀티터치 테스트
   ========================================================= */

const probe = document.createElement('div');
probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:var(--sat) var(--sar) var(--sab) var(--sal);';
app.appendChild(probe);

function renderEnv() {
  const list = $('#envList');
  if (!list) return;
  const cs = getComputedStyle(probe);
  const px = (v) => `${Math.round(parseFloat(v))}`;
  const mode = root.dataset.mode;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const rows = [
    ['표시 모드', mode === 'mockup' ? '목업 (데스크톱)' : '전체 화면 (모바일)'],
    ['앱 화면', `${app.clientWidth} × ${app.clientHeight}`],
    ['배율', mode === 'mockup' ? `${scale.toFixed(2)}× · DPR ${devicePixelRatio}` : `DPR ${devicePixelRatio}`],
    ['안전 영역', `상 ${px(cs.paddingTop)} · 하 ${px(cs.paddingBottom)} · 좌 ${px(cs.paddingLeft)} · 우 ${px(cs.paddingRight)}`],
    ['입력', `${coarse ? '터치' : '마우스/펜'} · 최대 ${navigator.maxTouchPoints} 터치`],
    ['실행', standalone ? '홈 화면 앱 (standalone)' : '브라우저 탭'],
    ['보안 컨텍스트', window.isSecureContext ? 'HTTPS / localhost' : '아님 (권한 API 제한)'],
    ['방향', mode === 'mockup' ? 'portrait (목업 고정)' : (screen.orientation?.type ?? (innerWidth > innerHeight ? 'landscape' : 'portrait'))],
  ];
  list.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

(() => {
  const pad = $('#touchpad');
  const label = $('#touchLabel');
  const dots = new Map();
  const update = () => {
    label.textContent = dots.size ? `동시 터치 ${dots.size}개` : '여기를 손가락으로 눌러 보세요';
  };
  const place = (dot, e) => {
    const p = toLocal(pad, e);
    dot.style.left = `${p.x}px`; dot.style.top = `${p.y}px`;
  };
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    const dot = document.createElement('span');
    dot.className = 'touch-dot';
    dot.innerHTML = `<b>${e.pointerType}</b>`;
    place(dot, e);
    pad.appendChild(dot);
    dots.set(e.pointerId, dot);
    haptic(4);
    update();
  });
  pad.addEventListener('pointermove', (e) => { const d = dots.get(e.pointerId); if (d) place(d, e); });
  const up = (e) => { dots.get(e.pointerId)?.remove(); dots.delete(e.pointerId); update(); };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
})();

/* =========================================================
   시작
   ========================================================= */
layout();
renderCarousel(false);
