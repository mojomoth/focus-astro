# 시안(v2)과 클론 스크린샷의 유사도 측정.
#   uv run --with pillow --with numpy --with scikit-image python scripts/compare.py <cloneDir> [refDir]
# 지표 (모두 0~1, 높을수록 비슷함)
#   ssim   : 흑백 구조 유사도 (393×852로 축소 후)
#   edge   : 엣지(윤곽) 맵의 SSIM → 요소 배치/레이아웃 일치도
#   color  : Lab 색 히스토그램 교차 → 톤·색감 일치도
#   score  : 0.4*ssim + 0.35*edge + 0.25*color
# 출력: <cloneDir>/compare/<name>.png (시안 | 클론 | 차이 히트맵), <cloneDir>/compare/scores.json
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from skimage.metrics import structural_similarity as ssim
from skimage.color import rgb2lab
from skimage.filters import sobel

clone = Path(sys.argv[1])
ref = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[3] / 'docs/screens/drafts/v2'
PAIRS = {'01-main': '01-main', '02-takeoff': '02-takeoff', '03-flight-focus': '03-flight-focus', '04-flight-rest': '04-flight-rest'}
MAXSHIFT = 70  # 시안 중 상태 표시줄 없이 위로 당겨진 것이 있어 세로 오프셋을 보정한다
W, H = 393, 852
out = clone / 'compare'; out.mkdir(exist_ok=True)

def load(p):
    return np.asarray(Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS)).astype(np.float64) / 255

def hist(lab):
    h, _ = np.histogramdd(lab.reshape(-1, 3), bins=(8, 12, 12), range=((0, 100), (-60, 60), (-60, 60)))
    return h / h.sum()

scores = {}
for name, rname in PAIRS.items():
    a, b = load(ref / f'{rname}.png'), load(clone / f'{name}.png')
    # 세로 오프셋 탐색: 클론을 위로 dy만큼 올렸을 때 엣지 맵이 가장 잘 맞는 값
    def edgemap(x):
        e = sobel(x.mean(2)); return np.asarray(Image.fromarray((e * 255).clip(0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(3))) / 255
    EA, EB = edgemap(a), edgemap(b)
    best = (-1, 0)
    for dy in range(-MAXSHIFT, MAXSHIFT + 1, 2):
        A = EA[max(0, -dy):H - max(0, dy)]; B = EB[max(0, dy):H - max(0, -dy)]
        v = ssim(A, B, data_range=1)
        if v > best[0]: best = (v, dy)
    dy = best[1]
    if dy:
        a = a[max(0, -dy):H - max(0, dy)]; b = b[max(0, dy):H - max(0, -dy)]
    ga, gb = a.mean(2), b.mean(2); h = a.shape[0]
    s, smap = ssim(ga, gb, data_range=1, full=True, gaussian_weights=True, sigma=1.5)
    ea, eb = sobel(ga), sobel(gb)
    ea = np.asarray(Image.fromarray((ea * 255).clip(0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(3))) / 255
    eb = np.asarray(Image.fromarray((eb * 255).clip(0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(3))) / 255
    e = ssim(ea, eb, data_range=1)
    la, lb = rgb2lab(a), rgb2lab(b)
    c = np.minimum(hist(la), hist(lb)).sum()
    score = 0.4 * s + 0.35 * e + 0.25 * c
    # 영역별(가로 1 × 세로 6) 차이: 어디가 가장 다른지
    bands = []
    for i in range(6):
        y0, y1 = i * h // 6, (i + 1) * h // 6
        bands.append(round(float(np.abs(la[y0:y1] - lb[y0:y1]).mean()), 1))
    scores[name] = {'ssim': round(float(s), 3), 'edge': round(float(e), 3), 'color': round(float(c), 3), 'score': round(float(score), 3), 'shift': dy, 'band_deltaE': bands}
    # 나란히 비교 이미지
    heat = np.abs(la - lb).mean(2); heat = (heat / max(heat.max(), 1e-6))
    hm = np.zeros((h, W, 3)); hm[..., 0] = heat; hm[..., 1] = heat * 0.3
    sheet = Image.new('RGB', (W * 3 + 20, H + 30), (20, 20, 24))
    for k, im in enumerate([a, b, hm]):
        sheet.paste(Image.fromarray((im * 255).astype('uint8')), (k * (W + 10), 30))
    d = ImageDraw.Draw(sheet)
    d.text((6, 8), f'REF v2/{rname}', fill=(200, 200, 200)); d.text((W + 16, 8), f'CLONE {name}', fill=(200, 200, 200))
    d.text((2 * W + 26, 8), f"score {score:.3f} ssim {s:.3f} edge {e:.3f} color {c:.3f} dy {dy}", fill=(255, 200, 80))
    sheet.save(out / f'{name}.png')

scores['_mean'] = round(float(np.mean([v['score'] for v in scores.values()])), 3)
(out / 'scores.json').write_text(json.dumps(scores, ensure_ascii=False, indent=2))
print(json.dumps(scores, ensure_ascii=False, indent=2))
