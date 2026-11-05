import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { installAssetCaching, installCompression } from "./compress";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  // Both wrappers must be registered before serveStatic so they see the
  // response it produces. Compression also catches the SPA shell, which is
  // rendered by notFound() rather than by a route.
  installCompression(app);
  installAssetCaching(app);

  app.use("*", async (c, next) => {
    await next();
    // HTML and the worker are deployment pointers, not immutable assets. Never
    // let a browser or preview proxy pin them after a new bundle is saved.
    if (c.req.path === "/" || c.req.path.endsWith(".html") || c.req.path === "/sw.js") {
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  });

  // Model shards are content-addressed by model id and never change in place;
  // without this a reload re-fetched 40–120 MB over Tailscale. The Cache API
  // transformers.js uses is the first line of defence, but private browsing
  // disables it, and the HTTP cache is the fallback that still works there.
  //
  // CORP/ACAO are not decoration: the Whisper Lab page is cross-origin
  // isolated (COEP: require-corp), and an isolated document refuses ANY
  // response that neither matches its origin exactly nor carries an explicit
  // cross-origin resource policy. Requests issued from a blob:-URL worker are
  // exactly the case where "same origin" stops applying.
  app.use("/models/*", async (c, next) => {
    await next();
    c.res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    c.res.headers.set("Access-Control-Allow-Origin", "*");
    if (c.res.status === 200) {
      c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
  });

  app.use("/ort/*", async (c, next) => {
    await next();
    c.res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    c.res.headers.set("Access-Control-Allow-Origin", "*");
  });

  // The ONNX runtime is 28 MB of WebAssembly and every first visit pays for it.
  // It compresses ~3.5:1, which on the slow links this bench is meant to test is
  // the difference between four minutes and one. Compressed once per process, to
  // a temp dir, so the repo and the asset guard stay untouched.
  const brCacheDir = path.join(os.tmpdir(), "skopein-ort-br");
  app.use("/ort/*", async (c, next) => {
    const p = c.req.path;
    const acceptsBr = (c.req.header("accept-encoding") ?? "").includes("br");
    if (!acceptsBr || !p.endsWith(".wasm") || c.req.header("range")) return next();
    const source = path.join(process.cwd(), "dist/public", p.replace(/^\//, ""));
    if (!fs.existsSync(source)) return next();
    const cached = path.join(brCacheDir, `${path.basename(p)}.br`);
    try {
      if (!fs.existsSync(cached)) {
        fs.mkdirSync(brCacheDir, { recursive: true });
        fs.writeFileSync(cached, zlib.brotliCompressSync(fs.readFileSync(source), {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
        }));
      }
      const body = fs.readFileSync(cached);
      return c.body(body as unknown as ArrayBuffer, 200, {
        "Content-Type": "application/wasm",
        "Content-Encoding": "br",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Access-Control-Allow-Origin": "*",
      });
    } catch {
      return next();
    }
  });

  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    // Deep links (/whisper-lab, /login) must survive clients that don't send a
    // browser Accept header: link previewers, the funnel's own health checks,
    // and anything that defaults to */*. A path with no file extension is a
    // route, not an asset — serve the shell and let the router decide. Real
    // missing files keep the JSON 404 so a broken asset stays diagnosable.
    const looksLikeRoute = !/\.[a-z0-9]+$/i.test(c.req.path);
    if (!accept.includes("text/html") && !looksLikeRoute) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
