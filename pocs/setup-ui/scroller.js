// 카드 슬라이드 물리 — docs/design/refs/mov/슬라이드인터페이스.mov 프레임 분석값을 그대로 쓴다.
//
// 영상(296×640, 60fps)에서 카드 줄을 프레임마다 상호상관으로 추적해 얻은 값:
//   · 스냅 없음. 손을 떼면 그 자리에서 관성으로 미끄러지다 멈춘다.
//   · 관성 감속: 속도 반감기 ≈ 0.33~0.40s  →  iOS UIScrollView 기본 감속률 0.998/ms (반감기 346ms)
//   · 끝(첫/마지막 카드)을 넘으면: 프레임당 ×0.6 으로 급감속(≈ e^-0.03t)하며 20px 남짓 넘어가고,
//     정점에서 ~0.4s 동안 임계 감쇠 스프링으로 돌아온다(ω ≈ 0.0135/ms).
//   · 드래그로 끝을 넘기면 iOS 러버밴드 저항: f(x) = (1 − 1/(x·0.55/D + 1))·D, D = 뷰포트 폭
//   · 움직이는 중에 손가락을 대면 즉시 멈춘다(그 탭은 선택으로 치지 않는다).
//
// 좌표: x = 콘텐츠 오프셋(px). 0 = 첫 카드가 가운데, max = 마지막 카드가 가운데.

export const PHYS = {
  DECEL: 0.998,          // 관성 감속률 (ms당)
  STOP_V: 0.012,         // 이 속도(px/ms) 아래로 떨어지면 관성 종료
  OVER_K: 0.03,          // 경계 밖 급감속 (1/ms)
  OVER_STOP_V: 0.08,     // 경계 밖 급감속 → 복귀 스프링 전환 속도
  RETURN_W: 0.0135,      // 복귀 스프링 고유진동수 (1/ms, 임계 감쇠)
  MAX_V: 4,              // 플링 속도 상한 (px/ms)
  RUBBER: 0.55,          // 러버밴드 계수
  SLOP: 8,               // 드래그 시작 임계값 (px)
  VEL_WINDOW: 80,        // 속도 추정 창 (ms)
};

export class Scroller {
  /**
   * @param {object} o
   * @param {HTMLElement} o.el       포인터를 받는 영역
   * @param {() => number} o.max     최대 오프셋
   * @param {() => number} o.width   뷰포트 폭 (러버밴드 D)
   * @param {() => number} o.scale   화면 배율 (목업 축소 보정)
   * @param {(x:number)=>void} o.render
   * @param {object} [o.on]          { press(target), release(), tap(target), dragStart(), settle() }
   */
  constructor(o) {
    Object.assign(this, o);
    this.on = o.on || {};
    this.x = 0; this.v = 0;
    this.mode = 'idle';  // idle | drag | momentum | over | return | to
    this.raf = 0;
    this.p = null;       // 포인터 상태
    this._bind();
  }

  get moving() { return this.mode !== 'idle' && this.mode !== 'drag'; }

  set(x) { this.stop(); this.x = x; this.render(x); }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; if (this.mode !== 'drag') this.mode = 'idle'; this.v = 0; }

  /* ---------- 경계 ---------- */
  bound(x) { return x < 0 ? 0 : x > this.max() ? this.max() : x; }
  rubber(over) { // 드래그로 넘긴 거리 → 화면에 보이는 거리
    const D = this.width(), s = Math.sign(over), a = Math.abs(over);
    return s * (1 - 1 / ((a * PHYS.RUBBER) / D + 1)) * D;
  }
  unrubber(shown) { // 역함수: 이미 넘어가 있는 상태에서 드래그를 이어받을 때
    const D = this.width(), s = Math.sign(shown), a = Math.min(Math.abs(shown), D * 0.999);
    return s * ((1 / (1 - a / D) - 1) * D) / PHYS.RUBBER;
  }

  /* ---------- 애니메이션 루프 ---------- */
  _loop(step) {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(48, now - last); last = now;
      if (dt > 0 && step(dt) === false) { this.raf = 0; this.mode = 'idle'; this.v = 0; this.on.settle?.(); return; }
      this.render(this.x);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** 손을 뗀 뒤: 관성 → (경계 밖이면) 급감속 → 복귀 스프링 */
  fling(v) {
    this.v = Math.max(-PHYS.MAX_V, Math.min(PHYS.MAX_V, v));
    const b = this.bound(this.x);
    if (this.x !== b) this.mode = Math.sign(this.v) === Math.sign(this.x - b) ? 'over' : 'momentum';
    else this.mode = 'momentum';
    const lnD = Math.log(PHYS.DECEL);
    this._loop((dt) => {
      if (this.mode === 'momentum') {
        // 닫힌 형태 적분: x += v·(r^dt − 1)/ln r,  v *= r^dt
        const r = Math.pow(PHYS.DECEL, dt);
        const nx = this.x + (this.v * (r - 1)) / lnD;
        const nv = this.v * r;
        const b0 = this.bound(this.x), b1 = this.bound(nx);
        if (this.x === b0 && nx !== b1) {
          // 이번 프레임에 경계를 밖으로 넘었다 → 넘은 시점의 속도로 급감속 단계
          this.x = nx; this.v = nv; this.mode = 'over';
          return;
        }
        this.x = nx; this.v = nv;
        if (Math.abs(this.v) < PHYS.STOP_V) {
          if (this.x !== this.bound(this.x)) { this.mode = 'return'; this.v = 0; return; }
          return false;
        }
        return;
      }
      if (this.mode === 'over') {
        const k = Math.exp(-PHYS.OVER_K * dt);
        this.x += (this.v * (k - 1)) / -PHYS.OVER_K;
        this.v *= k;
        if (Math.abs(this.v) < PHYS.OVER_STOP_V) this.mode = 'return'; // 남은 속도는 스프링이 흡수
        return;
      }
      if (this.mode === 'return') return this._spring(dt, this.bound(this.x), PHYS.RETURN_W);
      return false;
    });
  }

  /** 지정 오프셋으로 이동 (탭 선택·셔플·눈금자). 같은 임계 감쇠 스프링을 쓴다. */
  animateTo(target, w = 0.014) {
    if (this.mode === 'drag') return;
    const running = this.raf && this.mode === 'to';
    this.mode = 'to'; this.target = target;
    if (running) return; // 이미 이동 중이면 목표만 바꾼다(눈금자 드래그 중 연속 호출)
    this._loop((dt) => (this.mode === 'to' ? this._spring(dt, this.target, w) : false));
  }

  // 임계 감쇠 스프링 한 스텝 (해석해): x(t) = b + (A + B t)e^{-wt}
  _spring(dt, b, w) {
    const A = this.x - b, B = this.v + w * A, e = Math.exp(-w * dt);
    this.x = b + (A + B * dt) * e;
    this.v = (B - w * (A + B * dt)) * e;
    if (Math.abs(this.x - b) < 0.25 && Math.abs(this.v) < 0.01) { this.x = b; this.render(b); return false; }
  }

  /* ---------- 포인터 ---------- */
  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.p) return;
      const caught = this.moving;               // 움직이는 중에 잡았다
      cancelAnimationFrame(this.raf); this.raf = 0;
      this.mode = 'idle'; this.v = 0;
      const s = this.scale();
      this.p = { id: e.pointerId, x0: e.clientX / s, xs: this.x, raw: 0, dragging: false, caught, s,
        samples: [[e.timeStamp, this.x]], target: e.target.closest('[data-i]') };
      // 끝을 넘은 상태에서 잡았다면 러버밴드 역변환으로 '손가락 기준 위치'를 복원
      const b = this.bound(this.x);
      this.p.base = b; this.p.raw = this.x !== b ? this.unrubber(this.x - b) : 0;
      this.p.xs = this.x !== b ? b : this.x;
      this.on.press?.(this.p.target, caught);
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.p; if (!p || e.pointerId !== p.id) return;
      const fx = e.clientX / p.s;
      const d = p.x0 - fx;
      if (!p.dragging) {
        if (Math.abs(d) < PHYS.SLOP) return;
        p.dragging = true; this.mode = 'drag';
        p.x0 = fx;                   // 임계값만큼 튀지 않도록 기준점을 지금 위치로 옮긴다
        p.anchor = p.xs + p.raw;     // 손가락 기준 '원시' 위치
        el.setPointerCapture(e.pointerId);
        this.on.dragStart?.();
        return;
      }
      const raw = p.anchor + (p.x0 - fx);
      const b = this.bound(raw);
      this.x = raw === b ? raw : b + this.rubber(raw - b);
      this.render(this.x);
      p.samples.push([e.timeStamp, this.x]);
      while (p.samples.length > 2 && e.timeStamp - p.samples[0][0] > PHYS.VEL_WINDOW) p.samples.shift();
    });
    const end = (e, cancel) => {
      const p = this.p; if (!p || e.pointerId !== p.id) return;
      this.p = null;
      this.on.release?.();
      if (!p.dragging) {
        this.mode = 'idle';
        if (this.x !== this.bound(this.x)) this.fling(0);             // 넘은 채로 잡았다 놓음 → 복귀
        else if (!p.caught && !cancel) this.on.tap?.(p.target);       // 멈춰 있던 상태의 탭만 선택
        return;
      }
      // 손을 떼기 직전 VEL_WINDOW 안의 이동으로 속도 추정. 손가락을 멈췄다 떼면 0.
      const [t0, x0] = p.samples[0], [t1, x1] = p.samples[p.samples.length - 1];
      const idle = e.timeStamp - t1;
      const v = idle > 60 || t1 === t0 ? 0 : (x1 - x0) / (t1 - t0);
      this.fling(v);
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));

    // 트랙패드/마우스 휠 (데스크톱 확인용)
    let wheelT;
    el.addEventListener('wheel', (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!d) return;
      e.preventDefault();
      cancelAnimationFrame(this.raf); this.raf = 0; this.mode = 'idle';
      const b = this.bound(this.x);
      const raw = (this.x !== b ? b + this.unrubber(this.x - b) : this.x) + d;
      const nb = this.bound(raw);
      this.x = raw === nb ? raw : nb + this.rubber(raw - nb);
      this.render(this.x);
      clearTimeout(wheelT);
      wheelT = setTimeout(() => { if (this.x !== this.bound(this.x)) this.fling(0); else this.on.settle?.(); }, 90);
    }, { passive: false });
  }
}
