#!/usr/bin/env python3
"""레퍼런스 이미지를 PoC 에셋으로 가공하고 manifest.json 을 만든다.

- 배경: docs/design/refs/space/images/*.jpg 전부 → assets/space/ (긴 변 1400px, JPEG q78)
- 행성: docs/design/refs/planet/images 중 원반 전체가 보이는 실사·상상도만 골라
        원반을 찾아 정사각형으로 잘라낸 뒤 원형 알파 마스크를 씌운다 → assets/planets/*.webp
        (외계행성 상상도 대부분은 배경·항성이 함께 그려져 있어 원형으로 자를 수 없으므로 제외)

실행: python3 scripts/build-assets.py   (pocs/idle 에서)
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent.parent
REFS = HERE.parent.parent / "docs" / "design" / "refs"
OUT = HERE / "assets"

# 파일 → (표시 이름, 회전°, 반지름 배율). 원반이 잘리지 않고 배경이 검은 이미지만.
# 화면에는 행성 윗부분(지평선)만 보이므로, 위상 때문에 어두운 면이 있는 행성은 밝은 면이 위로 오게 돌린다.
# 목성은 편평도(약 6.5%)가 커서 적도 반지름으로 맞추면 극 위아래에 검은 띠가 생기므로 극반지름으로 줄인다.
PLANETS = {
    "earth.jpg": ("지구", 0, 1),
    "venus.jpg": ("금성", -90, 1),       # 오른쪽이 어둡다 → 왼쪽(밝은 면)을 위로
    "mars.jpg": ("화성", 0, 1),
    "mercury.jpg": ("수성", 90, 1),      # 왼쪽이 어둡다 → 오른쪽을 위로
    "jupiter.png": ("목성", 0, 0.935),
    "uranus.png": ("천왕성", 0, 1),
    "neptune.png": ("해왕성", 0, 1),
    "pluto.png": ("명왕성", 0, 1),
    "trappist-1e.png": ("트라피스트-1 e", -90, 1),
    "trappist-1f.png": ("트라피스트-1 f", -90, 1),
}
# 대기광 색을 직접 지정할 행성 (지구 윗부분은 흰 구름이라 평균색으로는 푸른 대기가 안 나온다)
GLOW_OVERRIDE = {"earth": "#8fc4ff"}

PLANET_PX = 1024
  # 화면 폭의 약 2.4배로 확대하므로 너무 줄이지 않는다


def find_disc(im: Image.Image):
    """원반의 (cx, cy, r) 을 구한다.

    1) 밝기 임계값으로 마스크를 만들고 행마다 가장 왼쪽·오른쪽 밝은 점, 열마다 위·아래 점을 경계점으로 모은다.
    2) 최소제곱 원 맞춤(Kasa) 후, 맞춘 원보다 안쪽에 있는 점(밤 쪽 터미네이터 등)을 버리고 다시 맞춘다.
       바깥 경계(실제 테두리)만 남아 어두운 면이 있는 행성도 중심이 밀리지 않는다.
    """
    g = im.convert("L").filter(ImageFilter.MedianFilter(5))
    W, H = g.size
    px = g.tobytes()
    on = lambda x, y: px[y * W + x] > 14
    pts = []
    for y in range(0, H, 2):
        row = [x for x in range(W) if on(x, y)]
        if len(row) > 8:
            pts += [(row[0], y), (row[-1], y)]
    for x in range(0, W, 2):
        col = [y for y in range(H) if on(x, y)]
        if len(col) > 8:
            pts += [(x, col[0]), (x, col[-1])]

    def fit(ps):
        # 최소제곱: x²+y² = 2a·x + 2b·y + c  → 3×3 정규방정식
        S = [[0.0] * 4 for _ in range(3)]
        for x, y in ps:
            row = (2 * x, 2 * y, 1.0); rhs = x * x + y * y
            for i in range(3):
                for j in range(3):
                    S[i][j] += row[i] * row[j]
                S[i][3] += row[i] * rhs
        for i in range(3):  # 가우스 소거
            for k in range(i + 1, 3):
                f = S[k][i] / S[i][i]
                for j in range(i, 4):
                    S[k][j] -= f * S[i][j]
        sol = [0.0] * 3
        for i in (2, 1, 0):
            sol[i] = (S[i][3] - sum(S[i][j] * sol[j] for j in range(i + 1, 3))) / S[i][i]
        a, b, c = sol
        return a, b, math.sqrt(c + a * a + b * b)

    if len(pts) < 40:
        raise ValueError(f"원반 경계점이 부족함({len(pts)}개): 검은 배경 위 행성 이미지인지 확인")
    keep = pts
    for _ in range(6):
        if len(keep) < 40:
            raise ValueError("원 맞춤 중 경계점이 부족해짐")
        cx, cy, r = fit(keep)
        tol = max(4.0, r * 0.01)
        keep = [(x, y) for x, y in pts if math.hypot(x - cx, y - cy) > r - tol]  # 안쪽 점(터미네이터) 제거
    # 맞춘 원이 이미지 경계를 넘으면 바깥은 검게 채워지므로 반지름을 줄인다
    r = min(r, cx, cy, W - cx, H - cy)
    return cx, cy, r


def cut_planet(src: Path, dst: Path, rot: float, k: float):
    im = Image.open(src).convert("RGB")
    cx, cy, r = find_disc(im)
    r *= k
    r *= 0.985  # 가장자리의 검은 테두리·계단 현상을 살짝 안쪽에서 자른다
    box = (round(cx - r), round(cy - r), round(cx + r), round(cy + r))
    disc = im.crop(box).resize((PLANET_PX, PLANET_PX), Image.LANCZOS)
    if rot:
        disc = disc.rotate(rot, Image.BICUBIC)  # 양수 = 반시계
    # 4배 크기로 그린 뒤 줄여서 안티앨리어싱된 원형 마스크를 만든다
    m = Image.new("L", (PLANET_PX * 4, PLANET_PX * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, PLANET_PX * 4 - 1, PLANET_PX * 4 - 1), fill=255)
    disc.putalpha(m.resize((PLANET_PX, PLANET_PX), Image.LANCZOS))
    disc.save(dst, quality=86, method=6)  # 알파 포함 WebP: PNG 대비 약 1/8 크기
    # 대기광 색: 지평선으로 보이는 윗부분(상단 12%) 띠의 평균색을 밝게 끌어올린다
    band = disc.crop((PLANET_PX // 4, int(PLANET_PX * 0.02), PLANET_PX * 3 // 4, int(PLANET_PX * 0.12))).convert("RGB")
    c = band.resize((1, 1), Image.BOX).getpixel((0, 0))
    hi = max(c) or 1
    return "#%02x%02x%02x" % tuple(min(255, round(v * 235 / hi * 0.7 + 255 * 0.3)) for v in c)


def main():
    (OUT / "space").mkdir(parents=True, exist_ok=True)
    (OUT / "planets").mkdir(parents=True, exist_ok=True)

    spaces = []
    for src in sorted((REFS / "space" / "images").glob("*.jpg")):
        im = Image.open(src).convert("RGB")
        im.thumbnail((1400, 1400), Image.LANCZOS)
        im.save(OUT / "space" / src.name, quality=78, optimize=True, progressive=True)
        spaces.append(src.name)

    planets = []
    for name, (label, rot, k) in PLANETS.items():
        dst = OUT / "planets" / (Path(name).stem + ".webp")
        glow = cut_planet(REFS / "planet" / "images" / name, dst, rot, k)
        planets.append({"id": dst.stem, "name": label, "src": f"assets/planets/{dst.name}", "glow": GLOW_OVERRIDE.get(dst.stem, glow)})

    manifest = {
        "space": [f"assets/space/{n}" for n in spaces],
        "planets": planets,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"space {len(spaces)}장, planets {len(planets)}개 → {OUT}")


if __name__ == "__main__":
    main()
