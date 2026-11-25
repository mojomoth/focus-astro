import { readFile, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";

const demos = new Set(["idle", "mockup", "setup-ui", "ui-v4", "voyage", "voyage-time", "clone"]);
const pageFiles = new Set([
  "index.html", "styles.css", "app.js", "manifest.webmanifest", "scroller.js", "data/planets.js",
  "shell.js", "voyage.js", "planets.js", "sim.js", "freeze.js", "assets/manifest.json",
]);

const imageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);
const pageTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".webmanifest", "application/manifest+json"],
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ demo: string; file?: string[] }> },
) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });

  const { demo, file = ["index.html"] } = await params;
  if (!demos.has(demo) || file.some((segment) => !/^[\w-]+(?:\.[\w-]+)*$/.test(segment))) {
    return new Response(null, { status: 404 });
  }

  const relativePath = file.join("/");
  const extension = extname(relativePath);
  const assetType = file[0] === "assets" ? imageTypes.get(extension) : undefined;
  const contentType = assetType ?? (pageFiles.has(relativePath) ? pageTypes.get(extension) : undefined);
  if (!contentType) return new Response(null, { status: 404 });

  try {
    const root = await realpath(join(process.cwd(), "pocs", demo));
    const path = await realpath(join(root, ...file));
    if (!path.startsWith(root + sep)) return new Response(null, { status: 404 });

    const body = await readFile(path);
    // Next.js 정규 URL에 끝 슬래시가 없어도 PoC의 상대 경로는 각 프리뷰를 기준으로 해석한다.
    const content = relativePath === "index.html"
      ? body.toString("utf8").replace("<head>", `<head><base href="/pocs/${demo}/">`)
      : new Uint8Array(body);
    return new Response(content, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
