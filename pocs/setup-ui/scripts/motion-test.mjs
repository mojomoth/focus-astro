// 카드 슬라이드 움직임을 헤드리스 Chrome에서 실제 포인터 이벤트로 재생하고,
// 영상(슬라이드인터페이스.mov) 측정값과 비교한다.
//   node scripts/motion-test.mjs [baseUrl]
//
// 영상 기준값 (296px 폭 영상 → 393pt 환산 ×1.328):
//   관성 속도 반감기      0.33~0.40 s
//   끝 넘침(오버슈트)      21px → ≈ 28pt (경계 통과 속도 ≈ 0.8 pt/ms 일 때)
//   경계 통과 → 정점       ≈ 0.08~0.10 s
//   정점 → 1pt 이내 복귀   ≈ 0.35~0.40 s
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:5192/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'fa-motion-'));
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

async function json(path, method = 'GET') {
  for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json(); } catch { await sleep(200); } }
  throw new Error('chrome not reachable');
}

try {
  await json('/json/version');
  const t = await json('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: false });
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}?frame=0&sb=1` });
  await sleep(1500);

  const Y = await evalJS(`(() => { const r = document.querySelector('#cards').getBoundingClientRect(); return r.top + r.height / 2; })()`);
  const mouse = (type, x) => send('Input.dispatchMouseEvent', { type, x, y: Y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  // 손가락 플링: 일정 속도(pt/ms)로 dur ms 동안 왼쪽으로 끌고 바로 놓는다
  async function fling(v, dur = 110, x0 = 330) {
    await evalJS(`window.__log = []; (function loop(){ const s = __setup.scroller; __log.push([performance.now(), s.x, s.v, s.mode]); if (__log.length < 400) requestAnimationFrame(loop); })(); 1`);
    await mouse('mousePressed', x0);
    const t0 = Date.now(); let x = x0;
    await mouse('mouseMoved', x0 - 10); // 슬롭 통과
    while (Date.now() - t0 < dur) { await sleep(8); x = x0 - 10 - v * (Date.now() - t0); await mouse('mouseMoved', x); }
    await mouse('mouseReleased', x);
    const rel = await evalJS('performance.now()');
    await sleep(2600);
    return { rel, log: await evalJS('__log') };
  }

  // ---------- 1) 자유 관성: 반감기 ----------
  await evalJS('__setup.select(1, false); 1');
  const A = await fling(0.85);
  const after = A.log.filter((r) => r[0] > A.rel + 30 && r[3] === 'momentum');
  const v0 = Math.abs(after[0][2]);
  const half = after.find((r) => Math.abs(r[2]) <= v0 / 2);
  const halfLife = (half[0] - after[0][0]) / 1000;
  const stop = A.log.find((r) => r[0] > A.rel && r[3] === 'idle');
  const travel = (stop ? stop[1] : A.log.at(-1)[1]) - after[0][1];
  console.log('1) 자유 관성');
  console.log(`   놓은 직후 속도 ${v0.toFixed(2)} pt/ms, 반감기 ${halfLife.toFixed(3)} s (영상 0.33~0.40 s), 관성 이동 ${travel.toFixed(0)} pt, 정지까지 ${((stop[0] - A.rel) / 1000).toFixed(2)} s`);

  // ---------- 2) 끝으로 플링: 오버슈트 + 복귀 ----------
  const max = await evalJS('__setup.offsetOf(__setup.PLANETS.length - 1)');
  await evalJS(`__setup.scroller.set(${max} - 160); 1`);
  const B = await fling(0.85, 90);
  const cross = B.log.find((r) => r[1] > max);
  const peak = B.log.reduce((a, r) => (r[1] > a[1] ? r : a));
  const back = B.log.find((r) => r[0] > peak[0] && r[1] - max < 1);
  // 경계 통과 직전 프레임 속도
  const ci = B.log.indexOf(cross);
  const vc = (B.log[ci][1] - B.log[ci - 1][1]) / (B.log[ci][0] - B.log[ci - 1][0]);
  console.log('2) 끝으로 플링');
  console.log(`   경계 통과 속도 ${vc.toFixed(2)} pt/ms → 오버슈트 ${(peak[1] - max).toFixed(1)} pt (영상: 0.8 pt/ms → ≈28 pt)`);
  console.log(`   통과→정점 ${((peak[0] - cross[0]) / 1000).toFixed(3)} s (영상 0.08~0.10), 정점→1pt 이내 ${((back[0] - peak[0]) / 1000).toFixed(3)} s (영상 0.35~0.40)`);
  console.log(`   최종 위치 ${B.log.at(-1)[1].toFixed(2)} / 경계 ${max}`);

  // ---------- 3) 움직이는 중 잡기 → 즉시 정지, 선택 안 됨 ----------
  await evalJS('__setup.select(1, false); 1');
  const selBefore = await evalJS('__setup.sel');
  await mouse('mousePressed', 330); await mouse('mouseMoved', 320);
  for (let k = 1; k <= 10; k++) { await sleep(10); await mouse('mouseMoved', 320 - k * 9); }
  await mouse('mouseReleased', 230);
  await sleep(250);
  const xBefore = await evalJS('__setup.scroller.x');
  await mouse('mousePressed', 200); await sleep(40); await mouse('mouseReleased', 200);
  await sleep(300);
  const xAfter = await evalJS('__setup.scroller.x');
  const selAfter = await evalJS('__setup.sel');
  console.log('3) 움직이는 중 탭');
  console.log(`   잡은 뒤 이동 ${Math.abs(xAfter - xBefore).toFixed(1)} pt (≈ 수 pt 이내면 정지), 선택 ${selBefore} → ${selAfter} (같아야 함)`);

  // ---------- 4) 멈춘 상태에서 탭 → 선택 + 가운데로 ----------
  await sleep(2500);
  await mouse('mousePressed', 196 + 178); await sleep(40); await mouse('mouseReleased', 196 + 178);
  await sleep(900);
  const s4 = await evalJS('({ sel: __setup.sel, x: __setup.scroller.x, want: __setup.offsetOf(__setup.sel) })');
  console.log('4) 정지 상태 탭');
  console.log(`   선택 ${selAfter} → ${s4.sel}, 오프셋 ${s4.x.toFixed(1)} / 목표 ${s4.want}`);

  ws.close();
} finally {
  chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
}
