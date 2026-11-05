import { Hono, type Context } from "hono";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "./lib/logger";
import { CLOUD_PROVIDERS, MANUAL_PROVIDER, findProvider } from "./cloudProviders";

/**
 * Server-side ASR control group for the Whisper Lab bench.
 *
 * The browser leg (src/lib/localTranscribe.ts) is the product path; this route
 * exists to answer one question honestly on real hardware: how much quality and
 * speed does the on-device model give up? It forwards audio to a local
 * faster-whisper sidecar (see /opt/skopein-whisper/sidecar.py) — deliberately a
 * separate host process, because the runtime image is node:alpine and
 * ctranslate2 ships glibc wheels.
 *
 * Deployment gates:
 * - WHISPER_SIDECAR_URL unset -> 404 with a plain reason, and the bench page
 *   says "control group not deployed". Silence would look like a broken build.
 * - Nothing outlives a job: uploaded chunks sit under a temp dir and are
 *   unlinked as soon as transcription starts.
 */

/**
 * Two body shapes are accepted on purpose.
 *
 * The bench uploads a 14 MB file over a public funnel, which on a real iPad run
 * took three minutes — and three separate attempts died at 9%, 15s and 135s
 * with nothing but an opaque 400. Multipart parsing gives up nothing useful on
 * that path, so a raw `audio/*` body keeps the server dumb: Content-Length says
 * what should arrive, and if fewer bytes show up we can say so.
 *
 * That still leaves the fundamental problem — one long request on a link that
 * drops every fifteen seconds never finishes. Hence the chunk endpoints below:
 * the file goes up in 1.5 MB pieces, and a dropped connection costs one piece,
 * not the whole upload.
 */
export const transcribeRoutes = new Hono();

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const SIDECAR_TIMEOUT_MS = 30 * 60 * 1000;
const BUSY_RETRY_AFTER_S = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 12;

/**
 * Chunked uploads: 1.5 MB pieces by default, up to 4 MB accepted, a day to
 * finish a file. The directory is disposable by design.
 */
const CHUNK_ROOT = process.env.WHISPER_CHUNK_DIR?.trim() || "/tmp/whisper-uploads";
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_CHUNKS = 512;
const CHUNK_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 10 * 60 * 1000;
// A lazy sweep only fires when someone uploads. On a quiet weekend the parts
// sit there forever, so also sweep on a timer. Tests set the interval to 0 to
// keep the process from holding the event loop open.
const SWEEP_TIMER_MS = Number(process.env.WHISPER_SWEEP_MS ?? 30 * 60 * 1000);
let lastSweepAt = 0;

/**
 * Two gates sit in front of the sidecar, because it is a single-process box on
 * a public funnel with no login in front of it:
 *
 * 1. A shared token in WHISPER_API_TOKEN. Unset means the route stays open —
 *    that is the local dev case, and the bench page says so instead of failing
 *    mysteriously. Set means every request needs it.
 * 2. One job at a time plus a per-IP hourly cap. The sidecar runs three CPU
 *    threads; a second concurrent job does not go faster, it makes both slow.
 */
const API_TOKEN = process.env.WHISPER_API_TOKEN?.trim() ?? "";

let jobInFlight = false;
const hitsByIp = new Map<string, number[]>();

function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip")?.trim() ||
    "unknown"
  );
}

function tokenMatches(c: Context): boolean {
  if (!API_TOKEN) return true;
  const header = c.req.header("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const supplied = bearer || c.req.header("x-whisper-token")?.trim() || c.req.query("token")?.trim() || "";
  if (supplied.length !== API_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < API_TOKEN.length; i += 1) diff |= supplied.charCodeAt(i) ^ API_TOKEN.charCodeAt(i);
  return diff === 0;
}

/**
 * Counts only jobs that actually reached the transcriber. A client that dies at
 * 15 s used to burn one of the twelve hourly slots anyway, so twelve failed
 * uploads locked the user out with "hourly limit reached" — punishing them for
 * a bad connection instead of protecting the box.
 */
function rateCheck(c: Context): number {
  const ip = clientIp(c);
  const now = Date.now();
  const recent = (hitsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hitsByIp.set(ip, recent);
  if (hitsByIp.size > 500) {
    for (const [key, times] of hitsByIp) {
      if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) hitsByIp.delete(key);
    }
  }
  return recent.length > RATE_LIMIT_MAX ? recent.length - RATE_LIMIT_MAX : 0;
}

function rateRecord(c: Context): void {
  const ip = clientIp(c);
  const recent = (hitsByIp.get(ip) ?? []).filter((t) => Date.now() - t < RATE_LIMIT_WINDOW_MS);
  recent.push(Date.now());
  hitsByIp.set(ip, recent);
}

interface AudioPayload {
  bytes: ArrayBuffer;
  contentType: string;
  label: string;
}

async function readAudio(c: Context): Promise<AudioPayload | { error: string; status: 400 | 413 }> {
  const contentType = c.req.header("content-type") ?? "";
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_AUDIO_BYTES) {
    return { error: `Audio exceeds the ${MAX_AUDIO_BYTES} byte limit.`, status: 413 };
  }
  if (contentType.includes("multipart/form-data")) {
    let form: Record<string, unknown>;
    try {
      form = await c.req.parseBody();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("transcribe multipart parse failed", { reason, declared });
      return { error: `Could not parse the multipart body: ${reason}`, status: 400 };
    }
    // `file` is what curl -F and most clients use; `audio` is ours. Accept both
    // rather than answering a perfectly good upload with a 400.
    const audio = form.audio ?? form.file;
    if (!(audio instanceof File)) {
      return { error: "Missing `audio` file field in the multipart body.", status: 400 };
    }
    if (audio.size === 0) return { error: "The uploaded audio file is empty.", status: 400 };
    if (audio.size > MAX_AUDIO_BYTES) {
      return { error: `Audio exceeds the ${MAX_AUDIO_BYTES} byte limit.`, status: 413 };
    }
    const language = typeof form.language === "string" ? form.language : "auto";
    return { bytes: await audio.arrayBuffer(), contentType: audio.type || "application/octet-stream", label: language };
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await c.req.arrayBuffer();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("transcribe raw body read failed", { reason, declared, contentType });
    return { error: `Could not read the request body (declared ${declared} bytes): ${reason}`, status: 400 };
  }
  if (bytes.byteLength === 0) return { error: "The request body is empty.", status: 400 };
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { error: `Audio exceeds the ${MAX_AUDIO_BYTES} byte limit.`, status: 413 };
  }
  return { bytes, contentType: contentType || "application/octet-stream", label: "auto" };
}

// ---------------------------------------------------------------------------
// Chunked upload
// ---------------------------------------------------------------------------

interface ChunkMeta {
  total: number;
  totalBytes: number;
  language: string;
  model: string;
  createdAt: number;
}

const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{12,64}$/;
const PART_RE = /^(\d{1,4})\.part$/;

function uploadDir(uploadId: string): string {
  return join(CHUNK_ROOT, uploadId);
}

async function readMeta(uploadId: string): Promise<ChunkMeta | null> {
  try {
    const raw = await readFile(join(uploadDir(uploadId), "meta.json"), "utf8");
    const parsed = JSON.parse(raw) as ChunkMeta;
    if (typeof parsed.total !== "number" || typeof parsed.totalBytes !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function receivedParts(uploadId: string): Promise<number[]> {
  let names: string[];
  try {
    names = await readdir(uploadDir(uploadId));
  } catch {
    return [];
  }
  const indexes: number[] = [];
  for (const name of names) {
    const match = PART_RE.exec(name);
    if (match) indexes.push(Number(match[1]));
  }
  return indexes.sort((a, b) => a - b);
}

function missingFrom(total: number, received: number[]): number[] {
  const have = new Set(received);
  const missing: number[] = [];
  for (let i = 0; i < total; i += 1) if (!have.has(i)) missing.push(i);
  return missing;
}

/** Old half-uploads are garbage the moment a user gives up; sweep lazily. */
async function sweepUploads(force = false): Promise<void> {
  if (!force && Date.now() - lastSweepAt < SWEEP_EVERY_MS) return;
  lastSweepAt = Date.now();
  let entries: string[];
  try {
    entries = await readdir(CHUNK_ROOT);
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = join(CHUNK_ROOT, name);
    try {
      const info = await stat(dir);
      if (Date.now() - info.mtimeMs > CHUNK_TTL_MS) await rm(dir, { recursive: true, force: true });
    } catch {
      // Deleted under us — nothing to do.
    }
  }
}

if (SWEEP_TIMER_MS > 0 && process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => {
    void sweepUploads(true).catch(() => undefined);
  }, SWEEP_TIMER_MS);
  // Never keep the process alive for housekeeping alone.
  timer.unref?.();
}

/**
 * `POST /chunk` takes one piece. Every piece is idempotent: sending the same
 * index twice just rewrites the same file, so a client that lost the response
 * can retry blindly without risking a corrupted assembly.
 */
transcribeRoutes.post("/chunk", async (c) => {
  if (!process.env.WHISPER_SIDECAR_URL?.trim()) {
    return c.json({ error: "Server ASR control group is not configured.", code: "not-deployed" }, 404);
  }
  if (!tokenMatches(c)) return c.json({ error: "Missing or wrong access token.", code: "unauthorized" }, 401);

  const uploadId = c.req.query("uploadId") ?? "";
  const index = Number(c.req.query("index") ?? "-1");
  const total = Number(c.req.query("total") ?? "0");
  const totalBytes = Number(c.req.query("size") ?? "0");
  const language = c.req.query("language") ?? "auto";
  const model = (c.req.query("model") ?? "small").toLowerCase();

  if (!UPLOAD_ID_RE.test(uploadId)) {
    return c.json({ error: "Bad uploadId — 12 to 64 characters of [A-Za-z0-9_-].", code: "bad-upload" }, 400);
  }
  if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) {
    return c.json({ error: `total must be an integer between 1 and ${MAX_CHUNKS}.`, code: "bad-upload" }, 400);
  }
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    return c.json({ error: "index out of range.", code: "bad-upload" }, 400);
  }
  if (!Number.isInteger(totalBytes) || totalBytes < 1 || totalBytes > MAX_AUDIO_BYTES) {
    return c.json({ error: `size must be between 1 and ${MAX_AUDIO_BYTES} bytes.`, code: "bad-upload" }, 400);
  }
  if (!["small", "medium"].includes(model)) {
    return c.json({ error: `Unknown model tier '${model}'.`, code: "bad-upload" }, 400);
  }

  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_CHUNK_BYTES) {
    return c.json({ error: `A chunk may not exceed ${MAX_CHUNK_BYTES} bytes.`, code: "bad-upload" }, 413);
  }

  let body: ArrayBuffer;
  let arrived = 0;
  try {
    // Read the stream by hand instead of arrayBuffer(): when a slow uplink drops
    // halfway, "declared 1572864 bytes: aborted" says nothing about how much
    // actually made it. Counting as we read turns a mystery into a number.
    const reader = c.req.raw.body?.getReader();
    if (!reader) throw new Error("no request body");
    const pieces: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        pieces.push(value);
        arrived += value.byteLength;
      }
    }
    const merged = new Uint8Array(arrived);
    let at = 0;
    for (const piece of pieces) {
      merged.set(piece, at);
      at += piece.byteLength;
    }
    body = merged.buffer;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("chunk body read failed", {
      uploadId,
      index,
      reason,
      declared,
      arrived,
      percent: declared > 0 ? Math.round((arrived / declared) * 100) : null,
    });
    return c.json(
      { error: `Chunk ${index} did not arrive in full (declared ${declared} bytes): ${reason}`, code: "chunk-truncated", retry: index },
      409,
    );
  }
  if (body.byteLength === 0) {
    return c.json({ error: `Chunk ${index} was empty.`, code: "chunk-truncated", retry: index }, 409);
  }
  if (body.byteLength > MAX_CHUNK_BYTES) {
    return c.json({ error: `A chunk may not exceed ${MAX_CHUNK_BYTES} bytes.`, code: "bad-upload" }, 413);
  }

  const dir = uploadDir(uploadId);
  await mkdir(dir, { recursive: true });

  // First chunk wins the metadata; a mismatched retry is a client bug we would
  // rather surface now than discover as a garbled transcript later.
  const existing = await readMeta(uploadId);
  if (existing && (existing.total !== total || existing.totalBytes !== totalBytes)) {
    return c.json(
      {
        error: `This uploadId was started with total=${existing.total} size=${existing.totalBytes}. Use a fresh id for a different file.`,
        code: "upload-mismatch",
      },
      409,
    );
  }
  if (!existing) {
    const meta: ChunkMeta = { total, totalBytes, language, model, createdAt: Date.now() };
    await writeFile(join(dir, "meta.json"), JSON.stringify(meta));
  }

  try {
    await writeFile(join(dir, `${index}.part`), Buffer.from(body));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("chunk write failed", { uploadId, index, reason });
    return c.json({ error: `Could not store chunk ${index}: ${reason}`, code: "chunk-store-failed", retry: index }, 500);
  }

  const received = await receivedParts(uploadId);
  const missing = missingFrom(total, received);
  log.info("chunk stored", { uploadId, index, bytes: body.byteLength, have: received.length, total });
  void sweepUploads();
  return c.json({ uploadId, total, received: received.length, missing, complete: missing.length === 0 });
});

/** Resume support: a page reload asks what is already on the server. */
transcribeRoutes.get("/upload/:id", async (c) => {
  if (!tokenMatches(c)) return c.json({ error: "Missing or wrong access token.", code: "unauthorized" }, 401);
  const uploadId = c.req.param("id");
  if (!UPLOAD_ID_RE.test(uploadId)) return c.json({ error: "Bad uploadId.", code: "bad-upload" }, 400);
  const meta = await readMeta(uploadId);
  if (!meta) return c.json({ error: "Unknown uploadId — nothing stored under that id.", code: "unknown-upload" }, 404);
  const received = await receivedParts(uploadId);
  const missing = missingFrom(meta.total, received);
  return c.json({
    uploadId,
    total: meta.total,
    totalBytes: meta.totalBytes,
    received: received.length,
    receivedIndexes: received,
    missing,
    complete: missing.length === 0,
  });
});

transcribeRoutes.delete("/upload/:id", async (c) => {
  if (!tokenMatches(c)) return c.json({ error: "Missing or wrong access token.", code: "unauthorized" }, 401);
  const uploadId = c.req.param("id");
  if (!UPLOAD_ID_RE.test(uploadId)) return c.json({ error: "Bad uploadId.", code: "bad-upload" }, 400);
  await rm(uploadDir(uploadId), { recursive: true, force: true });
  return c.json({ ok: true });
});

/**
 * Assemble and start. Only here does an upload cost a rate-limit slot or take
 * the single-job lock: a client that keeps failing at 21% should not be able to
 * lock itself out for an hour.
 */
transcribeRoutes.post("/upload/:id/complete", async (c) => {
  const sidecar = process.env.WHISPER_SIDECAR_URL?.trim();
  if (!sidecar) return c.json({ error: "Server ASR control group is not configured.", code: "not-deployed" }, 404);
  if (!tokenMatches(c)) return c.json({ error: "Missing or wrong access token.", code: "unauthorized" }, 401);
  const uploadId = c.req.param("id");
  if (!UPLOAD_ID_RE.test(uploadId)) return c.json({ error: "Bad uploadId.", code: "bad-upload" }, 400);

  const meta = await readMeta(uploadId);
  if (!meta) return c.json({ error: "Unknown uploadId.", code: "unknown-upload" }, 404);

  const received = await receivedParts(uploadId);
  const missing = missingFrom(meta.total, received);
  if (missing.length > 0) {
    return c.json({ error: `Upload incomplete: ${missing.length} of ${meta.total} chunks missing.`, code: "upload-incomplete", missing }, 409);
  }

  if (jobInFlight) {
    c.header("Retry-After", String(BUSY_RETRY_AFTER_S));
    return c.json({ error: "The server is already transcribing one file. Try again when it finishes.", code: "server-busy" }, 429);
  }
  const over = rateCheck(c);
  if (over > 0) {
    c.header("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return c.json({ error: `Hourly limit reached (${RATE_LIMIT_MAX}/h). ${over} over.`, code: "rate-limited" }, 429);
  }

  const parts: Buffer[] = [];
  try {
    for (let i = 0; i < meta.total; i += 1) {
      parts.push(await readFile(join(uploadDir(uploadId), `${i}.part`)));
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("chunk assembly failed", { uploadId, reason });
    return c.json({ error: `Could not read the stored chunks: ${reason}`, code: "chunk-store-failed" }, 500);
  }

  const bytes = Buffer.concat(parts);
  if (bytes.byteLength !== meta.totalBytes) {
    return c.json(
      {
        error: `Assembled ${bytes.byteLength} bytes but the upload declared ${meta.totalBytes}. Delete and send the file again.`,
        code: "size-mismatch",
      },
      409,
    );
  }

  const language = c.req.query("language") ?? meta.language;
  const model = (c.req.query("model") ?? meta.model).toLowerCase();
  if (!["small", "medium"].includes(model)) {
    return c.json({ error: `Unknown model tier '${model}'.`, code: "bad-upload" }, 400);
  }

  jobInFlight = true;
  rateRecord(c);
  try {
    const started = Date.now();
    const query = `language=${encodeURIComponent(language)}&model=${encodeURIComponent(model)}&async=1`;
    let response: Response;
    try {
      response = await fetch(`${sidecar.replace(/\/$/, "")}/transcribe?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
        signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("chunked transcribe sidecar unreachable", { reason });
      return c.json({ error: `ASR sidecar unreachable: ${reason}`, code: "server-error" }, 502);
    }
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.status !== 202 || !payload?.jobId) {
      log.warn("chunked transcribe rejected", { status: response.status, payload });
      return c.json({ error: `ASR sidecar failed (HTTP ${response.status}).`, detail: payload, code: "server-error" }, 502);
    }
    log.info("chunked upload accepted", {
      uploadId,
      chunks: meta.total,
      bytes: bytes.byteLength,
      jobId: payload.jobId,
      uploadToJobMs: Date.now() - started,
    });
    // The chunks have served their purpose; the sidecar already has the bytes.
    await rm(uploadDir(uploadId), { recursive: true, force: true });
    return c.json({ ...payload, uploadId, bytes: bytes.byteLength }, 202);
  } finally {
    jobInFlight = false;
  }
});

// ---------------------------------------------------------------------------
// Channels, cloud, models, jobs
// ---------------------------------------------------------------------------

/**
 * Channel roster for the settings page: what exists, what is ready, and what it
 * costs in RAM. The cloud channel is BYOK on purpose — a browser-side key is
 * never sent to a third party by us; the user talks to the vendor directly.
 */
transcribeRoutes.get("/channels", async (c) => {
  const sidecar = process.env.WHISPER_SIDECAR_URL?.trim();
  return c.json({
    device: { available: true, detail: "runs in this browser, private, short clips" },
    server: { available: Boolean(sidecar), detail: sidecar ? "faster-whisper on the host" : "WHISPER_SIDECAR_URL unset" },
    // The cloud channel is BYOK from the browser now, so it is "available" in
    // the sense that the route exists. Which provider can actually run depends
    // on a key the server has never seen — /cloud/providers answers that.
    cloud: {
      available: true,
      model: null,
      detail: "BYOK — bring your own key, pick a provider in Settings",
    },
  });
});

/**
 * The provider roster. Ordered by mainland-China reachability on purpose, and
 * it is a static list rather than a probe: probing four vendors on every page
 * load would be a slow, mostly meaningless network test. What can be verified
 * (a key works) only happens after the user supplies one.
 */
transcribeRoutes.get("/cloud/providers", (c) => {
  return c.json({
    providers: CLOUD_PROVIDERS,
    manual: MANUAL_PROVIDER,
    // Legacy env wiring still wins if an operator set it: no key in the browser.
    envConfigured: Boolean(process.env.CLOUD_ASR_BASE_URL?.trim() && process.env.CLOUD_ASR_API_KEY?.trim()),
  });
});

/**
 * Cloud ASR channel, per-provider.
 *
 * Two shapes because the vendors genuinely differ:
 *   - openai-compatible (SiliconFlow, DashScope, OpenAI): multipart audio, we
 *     forward to `<base>/audio/transcriptions`.
 *   - BibiGPT: a URL, not bytes. It fetches and transcribes server-side, so the
 *     caller must supply a publicly reachable link. Refusing to fake an upload
 *     path for it is the honest option.
 *
 * The key arrives per request and is never logged, never stored.
 */
transcribeRoutes.post("/cloud", async (c) => {
  if (!tokenMatches(c)) return c.json({ error: "Missing or wrong access token." }, 401);

  const url = new URL(c.req.url);
  const contentType = c.req.header("content-type") ?? "";

  // ---- BibiGPT: JSON with a URL ------------------------------------------
  if (contentType.includes("application/json")) {
    const body = (await c.req.json().catch(() => null)) as
      | { provider?: string; apiKey?: string; sourceUrl?: string; language?: string }
      | null;

    const provider = body?.provider ? findProvider(body.provider) : undefined;
    if (!provider || provider.kind !== "url-subtitle") {
      return c.json({ error: "This provider is not configured for URL transcription." }, 400);
    }
    const apiKey = body?.apiKey?.trim();
    const sourceUrl = body?.sourceUrl?.trim();
    if (!apiKey) return c.json({ error: "Missing apiKey." }, 400);
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      return c.json(
        { error: "BibiGPT needs a public http(s) link to the media file — it never receives an upload." },
        400,
      );
    }

    const language = body?.language && body.language !== "auto" ? body.language : "auto";
    const started = Date.now();
    const endpoint = `https://api.bibigpt.co/api/v1/getSubtitle?url=${encodeURIComponent(sourceUrl)}&audioLanguage=${encodeURIComponent(language)}`;
    try {
      const upstream = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20 * 60 * 1000),
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        log.warn("cloud bibigpt failed", { status: upstream.status });
        return c.json({ error: `BibiGPT rejected the request (HTTP ${upstream.status}): ${text.slice(0, 200)}` }, 502);
      }
      let parsed: { text?: string; subtitles?: Array<{ startTime?: number; endTime?: number; text?: string }> } = {};
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        return c.json({ error: "BibiGPT returned something that is not JSON." }, 502);
      }
      const segments = (parsed.subtitles ?? [])
        .map((seg, index) => ({
          id: index,
          start: typeof seg.startTime === "number" ? seg.startTime : 0,
          end: typeof seg.endTime === "number" ? seg.endTime : 0,
          text: (seg.text ?? "").trim(),
        }))
        .filter((seg) => seg.text.length > 0);
      return c.json({
        text: parsed.text ?? segments.map((seg) => seg.text).join(" "),
        language: language === "auto" ? "en" : language,
        model: "bibigpt",
        duration: segments.length ? segments[segments.length - 1].end : 0,
        segments,
        totalMs: Date.now() - started,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("cloud bibigpt error", { reason });
      return c.json({ error: `BibiGPT unreachable: ${reason}` }, 502);
    }
  }

  // ---- openai-compatible: multipart audio --------------------------------
  const form = await c.req.formData().catch(() => null);
  const providerId = String(form?.get("provider") ?? "");
  const provider = findProvider(providerId);
  const envBase = process.env.CLOUD_ASR_BASE_URL?.trim();
  const envKey = process.env.CLOUD_ASR_API_KEY?.trim();
  const envModel = process.env.CLOUD_ASR_MODEL?.trim();
  const base = provider?.baseUrl ?? envBase;
  const key = String(form?.get("apiKey") ?? "").trim() || envKey;
  const model = String(form?.get("model") ?? "").trim() || provider?.suggestedModel || envModel;
  if (!base || !key || !model) {
    return c.json(
      {
        error: provider
          ? `${provider.label} needs a key. Paste one in Settings, or configure CLOUD_ASR_* on the server.`
          : "Pick a cloud provider, or configure CLOUD_ASR_* on the server.",
      },
      501,
    );
  }
  if (provider && provider.kind !== "openai-compatible") {
    return c.json({ error: `${provider.label} does not accept file uploads.` }, 400);
  }
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return c.json({ error: "Missing `audio` file field." }, 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) return c.json({ error: "Audio too large for the cloud channel." }, 413);

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, audio.name || "audio.mp3");
  upstreamForm.append("model", model);
  const language = url.searchParams.get("language");
  if (language && language !== "auto") upstreamForm.append("language", language);

  const started = Date.now();
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstreamForm,
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      log.warn("cloud transcribe failed", { provider: provider?.id ?? "env", status: upstream.status });
      const hint = upstream.status === 401 || upstream.status === 403 ? " — the key was rejected." : "";
      return c.json({ error: `Cloud transcription failed (HTTP ${upstream.status})${hint}: ${text.slice(0, 200)}` }, 502);
    }
    let parsed: { text?: string; language?: string; duration?: number } = {};
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      parsed = { text };
    }
    return c.json({
      text: parsed.text ?? text,
      language: parsed.language ?? (language && language !== "auto" ? language : "en"),
      model,
      duration: parsed.duration ?? 0,
      totalMs: Date.now() - started,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("cloud transcribe error", { provider: provider?.id ?? "env", reason });
    return c.json({ error: `Cloud transcription unreachable: ${reason}` }, 502);
  }
});

/**
 * Model roster + residency control. `medium` costs 1.5 GB of RAM, so the desk
 * can list what is on disk, what is actually loaded, and drop it again.
 */
transcribeRoutes.get("/models", async (c) => {
  const sidecar = process.env.WHISPER_SIDECAR_URL?.trim();
  // Probe semantics, not a resource request. A 401 here is not an error the
  // user can act on, it means "you have not pasted the token yet" — the panel
  // polls this on mount, so answering 401 painted a red console line on every
  // single page load of a perfectly healthy app. 200 + authorized:false says
  // the same thing without the noise.
  if (!sidecar) return c.json({ authorized: false, reason: "not-configured", tiers: [] });
  if (!tokenMatches(c)) return c.json({ authorized: false, reason: "token-required", tiers: [] });
  try {
    const upstream = await fetch(`${sidecar.replace(/\/$/, "")}/models`, { signal: AbortSignal.timeout(10_000) });
    const roster = (await upstream.json()) as Record<string, unknown>;
    return c.json({ authorized: true, ...roster }, upstream.status as 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return c.json({ error: `Model roster unavailable: ${reason}` }, 502);
  }
});

transcribeRoutes.post("/models/:action", async (c) => {
  const sidecar = process.env.WHISPER_SIDECAR_URL?.trim();
  if (!sidecar) return c.json({ error: "Server ASR control group is not configured." }, 404);
  if (!tokenMatches(c)) return c.json({ error: "Missing or wrong access token." }, 401);
  const action = c.req.param("action");
  if (!["load", "unload"].includes(action)) return c.json({ error: "Unknown action." }, 400);
  const tier = (c.req.query("tier") ?? "medium").toLowerCase();
  if (!["small", "medium"].includes(tier)) return c.json({ error: `Unknown model tier '${tier}'.` }, 400);
  try {
    const upstream = await fetch(
      `${sidecar.replace(/\/$/, "")}/models/${action}?tier=${encodeURIComponent(tier)}`,
      { method: "POST", signal: AbortSignal.timeout(180_000) },
    );
    return c.json((await upstream.json()) as Record<string, unknown>, upstream.status as 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return c.json({ error: `Model ${action} failed: ${reason}` }, 502);
  }
});

transcribeRoutes.get("/jobs/:id", async (c) => {
  const sidecar = process.env.WHISPER_SIDECAR_URL?.trim();
  if (!sidecar) return c.json({ error: "Server ASR control group is not configured." }, 404);
  if (!tokenMatches(c)) return c.json({ error: "Missing or wrong access token." }, 401);
  const id = c.req.param("id");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) return c.json({ error: "Bad job id." }, 400);
  try {
    const upstream = await fetch(`${sidecar.replace(/\/$/, "")}/jobs/${id}`, {
      signal: AbortSignal.timeout(10_000),
    });
    return c.json((await upstream.json()) as Record<string, unknown>, upstream.status as 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return c.json({ error: `Job status unavailable: ${reason}` }, 502);
  }
});

// ---------------------------------------------------------------------------
// Single-request upload (kept for curl, short clips and old clients)
// ---------------------------------------------------------------------------

transcribeRoutes.post("/", async (c) => {
  const sidecar = process.env.WHISPER_SIDECAR_URL?.trim();
  if (!sidecar) {
    return c.json(
      { error: "Server ASR control group is not configured (WHISPER_SIDECAR_URL unset)." },
      404,
    );
  }
  if (!tokenMatches(c)) {
    log.warn("transcribe unauthorized", { ip: clientIp(c) });
    c.header("WWW-Authenticate", 'Bearer realm="whisper-lab"');
    return c.json({ error: "Missing or wrong access token. Paste the bench token into the page." }, 401);
  }
  if (jobInFlight) {
    c.header("Retry-After", String(BUSY_RETRY_AFTER_S));
    return c.json({ error: "The server is already transcribing one file. Try again when it finishes.", code: "server-busy" }, 429);
  }
  const over = rateCheck(c);
  if (over > 0) {
    log.warn("transcribe rate limited", { ip: clientIp(c), over });
    c.header("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return c.json({ error: `Hourly limit reached (${RATE_LIMIT_MAX}/h). ${over} over.`, code: "rate-limited" }, 429);
  }
  jobInFlight = true;
  try {
    return await runTranscription(c, sidecar);
  } finally {
    jobInFlight = false;
  }
});

async function runTranscription(c: Context, sidecar: string) {
  const read = await readAudio(c);
  if ("error" in read) {
    log.warn("transcribe rejected", { error: read.error, status: read.status });
    return c.json({ error: read.error, code: "body-unreadable" }, read.status);
  }
  // From here on the bytes are in memory, so the attempt counts against quota.
  rateRecord(c);

  const language = c.req.query("language") ?? read.label ?? "auto";
  // Model tier: 'small' is fast and always resident; 'medium' is bigger, slower
  // and only loaded on demand by the sidecar. An unknown value is rejected here
  // rather than forwarded, so a typo cannot burn 1.5 GB of RAM.
  const tier = (c.req.query("model") ?? "small").toLowerCase();
  if (!["small", "medium"].includes(tier)) {
    return c.json({ error: `Unknown model tier '${tier}'.` }, 400);
  }
  const asyncMode = ["1", "true", "yes"].includes((c.req.query("async") ?? "").toLowerCase());
  const started = Date.now();

  let response: Response;
  try {
    const query = `language=${encodeURIComponent(language)}&model=${encodeURIComponent(tier)}${asyncMode ? "&async=1" : ""}`;
    response = await fetch(`${sidecar.replace(/\/$/, "")}/transcribe?${query}`, {
      method: "POST",
      headers: { "Content-Type": read.contentType },
      body: read.bytes,
      signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("transcribe sidecar unreachable", { reason });
    return c.json({ error: `ASR sidecar unreachable: ${reason}` }, 502);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (asyncMode && response.status === 202) {
    log.info("transcribe job accepted", { jobId: payload?.jobId, bytes: read.bytes.byteLength });
    return c.json(payload ?? { error: "No job id returned." }, 202);
  }
  if (!response.ok || !payload) {
    return c.json(
      { error: `ASR sidecar failed (HTTP ${response.status}).`, detail: payload },
      502,
    );
  }
  log.info("transcribe control group", {
    model: payload.model,
    language: payload.language,
    duration: payload.duration,
    sidecarMs: payload.ms,
    totalMs: Date.now() - started,
    bytes: read.bytes.byteLength,
  });
  return c.json({ ...payload, totalMs: Date.now() - started });
}
