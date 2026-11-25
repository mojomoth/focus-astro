// 의존성 없는 로컬 서버: 정적 파일 + 밸런스 기록 API
//   node scripts/serve.mjs        → http://127.0.0.1:5180
//
//   GET  /api/balance             기록된 버전 목록
//   POST /api/balance             { version, memo, params } → docs/design/freeze/balance/{version}/ 에 기록
//
// 기록 폴더 구성: balance.json(앱 구현용 수치) + README.md(사람용 요약). 같은 버전은 덮어쓰지 않는다(409).
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFreeze, VERSION_RE } from '../freeze.js';
import { fmtDur } from '../sim.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO = resolve(ROOT, '../..');
const FREEZE_DIR = process.env.FREEZE_DIR ? resolve(process.env.FREEZE_DIR) : join(REPO, 'docs/design/freeze/balance'); // FREEZE_DIR은 테스트용
const PORT = Number(process.env.PORT || 5180);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
};

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const cmpVersion = (a, b) => {
  const pa = a.slice(1).split('.').map(Number), pb = b.slice(1).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

async function listVersions() {
  const names = await readdir(FREEZE_DIR).catch(() => []);
  const out = [];
  for (const name of names.filter((n) => VERSION_RE.test(n))) {
    try {
      const j = JSON.parse(await readFile(join(FREEZE_DIR, name, 'balance.json'), 'utf8'));
      out.push({
        version: j.version, frozenAt: j.frozenAt, memo: j.memo, model: j.model, modelName: j.modelName,
        checksPassed: j.checksPassed, days: j.totals.days, focusMin: j.totals.focusMin, maxLegWallMin: j.totals.maxLegWallMin,
        params: j.params, path: relative(REPO, join(FREEZE_DIR, name)),
      });
    } catch { /* balance.json이 없거나 깨진 폴더는 건너뛴다 */ }
  }
  return out.sort((a, b) => cmpVersion(a.version, b.version));
}

async function writeIndex() {
  const list = await listVersions();
  const lines = [
    '# 항해 밸런스 기록', '',
    '`pocs/voyage-time` 시뮬레이터에서 결정한 밸런스의 스냅숏이다. 버전 폴더마다 `README.md`(요약)와 `balance.json`(구간별 수치)이 있다.',
    '기록은 시뮬레이터의 **밸런스 기록** 버튼으로 남긴다(`node scripts/serve.mjs`로 실행해야 한다). 같은 버전은 덮어쓰지 않는다.', '',
    '| 버전 | 기록일 | 모델 | 체크 | 완주 | 누적 집중 | 최장 구간 | 메모 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...list.map((v) => `| [${v.version}](${v.version}/README.md) | ${v.frozenAt.slice(0, 10)} | ${v.modelName} | ${v.checksPassed} | ${v.days}일 | ${fmtDur(v.focusMin)} | ${fmtDur(v.maxLegWallMin)} | ${(v.memo || '').split('\n')[0].replace(/\|/g, '\\|').slice(0, 60)} |`),
    '',
  ];
  await writeFile(join(FREEZE_DIR, 'README.md'), lines.join('\n'));
}

async function readBody(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('요청이 너무 크다'), { code: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function api(req, res, url) {
  if (url.pathname !== '/api/balance') return send(res, 404, { error: 'not found' });
  if (req.method === 'GET') return send(res, 200, { versions: await listVersions(), dir: relative(REPO, FREEZE_DIR) });
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, e.code || 400, { error: e.code ? e.message : 'JSON 형식이 아니다' }); }
  const version = String(body.version || '').trim();
  const memo = String(body.memo || '').slice(0, 4000);
  let built;
  try { built = buildFreeze({ version, memo, params: body.params }); } catch (e) { return send(res, 400, { error: e.message }); }

  const dir = join(FREEZE_DIR, version);
  await mkdir(FREEZE_DIR, { recursive: true });
  try {
    await mkdir(dir); // 이미 있으면 EEXIST → 덮어쓰지 않는다
  } catch (e) {
    if (e.code === 'EEXIST') return send(res, 409, { error: `${version}은(는) 이미 기록돼 있다. 새 버전으로 기록한다.` });
    throw e;
  }
  try {
    await writeFile(join(dir, 'balance.json'), `${JSON.stringify(built.json, null, 2)}\n`);
    await writeFile(join(dir, 'README.md'), built.markdown);
    await writeIndex();
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
  console.log(`[freeze] ${relative(REPO, dir)} (${built.passed}/${built.total})`);
  return send(res, 201, { version, path: relative(REPO, dir), passed: built.passed, total: built.total });
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let file = join(ROOT, path);
    if (!file.startsWith(ROOT + sep) && file !== ROOT) return send(res, 403, 'forbidden', 'text/plain');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    send(res, 200, body, TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, 'not found', 'text/plain');
    console.error(e);
    send(res, 500, { error: '서버 오류' });
  }
}

createServer(handler).listen(PORT, HOST, () => {
  console.log(`항해 시간 시뮬레이터 → http://${HOST}:${PORT}/`);
  console.log(`밸런스 기록 위치   → ${relative(process.cwd(), FREEZE_DIR) || FREEZE_DIR}`);
});
