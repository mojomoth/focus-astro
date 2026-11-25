// 의존성 없는 정적 서버.
//   npm run dev        → http://localhost:5173  (데스크톱 확인용, localhost 는 보안 컨텍스트)
//   npm run dev:https  → https://<LAN IP>:5174  (휴대폰 실기기 확인용, 카메라·마이크는 HTTPS 필수)
// HTTPS 인증서는 openssl 로 자체 서명 인증서를 .cert/ 에 만든다. 휴대폰에서 경고가 뜨면 '계속'을 누른다.
import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HTTPS = process.argv.includes('--https');
const PORT = Number(process.env.PORT || (HTTPS ? 5174 : 5173));
const HOST = HTTPS ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const lanIPs = () => Object.values(networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let file = join(ROOT, path);
    if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    if (file.includes(`${sep}.cert`) || file.includes(`${sep}scripts${sep}`)) { res.writeHead(404).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      // 이 페이지(같은 출처)에서만 카메라·마이크 허용
      'Permissions-Policy': 'camera=(self), microphone=(self)',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

async function ensureCert() {
  const dir = join(ROOT, '.cert');
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    await mkdir(dir, { recursive: true });
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...lanIPs().map((ip) => `IP:${ip}`)].join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30',
      '-keyout', key, '-out', cert, '-subj', '/CN=focus-astro-dev', '-addext', `subjectAltName=${san}`], { stdio: 'ignore' });
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

const server = HTTPS ? createHttps(await ensureCert(), handler) : createHttp(handler);
server.listen(PORT, HOST, () => {
  const proto = HTTPS ? 'https' : 'http';
  console.log(`\n  Focus Astro mockup PoC\n  ➜ ${proto}://localhost:${PORT}`);
  if (HTTPS) lanIPs().forEach((ip) => console.log(`  ➜ ${proto}://${ip}:${PORT}  (휴대폰)`));
  console.log('  ?frame=1 목업 강제 · ?frame=0 전체 화면 강제\n');
});
