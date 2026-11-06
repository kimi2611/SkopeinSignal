// CSP rollout: the full policy ships as Report-Only next to the narrow one that
// already enforces.
//
// There are two policies on purpose, and they are different headers:
//
//   Content-Security-Policy            boot.ts, narrow, enforcing — frame-ancestors,
//                                      base-uri, form-action, object-src. It stops
//                                      clickjacking today without touching the app's
//                                      own scripts.
//   Content-Security-Policy-Report-Only  this file, full — script/style/worker/
//                                      connect/img/media. It blocks nothing; it only
//                                      reports what a full policy would refuse.
//
// That is the standard way to tighten a policy: keep the safe subset enforcing,
// measure the risky superset, then move directives across once the log is quiet.
// Merging them into one enforcing header today would be a guess with a white
// screen attached — and the failure mode is not "the homepage breaks", it is
// "transcription dies halfway because a worker came from a blob URL".
//
// Flipping CSP_MODE=enforce promotes the full policy. When that happens the
// narrow header must go, or the browser evaluates both and the stricter one wins
// on every shared directive — see the note in the middleware body.
import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";

type App = Hono<{ Bindings: HttpBindings }>;

// Derived from what the code actually does, not from a template:
//   - script-src 'wasm-unsafe-eval' + worker-src blob: for the on-device ONNX
//     transcriber (whisper-lab runs ort-wasm in a blob worker);
//   - style-src 'unsafe-inline' because the app writes inline styles;
//   - img/media https: because artwork and audio come from publisher CDNs;
//   - connect-src stays same-origin except the one cross-origin call the app
//     makes (MyMemory fallback translation), which is named rather than opened up
//     with https:.
const POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://api.mymemory.translated.net",
  // Kept in both modes: once enforcing, a real violation is still the cheapest
  // warning that a dependency now wants something this policy refuses.
  "report-uri /api/csp-report",
].join("; ");

export function installCspReportOnly(app: App) {
  // Production only: Vite's dev server needs eval and inline scripts, and a
  // report-only header that fires on every dev reload is noise, not signal.
  if (process.env.NODE_ENV !== "production") return;

  const enforce = process.env.CSP_MODE === "enforce";
  const header = enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

  app.use("*", async (c, next) => {
    await next();
    const h = c.res.headers;
    // Enforce mode deliberately OVERWRITES. boot.ts registers its narrow CSP
    // first and its "do not clobber" guard would otherwise keep the narrow header
    // and silently ignore this one — the exact "which policy is live?" trap that
    // makes a security header worse than none, because nobody can tell by reading
    // one file. Promoting means the narrow block is superseded; say so by winning.
    if (enforce || !h.has(header)) h.set(header, POLICY);
  });
}
