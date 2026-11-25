// 헤드리스 Chrome(CDP)으로 데스크톱·모바일 전체 페이지를 캡처하고 콘솔 오류를 출력한다.
//   node scripts/shots.mjs <outDir> [url] [suffix]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] || 'verify');
const url = process.argv[3] || 'http://127.0.0.1:5180/';
const suffix = process.argv[4] || '1';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'fa-vt-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
async function json(path, method = 'GET') {
  for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json(); } catch { await sleep(200); } }
  throw new Error('chrome not reachable');
}
const VIEWS = [['desktop', 1440, 900, 1, false], ['mobile', 390, 844, 2, true]];
try {
  await json('/json/version');
  for (const [name, w, h, dpr, mobile] of VIEWS) {
    const t = await json('/json/new?about:blank', 'PUT');
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0; const pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') console.log(`[${name}] EXCEPTION`, m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.log(`[${name}] console.${m.params.type}`, m.params.args.map((a) => a.value ?? a.description).join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') console.log(`[${name}] log`, m.params.entry.text, m.params.entry.url || '');
    });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
    await send('Page.navigate', { url });
    await sleep(2500);
    const m = await send('Runtime.evaluate', { expression: 'JSON.stringify([document.documentElement.scrollWidth, document.documentElement.scrollHeight])', returnByValue: true });
    const [sw, sh] = JSON.parse(m.result.value);
    console.log(`[${name}] scrollWidth=${sw} (viewport ${w}) height=${sh}`);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: sh, deviceScaleFactor: dpr, mobile });
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, captureBeyondViewport: true });
    writeFileSync(join(out, `${name}-${suffix}.jpeg`), Buffer.from(shot.data, 'base64'));
    ws.close();
  }
} finally { chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
