import { Hono } from "hono";
import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { installAssetCaching, installCompression } from "./compress";

// Node's undici does not decode Content-Encoding for us, so the body is checked
// by decompressing it, exactly what a browser does before executing it.
async function decoded(res: Response) {
  const raw = Buffer.from(await res.arrayBuffer());
  return res.headers.get("content-encoding") === "br"
    ? zlib.brotliDecompressSync(raw).toString("utf8")
    : raw.toString("utf8");
}

function appWith(body: string, type: string) {
  const app = new Hono();
  installCompression(app);
  app.get("/x", (c) => c.body(body, 200, { "content-type": type }));
  return app;
}

const BIG = "export const value = 1;\n".repeat(200);

describe("installCompression", () => {
  // Regression guard for the outage this middleware caused: Hono copies the
  // previous response's headers onto a new one for every header EXCEPT
  // content-type. Compressing without restoring it turned the entry bundle into
  // text/plain, the browser refused to execute it as a module, and every route
  // sat on its loading state forever.
  it("keeps the module MIME type on a compressed response", async () => {
    const res = await appWith(BIG, "text/javascript; charset=utf-8").request("/x", {
      headers: { "accept-encoding": "br" },
    });
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("content-encoding")).toBe("br");
    expect(await decoded(res)).toBe(BIG);
  });

  it("keeps the HTML MIME type, which is what makes the shell render at all", async () => {
    const html = `<!doctype html><body>${"<p>hello</p>".repeat(200)}</body>`;
    const res = await appWith(html, "text/html; charset=UTF-8").request("/x", {
      headers: { "accept-encoding": "br" },
    });
    expect(res.headers.get("content-type")).toBe("text/html; charset=UTF-8");
    expect(await decoded(res)).toBe(html);
  });

  it("compresses only when the client asked for it", async () => {
    const res = await appWith(BIG, "text/javascript").request("/x");
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await decoded(res)).toBe(BIG);
  });

  it("leaves small and non-text bodies alone", async () => {
    const tiny = await appWith("ok", "text/plain").request("/x", {
      headers: { "accept-encoding": "br" },
    });
    expect(tiny.headers.get("content-encoding")).toBeNull();

    const png = new Hono();
    installCompression(png);
    png.get("/img", (c) => c.body(new Uint8Array(4096), 200, { "content-type": "image/png" }));
    const image = await png.request("/img", { headers: { "accept-encoding": "br" } });
    expect(image.headers.get("content-encoding")).toBeNull();
  });
});

describe("installAssetCaching", () => {
  it("marks hashed build output immutable", async () => {
    const app = new Hono();
    installAssetCaching(app);
    app.get("/assets/app-abc123.js", (c) => c.body("x"));
    const res = await app.request("/assets/app-abc123.js");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("does not touch other paths", async () => {
    const app = new Hono();
    installAssetCaching(app);
    app.get("/api/thing", (c) => c.json({ ok: true }));
    const res = await app.request("/api/thing");
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
