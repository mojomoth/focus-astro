// docs/design/refs/planet/README.md 의 행성 표를 읽어 data/planets.js 와 assets/thumbs/*.jpg 를 만든다.
//   node scripts/build-data.mjs
// - 지구(no 0, 출발점)와 이미지가 없는 행(SWEEPS-11 b)은 뺀다.
// - 썸네일: 320px 정사각 중앙 크롭 (ffmpeg)
// - 집중 시간: 태양계는 30분 간격 게임 값(ui-v4와 동일), 외계행성은 README 규칙 1광년 = 집중 1시간.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REF = resolve(ROOT, '../../docs/design/refs/planet');
const md = readFileSync(join(REF, 'README.md'), 'utf8');

// 배지 코드(공항 코드처럼 3자). README에는 코드가 없어서 직접 정한다.
const CODE = {
  'Venus': 'VEN', 'Mars': 'MRS', 'Mercury': 'MER', 'Jupiter': 'JUP', 'Saturn': 'SAT', 'Uranus': 'URA', 'Neptune': 'NEP',
  'Proxima Cen b': 'PXB', 'Proxima Cen d': 'PXD', 'Barnard b': 'BNB', 'eps Eri b': 'EPS', 'Ross 128 b': 'RSS',
  "Teegarden's Star b": 'TGB', 'Wolf 1061 c': 'WFC', 'GJ 876 b': 'GJ8', 'GJ 581 c': 'GJ5', 'GJ 667 C c': 'GJ6',
  'AU Mic b': 'AUM', 'Gliese 12 b': 'G12', 'TRAPPIST-1 e': 'T1E', 'TRAPPIST-1 f': 'T1F', '55 Cnc e': 'CNC',
  'GJ 1214 b': 'GJ1', 'LHS 1140 b': 'LHS', '51 Peg b': 'PEG', 'bet Pic b': 'PIC', 'HD 189733 b': 'HD1',
  'TOI-700 d': 'TOI', 'K2-18 b': 'K2B', 'HR 8799 b': 'HR8', 'HD 209458 b': 'HD2', 'Kepler-16 b': 'K16',
  'Kepler-1649 c': 'KPC', 'Kepler-186 f': 'KPF', 'Kepler-22 b': 'K22', 'KELT-9 b': 'KLT', 'WASP-39 b': 'W39',
  'WASP-121 b': 'WSP', 'WASP-12 b': 'W12', 'Kepler-452 b': 'K45', 'PSR B1257+12 c': 'PSR',
  'OGLE-2016-BLG-1195L b': 'OG6', 'OGLE-2005-BLG-390L b': 'OG5',
};
const SOLAR_MIN = { Venus: 30, Mars: 60, Mercury: 90, Jupiter: 120, Saturn: 150, Uranus: 180, Neptune: 210 };

// 비고에서 카드 한 줄 설명으로 쓰지 않을 조각
const SKIP = [/^태양계$/, /^상상도/, /^실사/, /^이미지는/, /^CC BY/, /^공개 라이선스/, /^⚠️/, /^앱의 첫/, /^기획서/];

const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l));
const out = [];
mkdirSync(join(ROOT, 'assets/thumbs'), { recursive: true });

for (const line of rows) {
  const cells = line.split(' | ').map((c) => c.replace(/^\|\s*|\s*\|$/g, '').trim());
  const [no, nameCell, distCell, imgCell, noteCell] = cells;
  if (no === '0') continue; // 지구 = 출발점
  const img = imgCell.match(/src="images\/([^"]+)"/)?.[1];
  if (!img) continue; // 이미지 없는 행 제외

  const [koRaw, enTick] = nameCell.split('<br>');
  let ko = koRaw.replace(/\s*\(.*\)\s*$/, '').trim();
  let en = enTick ? enTick.replace(/`/g, '').trim() : koRaw.match(/\((.+)\)/)?.[1];
  const solar = noteCell.startsWith('태양계');

  const parts = distCell.split('<br>').map((s) => s.replace(/^[=≈]\s*/, '').trim());
  const dist = parts[0];                         // "0.524 AU" | "4.24 광년"
  const dist2 = (parts[1] || '').replace(/[()]/g, ''); // "약 7,834만 km" | "1.30 pc"
  const ly = solar ? null : Number(dist.replace(/[^\d.]/g, ''));
  const min = solar ? SOLAR_MIN[en] : Math.round(ly * 60);

  const note = noteCell.split(' · ').map((s) => s.trim()).find((s) => !SKIP.some((r) => r.test(s))) || dist2;

  const thumb = basename(img, extname(img)) + '.jpg';
  const dst = join(ROOT, 'assets/thumbs', thumb);
  if (!existsSync(dst)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(REF, 'images', img),
      '-vf', 'scale=320:320:force_original_aspect_ratio=increase,crop=320:320', '-q:v', '3', dst]);
  }

  out.push({ no: +no, code: CODE[en] || en.slice(0, 3).toUpperCase(), name: ko, en, kind: solar ? '태양계' : '외계행성',
    img: `assets/thumbs/${thumb}`, dist, dist2, min, note });
}

writeFileSync(join(ROOT, 'data/planets.js'),
  `// 자동 생성: node scripts/build-data.mjs  (출처: docs/design/refs/planet/README.md)\n`
  + `export const PLANETS = ${JSON.stringify(out, null, 2)};\n`);
console.log(`${out.length}개 행성 → data/planets.js`);
