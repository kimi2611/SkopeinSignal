import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";

type App = Hono<{ Bindings: HttpBindings }>;

/**
 * Response compression for the single-page shell.
 *
 * Why this exists: the app ships one ~1.8 MB entry bundle (the zh-CN and de UI
 * dictionaries are a large part of it) and served it raw. On a domestic mobile
 * link that is several seconds of dead time before anything paints, and every
 * reload pays it again once the cache is cold. Brotli takes that bundle to
 * roughly a fifth of its size.
 *
 * Shape of the implementation, and why:
 *   - Registered as a wrapper around `next()`, so it sees whatever the static
 *     handler or an API route produced, including the SPA shell from notFound().
 *   - Compressed payloads are cached on disk under the OS temp dir, keyed by a
 *     hash of the content itself. Assets are content-hashed by Vite, so a new
 *     build gets a new key automatically and there is nothing to invalidate.
 *     The temp dir is deliberately outside the repo: asset-guard owns public/.
 *   - Bodies below MIN_BYTES are left alone; a 200-byte JSON gains more from a
 *     plain response than from 20 bytes of framing.
 *   - Streaming/unknown-length responses are skipped rather than buffered. This
 *     middleware only ever sees fully materialised responses, so that is a
 *     non-issue in practice, and the guard keeps it that way.
 */
const MIN_BYTES = 1024;
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|xml|xhtml\+xml|manifest\+json|ld\+json|wasm)|image\/svg\+xml)/i;
const CACHE_DIR = path.join(os.tmpdir(), "skopein-http-compress");

type Encoding = "br" | "gzip";

function pickEncoding(header: string | undefined): Encoding | null {
  if (!header) return null;
  const lower = header.toLowerCase();
  // Brotli first: the same bundle lands ~15-20% smaller than gzip and every
  // browser that supports the WebCodecs/ORT features this app needs also has it.
  if (/(^|,|\s)br(;|,|$)/.test(lower)) return "br";
  if (/(^|,|\s)gzip(;|,|$)/.test(lower)) return "gzip";
  return null;
}

function compress(buffer: Buffer, encoding: Encoding): Buffer {
  if (encoding === "br") {
    return zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.byteLength,
      },
    });
  }
  return zlib.gzipSync(buffer, { level: 9 });
}

function cachedCompress(buffer: Buffer, encoding: Encoding): Buffer {
  const key = crypto.createHash("sha1").update(encoding).update(buffer).digest("hex");
  const file = path.join(CACHE_DIR, key);
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file);
  } catch {
    /* cache dir unreadable: fall through to compressing in memory */
  }
  const out = compress(buffer, encoding);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, out);
  } catch {
    /* read-only /tmp: serve the compressed bytes anyway */
  }
  return out;
}

export function installCompression(app: App) {
  app.use("*", async (c, next) => {
    await next();

    const res = c.res;
    if (res.status !== 200) return;
    if (res.headers.has("content-encoding")) return;
    if (c.req.method === "HEAD") return;

    const type = res.headers.get("content-type") ?? "";
    if (!COMPRESSIBLE.test(type)) return;

    const encoding = pickEncoding(c.req.header("accept-encoding"));
    if (!encoding) return;

    let body: Buffer;
    try {
      body = Buffer.from(await res.arrayBuffer());
    } catch {
      return;
    }

    // Always advertise the negotiation, even when the payload is too small to
    // compress, or a shared cache may hand a compressed body to a client that
    // never asked for one.
    const headers = new Headers(res.headers);
    headers.append("Vary", "Accept-Encoding");

    if (body.byteLength < MIN_BYTES) {
      c.res = new Response(body, { status: res.status, statusText: res.statusText, headers });
      return;
    }

    const compressed = cachedCompress(body, encoding);
    // A pathological incompressible payload (already-compressed media slipping
    // past the type filter) would only grow. Keep the original in that case.
    if (compressed.byteLength >= body.byteLength) {
      c.res = new Response(body, { status: res.status, statusText: res.statusText, headers });
      return;
    }

    // NOTE: Hono's `c.res` setter copies every header of the previous response
    // onto the new one (only content-type is skipped), so anything deleted from
    // a header copy reappears. The compression headers therefore have to be
    // applied to c.res AFTER assignment.
    c.res = new Response(compressed, { status: res.status, statusText: res.statusText });
    c.res.headers.set("Content-Encoding", encoding);
    // The original byte count is now a lie about the wire format and browsers
    // report the mismatch as ERR_CONTENT_LENGTH_MISMATCH. Drop it and let the
    // runtime frame the body.
    c.res.headers.delete("Content-Length");
    c.res.headers.set("Vary", "Accept-Encoding");
    // The ETag describes the uncompressed body; keeping it would have caches
    // validate one representation and store another.
    c.res.headers.delete("ETag");
  });
}

/**
 * Hashed build output is immutable by construction: Vite writes a new filename
 * on every content change, so a year-long cache can never serve stale code.
 * Without this the browser revalidates every chunk on each navigation.
 */
export function installAssetCaching(app: App) {
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.status === 200) {
      c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
  });
}
