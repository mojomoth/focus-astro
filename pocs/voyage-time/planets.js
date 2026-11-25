// 출처: docs/design/refs/planet/README.md (2026-11-25 크롤링)
// 태양계 행성은 AU, 외계행성은 광년(ly)으로 적는다. 시뮬레이터는 모두 광년으로 바꿔서 계산한다.
// kind: 'origin'(출발점) · 'planet'(행성) · 'waypoint'(기획서 마일스톤, 중간 기착지)
// region: 'solar'(태양계) · 'edge'(태양계 경계) · 'near'(100광년 이내) · 'far'(100~2,000광년) · 'deep'(은하 깊은 곳)
export const LY_PER_AU = 1 / 63241;

const AU = (v) => v * LY_PER_AU;

export const BODIES = [
  { no: 0, ko: '지구', en: 'Earth', d: 0, unit: 'au', raw: 0, img: 'earth', kind: 'origin', region: 'solar' },
  { no: 1, ko: '금성', en: 'Venus', d: AU(0.277), unit: 'au', raw: 0.277, img: 'venus', region: 'solar' },
  { no: 2, ko: '화성', en: 'Mars', d: AU(0.524), unit: 'au', raw: 0.524, img: 'mars', region: 'solar' },
  { no: 3, ko: '수성', en: 'Mercury', d: AU(0.613), unit: 'au', raw: 0.613, img: 'mercury', region: 'solar' },
  { no: 4, ko: '목성', en: 'Jupiter', d: AU(4.203), unit: 'au', raw: 4.203, img: 'jupiter', region: 'solar' },
  { no: 5, ko: '토성', en: 'Saturn', d: AU(8.537), unit: 'au', raw: 8.537, img: 'saturn', region: 'solar' },
  { no: 6, ko: '천왕성', en: 'Uranus', d: AU(18.191), unit: 'au', raw: 18.191, img: 'uranus', region: 'solar' },
  { no: 7, ko: '해왕성', en: 'Neptune', d: AU(29.069), unit: 'au', raw: 29.069, img: 'neptune', region: 'solar' },
  { no: 'W1', ko: '헬리오포즈 통과', en: 'Heliopause', d: AU(120), unit: 'au', raw: 120, kind: 'waypoint', region: 'edge', note: '기획서 마일스톤 · 성간 공간 진입' },
  { no: 'W2', ko: '오르트 구름 탈출', en: 'Oort Cloud', d: 1.5, unit: 'ly', raw: 1.5, kind: 'waypoint', region: 'edge', note: '기획서 마일스톤(추정치) · 태양계 탈출' },
  { no: 8, ko: '프록시마 센타우리 b', en: 'Proxima Cen b', d: 4.24, unit: 'ly', raw: 4.24, img: 'proxima-centauri-b', region: 'near', note: '첫 외계행성 · 공유 카드' },
  { no: 9, ko: '프록시마 센타우리 d', en: 'Proxima Cen d', d: 4.24, unit: 'ly', raw: 4.24, img: 'proxima-centauri-d', region: 'near', system: 'Proxima' },
  { no: 10, ko: '바너드별 b', en: 'Barnard b', d: 5.96, unit: 'ly', raw: 5.96, img: 'barnards-star-b', region: 'near' },
  { no: 11, ko: '에리다누스자리 엡실론 b', en: 'eps Eri b', d: 10.45, unit: 'ly', raw: 10.45, img: 'epsilon-eridani-b', region: 'near' },
  { no: 12, ko: '로스 128 b', en: 'Ross 128 b', d: 11.01, unit: 'ly', raw: 11.01, img: 'ross-128-b', region: 'near' },
  { no: 13, ko: '티가든별 b', en: "Teegarden's Star b", d: 12.49, unit: 'ly', raw: 12.49, img: 'teegardens-star-b', region: 'near' },
  { no: 14, ko: '울프 1061 c', en: 'Wolf 1061 c', d: 14.04, unit: 'ly', raw: 14.04, img: 'wolf-1061-c', region: 'near' },
  { no: 15, ko: '글리제 876 b', en: 'GJ 876 b', d: 15.25, unit: 'ly', raw: 15.25, img: 'gliese-876-b', region: 'near' },
  { no: 16, ko: '글리제 581 c', en: 'GJ 581 c', d: 20.54, unit: 'ly', raw: 20.54, img: 'gliese-581-c', region: 'near' },
  { no: 17, ko: '글리제 667 Cc', en: 'GJ 667 C c', d: 23.63, unit: 'ly', raw: 23.63, img: 'gliese-667-cc', region: 'near' },
  { no: 18, ko: '현미경자리 AU b', en: 'AU Mic b', d: 31.71, unit: 'ly', raw: 31.71, img: 'au-mic-b', region: 'near' },
  { no: 19, ko: '글리제 12 b', en: 'Gliese 12 b', d: 39.82, unit: 'ly', raw: 39.82, img: 'gliese-12-b', region: 'near' },
  { no: 20, ko: '트라피스트-1 e', en: 'TRAPPIST-1 e', d: 40.54, unit: 'ly', raw: 40.54, img: 'trappist-1e', region: 'near' },
  { no: 21, ko: '트라피스트-1 f', en: 'TRAPPIST-1 f', d: 40.54, unit: 'ly', raw: 40.54, img: 'trappist-1f', region: 'near', system: 'TRAPPIST-1' },
  { no: 22, ko: '게자리 55 e', en: '55 Cnc e', d: 41.05, unit: 'ly', raw: 41.05, img: '55-cancri-e', region: 'near' },
  { no: 23, ko: '글리제 1214 b', en: 'GJ 1214 b', d: 47.76, unit: 'ly', raw: 47.76, img: 'gj-1214-b', region: 'near' },
  { no: 24, ko: 'LHS 1140 b', en: 'LHS 1140 b', d: 48.88, unit: 'ly', raw: 48.88, img: 'lhs-1140-b', region: 'near' },
  { no: 25, ko: '페가수스자리 51 b', en: '51 Peg b', d: 50.43, unit: 'ly', raw: 50.43, img: '51-pegasi-b', region: 'near' },
  { no: 26, ko: '화가자리 베타 b', en: 'bet Pic b', d: 64.40, unit: 'ly', raw: 64.40, img: 'beta-pictoris-b', region: 'near' },
  { no: 27, ko: 'HD 189733 b', en: 'HD 189733 b', d: 64.46, unit: 'ly', raw: 64.46, img: 'hd-189733-b', region: 'near' },
  { no: 28, ko: 'TOI-700 d', en: 'TOI-700 d', d: 101.5, unit: 'ly', raw: 101.5, img: 'toi-700-d', region: 'far' },
  { no: 29, ko: 'K2-18 b', en: 'K2-18 b', d: 124.0, unit: 'ly', raw: 124.0, img: 'k2-18-b', region: 'far' },
  { no: 30, ko: 'HR 8799 b', en: 'HR 8799 b', d: 134.5, unit: 'ly', raw: 134.5, img: 'hr-8799-b', region: 'far' },
  { no: 31, ko: 'HD 209458 b (오시리스)', en: 'HD 209458 b', d: 157.5, unit: 'ly', raw: 157.5, img: 'hd-209458-b', region: 'far' },
  { no: 32, ko: '케플러-16 b', en: 'Kepler-16 b', d: 244.9, unit: 'ly', raw: 244.9, img: 'kepler-16b', region: 'far' },
  { no: 33, ko: '케플러-1649 c', en: 'Kepler-1649 c', d: 300.7, unit: 'ly', raw: 300.7, img: 'kepler-1649c', region: 'far' },
  { no: 34, ko: '케플러-186 f', en: 'Kepler-186 f', d: 579.2, unit: 'ly', raw: 579.2, img: 'kepler-186f', region: 'far' },
  { no: 35, ko: '케플러-22 b', en: 'Kepler-22 b', d: 634.8, unit: 'ly', raw: 634.8, img: 'kepler-22b', region: 'far' },
  { no: 36, ko: 'KELT-9 b', en: 'KELT-9 b', d: 666.8, unit: 'ly', raw: 666.8, img: 'kelt-9b', region: 'far' },
  { no: 37, ko: 'WASP-39 b', en: 'WASP-39 b', d: 697.9, unit: 'ly', raw: 697.9, img: 'wasp-39b', region: 'far' },
  { no: 38, ko: 'WASP-121 b', en: 'WASP-121 b', d: 880.3, unit: 'ly', raw: 880.3, img: 'wasp-121b', region: 'far' },
  { no: 39, ko: 'WASP-12 b', en: 'WASP-12 b', d: 1393, unit: 'ly', raw: 1393, img: 'wasp-12b', region: 'far' },
  { no: 40, ko: '케플러-452 b', en: 'Kepler-452 b', d: 1799, unit: 'ly', raw: 1799, img: 'kepler-452b', region: 'far' },
  { no: 41, ko: 'PSR B1257+12 c (폴터가이스트)', en: 'PSR B1257+12 c', d: 1957, unit: 'ly', raw: 1957, img: 'psr-b1257-12-c', region: 'far' },
  { no: 42, ko: 'OGLE-2016-BLG-1195L b', en: 'OGLE-2016-BLG-1195L b', d: 12753, unit: 'ly', raw: 12753, img: 'ogle-2016-blg-1195lb', region: 'deep' },
  { no: 43, ko: 'OGLE-2005-BLG-390L b', en: 'OGLE-2005-BLG-390L b', d: 21526, unit: 'ly', raw: 21526, img: 'ogle-2005-blg-390lb', region: 'deep' },
  { no: 44, ko: 'SWEEPS-11 b', en: 'SWEEPS-11 b', d: 27723, unit: 'ly', raw: 27723, img: null, region: 'deep', note: '최종 목적지 · 우리은하 중심부' },
];

export const REGION_LABEL = {
  solar: '태양계',
  edge: '태양계 경계',
  near: '근처 별 (≤100광년)',
  far: '먼 별 (100~2,000광년)',
  deep: '은하 깊은 곳',
};
