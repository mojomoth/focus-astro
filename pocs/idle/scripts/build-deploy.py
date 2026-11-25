#!/usr/bin/env python3
"""claude.ai Artifact 배포용 사본을 만든다.  python3 scripts/build-deploy.py <출력 폴더>

Artifact 는 페이지를 자체 <html><head><body> 뼈대로 감싸므로 index.html 에서 head/body 태그를 걷어내고
<title>·모드 판별 스크립트·스타일시트 링크만 남긴다. 외부 스타일시트는 Google Fonts 만 허용되어
Pretendard(jsDelivr CSS)는 빼고 시스템 한글 글꼴로 대체된다. 뼈대가 color-scheme 을 light 로 고정하므로 dark 로 되돌린다.
"""
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "dist").resolve()
shutil.rmtree(out, ignore_errors=True)
(out / "assets").mkdir(parents=True)

for name in ["space", "planets"]:
    shutil.copytree(HERE / "assets" / name, out / "assets" / name)
for name in ["manifest.json", "rocket.png", "mockup-iphone.png"]:
    shutil.copy2(HERE / "assets" / name, out / "assets" / name)
shutil.copy2(HERE / "app.js", out / "app.js")
(out / "styles.css").write_text(":root { color-scheme: dark; }\n" + (HERE / "styles.css").read_text())

src = (HERE / "index.html").read_text()
head = src[src.index("<head>") + 6 : src.index("</head>")]
body = src[src.index("<body>") + 6 : src.index("</body>")]
title = re.search(r"<title>.*?</title>", head).group(0).replace("Focus Astro · 우주선 대기 PoC", "우주선 대기 PoC")
script = re.search(r"<script>.*?</script>", head, re.S).group(0)
(out / "index.html").write_text(f'{title}\n{script}\n<link rel="stylesheet" href="styles.css" />\n{body.strip()}\n')

files = sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file() and p.name != "index.html")
print(f"{out} · 파일 {len(files) + 1}개")
