/* 목업 셸: pocs/mockup/app.js 의 표시 모드·배율 계산을 가져옴
 * - 데스크톱: 아이폰 프레임(논리 425.5×924)을 뷰포트에 맞춰 scale
 * - 모바일: 프레임 없이 전체 화면 (모드는 index.html 의 head 스크립트가 첫 페인트 전에 결정)
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const FRAME = { w: 425.5, h: 924 };
  const MOBILE_QUERY = '(hover: none) and (pointer: coarse)';
  const forced = new URLSearchParams(location.search).get('frame'); // '1' | '0' | null

  function resolveMode() {
    if (forced === '1') return 'mockup';
    if (forced === '0') return 'full';
    return matchMedia(MOBILE_QUERY).matches ? 'full' : 'mockup';
  }

  function layout() {
    const mode = resolveMode();
    if (root.dataset.mode !== mode) root.dataset.mode = mode;
    let scale = 1;
    if (mode === 'mockup') {
      // 세로: 위 여백 + 아래 캡션 영역, 가로: 좌우 여백
      scale = Math.min((innerHeight - 96) / FRAME.h, (innerWidth - 48) / FRAME.w, 1.25);
      scale = Math.max(scale, 0.35);
    }
    root.style.setProperty('--s', String(scale));
    // voyage.js 가 캔버스 해상도를 정할 때 쓴다
    window.__shellScale = scale;
    window.dispatchEvent(new Event('shell:layout'));
  }

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
  addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  screen.orientation?.addEventListener?.('change', schedule);
  layout();

  // 가상 상태 표시줄 시계
  const sb = document.getElementById('sbTime');
  const tick = () => {
    const d = new Date();
    sb.textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  tick();
  setInterval(tick, 15000);
})();
