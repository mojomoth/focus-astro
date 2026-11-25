/* Focus Astronaut · 우주선 항해 PoC
 * - 10초마다 배경 크로스페이드(5초간) (랜덤, 직전 이미지 반복 없음)
 * - 우→좌로 흐르는 미세 먼지 파티클 (깊이별 속도·크기·투명도)
 * - 화면 정중앙 우주선 + 노즐에서 화면 밖까지 이어지는 연기 트레일
 * - 하단 집중/휴식 토글: 집중이면 항해, 휴식이면 엔진을 끄고 정지
 */
(() => {
  'use strict';

  // ───────────────────────── 설정 ─────────────────────────
  const CONFIG = {
    bgMinShortSide: 1080, // 이보다 해상도가 낮은 배경은 건너뜀
    bgIntervalMs: 10000, // 10초마다 전환 (전환 자체는 CSS --fade-ms 5초)
    // 우주선 이미지 안에서 노즐(연기 발생 지점)의 상대 위치 (0~1)
    nozzle: { x: 0.05, y: 0.512 }, // assets/ship.png 1555x1050 기준 (Codex 측정)
    dust: { density: 1 / 5500, max: 380 },
    smoke: { rate: 90, maxAlpha: 0.26 },
    // 집중↔휴식 전환 시 속도가 목표값에 다가가는 시간 상수(초). 약 3τ 뒤 거의 도달
    throttleTau: 0.6,
  };

  // 짧은 변 1080px 이상만 사용 (assets/bg, 출처: docs/design/refs/space)
  const BACKGROUNDS = [
    { file: 'horsehead-nebula-hubble-heic0105a.jpg', title: 'Horsehead Nebula', credit: 'NASA, NOAO, ESA and The Hubble Heritage Team (STScI/AURA)' },
    { file: 'hubble-ultra-deep-field-heic0406a.jpg', title: 'Hubble Ultra Deep Field', credit: 'NASA, ESA, and S. Beckwith (STScI) and the HUDF Team' },
    { file: 'lagoon-nebula-wide-field-eso1403c.jpg', title: 'Wide-field view of the Lagoon Nebula', credit: 'ESO/Digitized Sky Survey 2. Acknowledgement: Davide De Martin' },
    { file: 'messier-78-reflection-nebula-eso1105a.jpg', title: 'Messier 78', credit: 'ESO/Igor Chekalin' },
    { file: 'milky-way-centre-eso0226a.jpg', title: 'The centre of the Milky Way', credit: 'ESO' },
    { file: 'old-stars-youthful-glow-potw1107a.jpg', title: 'Old stars with a youthful glow', credit: 'ESA/Hubble & NASA' },
    { file: 'omega-nebula-eso0925a.jpg', title: 'The Omega Nebula', credit: 'ESO' },
    { file: 'orion-nebula-hawki-eso1625a.jpg', title: 'Orion Nebula (HAWK-I)', credit: 'ESO/H. Drass et al.' },
    { file: 'sky-around-alpha-proxima-centauri-eso1629i.jpg', title: 'The sky around Alpha Centauri and Proxima Centauri', credit: 'Digitized Sky Survey 2. Acknowledgement: Davide De Martin/Mahdi Zamani' },
    { file: 'trifid-nebula-vista-eso1504a.jpg', title: 'Trifid Nebula (VISTA)', credit: 'ESO/VVV consortium/D. Minniti' },
  ];

  const DEBUG = new URLSearchParams(location.search).has('debug');
  const rand = (a, b) => a + Math.random() * (b - a);
  // 목업 모드에서는 프레임이 scale 되므로 실제 표시 배율까지 반영해 캔버스 해상도를 정한다
  let DPR = 1;
  const appEl = document.getElementById('app');

  // ───────────────────────── 배경 ─────────────────────────
  const layers = [document.getElementById('bgA'), document.getElementById('bgB')];
  const creditEl = document.getElementById('credit');
  let active = 0;
  let bag = [];
  let lastFile = null;

  function nextBackground() {
    if (bag.length === 0) {
      bag = BACKGROUNDS.slice().sort(() => Math.random() - 0.5);
      // 셔플 경계에서 같은 이미지가 연속으로 나오지 않게
      if (bag[bag.length - 1].file === lastFile) bag.unshift(bag.pop());
    }
    const bg = bag.pop();
    lastFile = bg.file;
    return bg;
  }

  function loadImage(bg) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `assets/bg/${bg.file}`;
    });
  }

  // 다음 배경을 미리 불러오되, 로드 실패나 저해상도 이미지는 목록에서 빼고 건너뜀
  async function preload(bg) {
    for (let tries = 0; tries < BACKGROUNDS.length; tries++) {
      const img = await loadImage(bg);
      if (img && Math.min(img.naturalWidth, img.naturalHeight) >= CONFIG.bgMinShortSide) return bg;
      console.warn(`[voyage] 배경 제외: ${bg.file}`, img ? `${img.naturalWidth}x${img.naturalHeight}` : 'load error');
      const i = BACKGROUNDS.indexOf(bg);
      if (i >= 0 && BACKGROUNDS.length > 1) BACKGROUNDS.splice(i, 1);
      bg = nextBackground();
    }
    return bg;
  }

  function show(bg, el) {
    el.style.backgroundImage = `url("assets/bg/${bg.file}")`;
    // 드리프트 애니메이션을 처음부터 다시 시작
    el.classList.remove('drift');
    void el.offsetWidth;
    el.classList.add('drift', 'is-on');
    creditEl.style.opacity = '0';
    setTimeout(() => {
      creditEl.textContent = `${bg.title} · ${bg.credit} · CC BY 4.0`;
      creditEl.style.opacity = '';
    }, 2500); // 크로스페이드 절반 지점에서 크레딧 교체
  }

  let pending = preload(nextBackground());

  async function swap() {
    const bg = await pending;
    const outgoing = layers[active];
    active = 1 - active;
    show(bg, layers[active]);
    outgoing.classList.remove('is-on'); // opacity만 내려가고 드리프트는 계속
    pending = preload(nextBackground());
  }

  // 첫 배경은 즉시 표시. 이후 전환은 루프의 항해 시계(bgClock)가 맡는다:
  // 집중(항해) 중에만 시간이 흘러 10초마다 전환하고, 휴식(정지) 중에는 멈춘다.
  let bgReady = false;
  let bgClock = 0;
  pending.then((bg) => {
    show(bg, layers[active]);
    pending = preload(nextBackground());
    bgReady = true;
  });

  function updateBackground(dt) {
    if (!bgReady) return;
    bgClock += dt * throttle * 1000;
    if (bgClock >= CONFIG.bgIntervalMs) {
      bgClock = 0;
      swap();
    }
  }

  // ───────────────────────── 집중 / 휴식 ─────────────────────────
  // throttle: 0(정지) ~ 1(항해). 목표값으로 부드럽게 수렴해 감속·가속이 자연스럽다.
  let throttle = 1;
  let throttleTarget = 1;
  const appRoot = document.getElementById('app');
  const segs = [...document.querySelectorAll('.mode-toggle .seg')];

  function setMode(mode) {
    const focus = mode === 'focus';
    throttleTarget = focus ? 1 : 0;
    appRoot.dataset.state = focus ? 'focus' : 'rest';
    for (const b of segs) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
  for (const b of segs) b.addEventListener('click', () => setMode(b.dataset.mode));
  setMode('focus');

  // ───────────────────────── 캔버스 공통 ─────────────────────────
  const smokeCv = document.getElementById('smoke');
  const dustCv = document.getElementById('dust');
  const sctx = smokeCv.getContext('2d');
  const dctx = dustCv.getContext('2d');
  const ship = document.getElementById('ship');
  let W = 0, H = 0;

  function resize() {
    // 창이 아니라 앱 화면(목업 스크린 390×891 또는 전체 화면) 기준
    W = appEl.clientWidth;
    H = appEl.clientHeight;
    DPR = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * (window.__shellScale || 1)));
    for (const cv of [smokeCv, dustCv]) {
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
    }
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    initDust();
  }

  // 부드러운 원형 스프라이트 (연기·글로우용)
  function makeSprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  const SMOKE_SPRITE = makeSprite(128, [
    [0, 'rgba(200,228,240,1)'],
    [0.35, 'rgba(172,212,232,.55)'],
    [0.7, 'rgba(150,190,215,.15)'],
    [1, 'rgba(140,180,205,0)'],
  ]);
  const GLOW_SPRITE = makeSprite(128, [
    [0, 'rgba(235,252,255,1)'],
    [0.25, 'rgba(140,225,255,.7)'],
    [0.6, 'rgba(60,170,230,.18)'],
    [1, 'rgba(40,140,220,0)'],
  ]);

  // ───────────────────────── 먼지 파티클 ─────────────────────────
  let dust = [];

  function spawnDust(p, anywhere) {
    const z = Math.pow(Math.random(), 1.6); // 대부분 멀리, 일부만 가까이
    p.z = z;
    p.x = anywhere ? rand(0, W) : W + rand(4, 60);
    p.y = rand(0, H);
    p.speed = (18 + 150 * z * z) * Math.max(0.6, W / 1200);
    p.size = 0.35 + 1.5 * z;
    p.alpha = 0.16 + 0.5 * z;
    p.phase = rand(0, Math.PI * 2);
    p.wob = rand(0.2, 0.7);
    p.amp = rand(2, 10) * (0.3 + z);
    p.tw = rand(0.6, 2.2);
    return p;
  }

  function initDust() {
    const n = Math.min(CONFIG.dust.max, Math.round(W * H * CONFIG.dust.density));
    dust = Array.from({ length: n }, () => spawnDust({}, true));
  }

  function updateDust(dt, t) {
    dctx.clearRect(0, 0, W, H);
    for (const p of dust) {
      p.x -= p.speed * dt * throttle;
      if (p.x < -20) spawnDust(p, false);
      const y = p.y + Math.sin(t * p.wob + p.phase) * p.amp;
      const a = p.alpha * (0.65 + 0.35 * Math.sin(t * p.tw + p.phase));
      if (p.z > 0.55) {
        // 가까운 먼지는 이동 방향으로 살짝 늘어진 꼬리
        const len = Math.max(0.5, p.speed * 0.08 * throttle);
        const grad = dctx.createLinearGradient(p.x, y, p.x + len, y);
        grad.addColorStop(0, `rgba(225,235,250,${a})`);
        grad.addColorStop(1, 'rgba(225,235,250,0)');
        dctx.strokeStyle = grad;
        dctx.lineWidth = p.size;
        dctx.lineCap = 'round';
        dctx.beginPath();
        dctx.moveTo(p.x, y);
        dctx.lineTo(p.x + len, y);
        dctx.stroke();
      } else {
        dctx.fillStyle = `rgba(215,228,245,${a})`;
        dctx.beginPath();
        dctx.arc(p.x, y, p.size, 0, Math.PI * 2);
        dctx.fill();
      }
    }
  }

  // ───────────────────────── 우주선 ─────────────────────────
  const shipState = { bob: 0, rot: 0 };

  function updateShip(t) {
    const h = ship.clientHeight;
    shipState.bob = Math.sin(t * 0.8) * h * 0.025 + Math.sin(t * 1.9) * h * 0.006;
    shipState.rot = Math.sin(t * 0.55 + 0.6) * 0.7; // deg
    ship.style.transform =
      `translate(-50%, calc(-50% + ${shipState.bob.toFixed(2)}px)) rotate(${shipState.rot.toFixed(3)}deg)`;
  }

  function nozzlePoint() {
    const w = ship.clientWidth, h = ship.clientHeight;
    const lx = (CONFIG.nozzle.x - 0.5) * w;
    const ly = (CONFIG.nozzle.y - 0.5) * h;
    const r = (shipState.rot * Math.PI) / 180;
    return {
      x: W / 2 + lx * Math.cos(r) - ly * Math.sin(r),
      y: H / 2 + shipState.bob + lx * Math.sin(r) + ly * Math.cos(r),
      h,
    };
  }

  // ───────────────────────── 연기 파티클 ─────────────────────────
  const smoke = [];
  const sparks = [];
  let emitAcc = 0;

  function emitSmoke(n) {
    const scale = n.h;
    const base = Math.max(260, W * 0.3);
    smoke.push({
      x: n.x + rand(-2, 2),
      y: n.y + rand(-0.04, 0.04) * scale,
      vx: -base * rand(0.85, 1.2),
      vy: rand(-0.1, 0.1) * scale,
      age: 0,
      life: rand(3.2, 5.2),
      r0: scale * rand(0.09, 0.13),
      r1: scale * rand(0.3, 0.55),
      a: CONFIG.smoke.maxAlpha * rand(0.6, 1),
      phase: rand(0, Math.PI * 2),
      swirl: rand(0.6, 1.6),
      rot: rand(0, Math.PI * 2),
    });
  }

  function emitSpark(n) {
    sparks.push({
      x: n.x + rand(-2, 4),
      y: n.y + rand(-0.03, 0.03) * n.h,
      vx: -rand(160, 320) * Math.max(0.7, W / 1400),
      vy: rand(-12, 12),
      age: 0,
      life: rand(0.18, 0.45),
      r: n.h * rand(0.06, 0.1),
    });
  }

  function updateSmoke(dt, t) {
    sctx.clearRect(0, 0, W, H);
    if (!ship.complete || ship.naturalWidth === 0) return;
    const n = nozzlePoint();

    // 발생
    // 휴식이면 엔진이 꺼져 새 연기가 나오지 않고, 남은 연기는 그 자리에서 흩어진다
    emitAcc += CONFIG.smoke.rate * dt * throttle;
    while (emitAcc >= 1) { emitSmoke(n); emitSpark(n); emitAcc -= 1; }

    // 연기: 오래된 것부터 그려서 최신 연기가 위로
    sctx.globalCompositeOperation = 'source-over';
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.age += dt;
      const k = p.age / p.life;
      const drag = Math.exp(-0.12 * dt);
      p.vx *= drag;
      p.vy *= Math.exp(-0.35 * dt);
      p.x += p.vx * dt * throttle; // 연기의 좌측 이동 = 우주선의 전진
      // 난류: 시간이 지날수록 흔들림이 커짐
      p.y += (p.vy + Math.sin(t * p.swirl + p.phase + p.x * 0.006) * 40 * k * (n.h / 120)) * dt;
      const r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - Math.min(k, 1), 2));
      if (k >= 1 || p.x + r < -40) { smoke.splice(i, 1); continue; }
    }
    for (const p of smoke) {
      const k = p.age / p.life;
      const r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 2));
      const fadeIn = Math.min(1, p.age / 0.12);
      const alpha = p.a * fadeIn * Math.pow(1 - k, 1.25);
      sctx.globalAlpha = alpha;
      sctx.drawImage(SMOKE_SPRITE, p.x - r * 1.3, p.y - r * 0.6, r * 2.6, r * 1.2);
    }

    // 노즐 근처 청백색 글로우 (가산 합성)
    sctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt * throttle;
      s.y += s.vy * dt;
      const k = s.age / s.life;
      const r = s.r * (1 + k * 1.6);
      sctx.globalAlpha = 0.32 * (1 - k);
      sctx.drawImage(GLOW_SPRITE, s.x - r * 1.6, s.y - r, r * 3.2, r * 2);
    }
    const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
    const gr = n.h * 0.2 * flick;
    sctx.globalAlpha = 0.55 * throttle;
    sctx.drawImage(GLOW_SPRITE, n.x - gr * 1.3, n.y - gr, gr * 2, gr * 2);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-over';

    if (DEBUG) {
      sctx.fillStyle = '#f0f';
      sctx.beginPath();
      sctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
      sctx.fill();
      sctx.fillStyle = '#fff';
      sctx.font = '12px monospace';
      sctx.fillText(`smoke ${smoke.length} · dust ${dust.length}`, 12, 20);
    }
  }

  // ───────────────────────── 루프 ─────────────────────────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    throttle += (throttleTarget - throttle) * (1 - Math.exp(-dt / CONFIG.throttleTau));
    if (Math.abs(throttleTarget - throttle) < 0.001) throttle = throttleTarget;
    updateBackground(dt);
    updateShip(t);
    updateSmoke(dt, t);
    updateDust(dt, t);
    requestAnimationFrame(frame);
  }

  window.addEventListener('shell:layout', resize);
  new ResizeObserver(resize).observe(appEl);
  resize();

  // 첫 프레임에 트레일이 이미 화면 밖까지 이어져 있도록 미리 시뮬레이션
  function prewarm() {
    const step = 1 / 60;
    let t = performance.now() / 1000 - 5;
    for (let i = 0; i < 60 * 5; i++, t += step) {
      updateShip(t);
      updateSmoke(step, t);
    }
  }
  if (ship.complete && ship.naturalWidth) prewarm();
  else ship.addEventListener('load', prewarm, { once: true });

  requestAnimationFrame(frame);
})();
