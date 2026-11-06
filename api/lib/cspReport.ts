// CSP violation sink.
//
// Why a separate route rather than folding this into /api/log: the report body
// is shaped by the browser, not by our code, and it routinely arrives with
// Content-Type `application/csp-report` (report-uri, every browser we care
// about) or `application/reports+json` (the newer Reporting API). The client-log
// route parses JSON that we asked the frontend to produce; this one parses
// whatever a browser decides to send, so it validates and clamps every field
// instead of trusting the shape.
//
// The point of this endpoint is the Report-Only rollout: the policy ships
// non-blocking, we read what WOULD have been blocked, then flip CSP_MODE to
// enforce. Without a sink, Report-Only mode is a header nobody ever reads.
//
// Guardrails, same reasoning as clientlog.ts — the preview URL is public:
//   - body cap before parse, and the declared length checked first;
//   - every field clamped, so one hostile report cannot write a megabyte;
//   - a global write budget per minute plus a bounded byte budget on the file,
//     because a page in a redirect loop can emit violations faster than any
//     human reads them.
import type { Context } from "hono";
import fs from "fs";
import path from "path";

const BODY_MAX = 16 * 1024;
const FIELD_MAX = 512;
const MAX_REPORTS_PER_REQUEST = 20;
const MAX_LINES_PER_MINUTE = 600;
const FILE_MAX_BYTES = 2 * 1024 * 1024;

// Overridable so the deployment can point this at a volume that survives a
// container restart (CSP_LOG_PATH=/data/csp.log). Defaults next to the app log:
// losing reports on redeploy is acceptable for a rollout window, losing them
// because the path was read-only is not — every write is best-effort.
// Resolved per call rather than at import: a test (and an operator hot-fixing a
// path) changes the env after the module is loaded, and a captured constant
// would silently ignore that and write to the default instead.
function logPath(): string {
  return process.env.CSP_LOG_PATH ?? path.join(
    process.env.KIMI_LOG_DIR ?? "/tmp/kimi-logs",
    "csp.log"
  );
}

let bytesWritten = 0;
let sizeKnown = false;
let windowStart = 0;
let windowCount = 0;

function clamp(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length > FIELD_MAX ? value.slice(0, FIELD_MAX) + "…" : value;
}

// budgetExceeded truncates the file once past its byte budget, keeping the
// newest evidence. Same on-write enforcement as the app log: a timer would stop
// mattering exactly when a runaway writer is the problem.
function enforceBudget(nextLineLength: number): void {
  if (!sizeKnown) {
    try {
      bytesWritten = fs.statSync(logPath()).size;
    } catch {
      bytesWritten = 0;
    }
    sizeKnown = true;
  }
  if (bytesWritten + nextLineLength <= FILE_MAX_BYTES) return;
  try {
    fs.writeFileSync(logPath(), "");
    bytesWritten = 0;
  } catch {
    // Cannot truncate: keep appending rather than silently drop reports.
  }
}

function underRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_LINES_PER_MINUTE) return false;
  windowCount += 1;
  return true;
}

type Report = {
  directive: string;
  blocked: string;
  document: string;
  // `source` is reserved for the log line's own origin ("csp"): a browser field
  // named source must not be able to relabel the line, same rule clientlog.ts
  // enforces against browser-supplied ctx.
  sourceFile: string;
  line: number | null;
  disposition: string;
  sample: string;
};

// normalize accepts both wire formats and returns only the fields a human
// triaging a policy needs. `original-policy` is deliberately dropped: it is the
// 600-character policy string, identical on every line, and it is the thing
// that made these reports unreadable in practice.
function normalize(entry: unknown): Report | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Record<string, unknown>;
  const legacy = (raw["csp-report"] ?? raw.body ?? raw) as Record<string, unknown>;
  if (!legacy || typeof legacy !== "object") return null;

  const directive = clamp(
    legacy["effective-directive"] ?? legacy["violated-directive"] ?? legacy["effectiveDirective"] ?? legacy["violatedDirective"]
  );
  const blocked = clamp(legacy["blocked-uri"] ?? legacy["blockedURI"] ?? legacy["blockedURL"]);
  const document = clamp(legacy["document-uri"] ?? legacy["documentURI"]);
  // A report with neither directive nor blocked URI carries no information;
  // dropping it keeps the file worth reading.
  if (!directive && !blocked) return null;

  const lineRaw = legacy["line-number"] ?? legacy["lineNumber"];
  const line = typeof lineRaw === "number" && Number.isFinite(lineRaw) ? lineRaw : null;

  return {
    directive,
    blocked,
    document,
    sourceFile: clamp(legacy["source-file"] ?? legacy["sourceFile"]),
    line,
    disposition: clamp(legacy.disposition),
    sample: clamp(legacy["script-sample"] ?? legacy["sample"]),
  };
}

export async function handleCspReport(c: Context): Promise<Response> {
  const declared = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_MAX) return c.body(null, 413);

  let payload: unknown;
  try {
    const raw = await c.req.text();
    if (raw.length > BODY_MAX) return c.body(null, 413);
    payload = JSON.parse(raw);
  } catch {
    // Malformed report: nothing to log, and echoing anything would make this a
    // reflection surface. 204 keeps browsers from retrying.
    return c.body(null, 204);
  }

  const entries: unknown[] = Array.isArray(payload) ? payload : [payload];
  if (entries.length > MAX_REPORTS_PER_REQUEST) {
    entries.length = MAX_REPORTS_PER_REQUEST;
  }

  const reports: Report[] = [];
  for (const entry of entries) {
    const report = normalize(entry);
    if (report) reports.push(report);
  }
  if (reports.length === 0) return c.body(null, 204);

  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
  } catch {
    // Best-effort sink; a read-only path must not 500 the page that reported.
  }

  for (const report of reports) {
    if (!underRateLimit()) break;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      source: "csp",
      mode: process.env.CSP_MODE === "enforce" ? "enforce" : "report",
      ...report,
    });
    try {
      enforceBudget(line.length + 1);
      fs.appendFileSync(logPath(), line + "\n");
      bytesWritten += line.length + 1;
    } catch {
      break;
    }
  }

  return c.body(null, 204);
}
