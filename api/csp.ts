/**
 * CSP violation sink.
 *
 * Browsers POST here when the Report-Only policy would have blocked something.
 * Two payload shapes exist in the wild and both are accepted:
 *   - legacy: Content-Type application/csp-report, body {"csp-report": {...}}
 *   - Reporting API: application/reports+json, body [{type: "csp-violation", body: {...}}]
 *
 * Storage is append-only JSONL on the bind mount, one file per day, so the record
 * survives container replacement (an in-memory counter would evaporate on the
 * next deploy — exactly when you want the history). Nothing is trusted from the
 * body: it is truncated, and only the directive/URI/blocked-URI fields we will
 * actually read are kept, because a hostile page can hit this endpoint and the
 * log must not become an arbitrary-content dump.
 *
 * The endpoint is deliberately unauthenticated: browsers send reports without
 * credentials, and requiring auth would mean zero data.
 */
import { Hono } from "hono";
import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { log } from "./lib/logger";
import { clientIpOf, take } from "./lib/ratelimit";

// NOT under /data/whisper-uploads: that tree is the chunk spool, and its sweeper
// deletes any entry older than 24h (rm -rf, by mtime). The violation log would
// silently disappear right around the time it becomes interesting.
const SPOOL = process.env.CSP_SPOOL_DIR?.trim() || "/data/csp";
const MAX_BODY = 32 * 1024;
// A page under attack can generate a report per blocked resource per navigation.
// Cap the day's file; the report we need is about the first few hundred distinct
// violations, not the tail.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const cspRoutes = new Hono();

type Violation = {
  document?: string;
  directive?: string;
  blocked?: string;
  source?: string;
  line?: number;
};

function shapeOf(raw: Record<string, unknown>): Violation {
  const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : undefined);
  return {
    document: str(raw["document-uri"] ?? raw.documentURL, 200),
    directive: str(raw["effective-directive"] ?? raw.effectiveDirective ?? raw["violated-directive"], 60),
    blocked: str(raw["blocked-uri"] ?? raw.blockedURL, 200),
    source: str(raw["source-file"] ?? raw.sourceFile, 200),
    line: typeof raw["line-number"] === "number" ? raw["line-number"] : undefined,
  };
}

cspRoutes.post("/", async (c) => {
  // Unauthenticated by necessity (browsers send reports without credentials), so
  // it is also the one route a stranger can flood. The cap is on the *response*,
  // not the request: over the limit we still answer 204 and drop the report.
  // A 429 here would be indistinguishable from a broken sink in the logs, and
  // browsers do not retry failed reports anyway — so dropping is honest, and the
  // per-day file cap stays as the backstop.
  if (!take(`csp:${clientIpOf((name) => c.req.header(name))}`, 120, 60_000).ok) {
    return c.body(null, 204);
  }
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_BODY) return c.body(null, 204);
  const text = await c.req.text();
  if (text.length > MAX_BODY) return c.body(null, 204);

  let entries: Violation[] = [];
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed)
      ? parsed.filter((r) => r?.type === "csp-violation").map((r) => r.body as Record<string, unknown>)
      : [parsed["csp-report"] as Record<string, unknown>];
    entries = list.filter(Boolean).map(shapeOf);
  } catch {
    return c.body(null, 204);
  }

  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(SPOOL, `csp-${day}.jsonl`);
  try {
    await mkdir(SPOOL, { recursive: true });
    const info = await stat(file).catch(() => null);
    if (info && info.size > MAX_FILE_BYTES) return c.body(null, 204);
    const at = new Date().toISOString();
    await appendFile(file, entries.map((entry) => JSON.stringify({ at, ...entry })).join("\n") + "\n");
  } catch (error) {
    log.warn("csp report not written", { error: String(error) });
  }
  return c.body(null, 204);
});
