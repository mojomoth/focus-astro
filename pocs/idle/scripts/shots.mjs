// 헤드리스 Chrome(CDP)으로 캡처하고 우주선 위치·움직임을 잰다.
//   node scripts/shots.mjs <outDir> [baseUrl]
// - 시안과 같은 393×852 @3x 전체 화면: 행성 몇 개를 고정해 캡처
// - 1440×900 데스크톱 목업 캡처
// - 우주선 중심이 화면 정중앙인지, 위아래로 떠다니는 폭과 주기를 측정해 출력
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] || 'shots');
const base = process.argv[3] || 'http://127.0.0.1:5195/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });

const SHOTS = [
  { name: 'full-earth', q: 'frame=0&sb=1&planet=earth&bg=hubble-ultra-deep-field-heic0406a', w: 393, h: 852, dpr: 3, mobile: true },
  { name: 'full-mars', q: 'frame=0&sb=1&planet=mars&bg=lagoon-nebula-eso0936a', w: 393, h: 852, dpr: 3, mobile: true },
  { name: 'full-jupiter', q: 'frame=0&sb=1&planet=jupiter&bg=carina-cosmic-cliffs-webb-nircam-weic2205a', w: 393, h: 852, dpr: 3, mobile: true },
  { name: 'full-trappist', q: 'frame=0&sb=1&planet=trappist-1e&bg=milky-way-panorama-eso0932a', w: 393, h: 852, dpr: 3, mobile: true },
  { name: 'full-random', q: 'frame=0&sb=1', w: 393, h: 852, dpr: 3, mobile: true },
  { name: 'full-se', q: 'frame=0&planet=neptune', w: 375, h: 667, dpr: 2, mobile: true },
  { name: 'full-landscape', q: 'frame=0&planet=venus', w: 852, h: 393, dpr: 2, mobile: true },
  { name: 'desktop-mockup', q: 'frame=1&planet=earth', w: 1440, h: 900, dpr: 1, mobile: false },
];

const profile = mkdtempSync(join(tmpdir(), 'fa-idle-'));
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

async function json(path, method = 'GET') {
  for (let i = 0; i < 50; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json(); } catch { await sleep(200); }
  }
  throw new Error('chrome not reachable');
}

async function open(s) {
  const t = await json('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const events = []; const logs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + m.params.exceptionDetails.text);
    else if (m.method) events.push(m.method);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr, mobile: s.mobile });
  if (s.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `${base}?${s.q}` });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  let ready = false;
  for (let i = 0; i < 80 && !(ready = await evaluate(`document.querySelector('#app').classList.contains('is-ready')`)); i++) await sleep(100);
  if (!ready) throw new Error(`${s.name}: 장면 준비 시간 초과`);
  // 고정 파라미터가 실제로 반영됐는지 확인 (로드 실패 시 이전/빈 장면으로 남는다)
  const q = new URLSearchParams(s.q);
  const got = await evaluate(`({ planet: document.querySelector('#app').dataset.planet, space: document.querySelector('#app').dataset.space })`);
  if (!got.planet || !got.space) throw new Error(`${s.name}: 배경 또는 행성이 비어 있음 ${JSON.stringify(got)}`);
  if (q.get('planet') && got.planet !== q.get('planet')) throw new Error(`${s.name}: planet 불일치 ${got.planet}`);
  if (q.get('bg') && got.space !== q.get('bg')) throw new Error(`${s.name}: bg 불일치 ${got.space}`);
  await sleep(1800); // 페이드인·행성 상승 전환 완료
  const close = async () => { ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}); };
  return { send, evaluate, close, logs };
}

const PROBE = `(() => {
  const a = document.querySelector('#app').getBoundingClientRect();
  const sh = document.querySelector('.ship img').getBoundingClientRect();
  const p = document.querySelector('.planet').getBoundingClientRect();
  return { app: [a.width, a.height], cx: (sh.left + sh.width / 2 - a.left) / a.width, cy: (sh.top + sh.height / 2 - a.top) / a.height,
           shipTop: sh.top - a.top, shipW: sh.width, horizon: (p.top - a.top) / a.height,
           planet: document.querySelector('#app').dataset.planet, space: document.querySelector('#app').dataset.space };
})()`;

try {
  await json('/json/version');
  for (const s of SHOTS) {
    const pg = await open(s);
    const { data } = await pg.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${s.name}.png`, Buffer.from(data, 'base64'));
    const m = await pg.evaluate(PROBE);
    console.log(s.name, JSON.stringify({ ...m, cx: +m.cx.toFixed(3), cy: +m.cy.toFixed(3), horizon: +m.horizon.toFixed(3) }), pg.logs.length ? pg.logs : '');
    // 떠다니는 움직임: 6초 동안 200ms 간격으로 우주선 위치 샘플링
    if (s.name === 'full-earth') {
      const ys = [];
      for (let i = 0; i < 30; i++) { ys.push((await pg.evaluate(PROBE)).shipTop); await sleep(200); }
      const min = Math.min(...ys), max = Math.max(...ys);
      console.log('float: 진폭', (max - min).toFixed(1), 'px, 샘플', ys.map((y) => y.toFixed(1)).join(' '));
      // R 키로 다시 뽑기
      const before = await pg.evaluate(PROBE);
      await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR', text: 'r' });
      await sleep(2500);
      const after = await pg.evaluate(PROBE);
      console.log('reroll:', before.planet, before.space, '→', after.planet, after.space);
    }
    await pg.close();
  }
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
