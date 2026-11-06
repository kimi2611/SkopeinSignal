/**
 * Report-Only CSP.
 *
 * Nothing here blocks anything — that is the point. The policy below is a first
 * honest guess at what this app needs, shipped in report mode so the browser
 * tells us where the guess is wrong. After a day of real traffic (including the
 * ONNX bench, which is the awkward part: WebAssembly compile, blob: workers,
 * ~41 MB of model weights fetched from our own origin) the violations get read
 * and the enforcing policy gets written from evidence instead of intuition.
 *
 * Shape of the guess:
 *   - script-src needs 'wasm-unsafe-eval' for onnxruntime-web; no 'unsafe-inline'
 *     is asserted here, because if inline scripts do turn up we want to see them;
 *   - style-src allows 'unsafe-inline': React sets style attributes and Tailwind
 *     ships inline critical CSS; restricting that belongs to a later pass with
 *     nonces, not this one;
 *   - worker-src / child-src allow blob: because the transcriber builds its
 *     worker from a blob URL;
 *   - connect-src lists the BYOK providers the browser talks to directly. If the
 *     real traffic never leaves our own origin, day two of the report will show
 *     an empty list and the enforcing policy can drop them;
 *   - object-src 'none', base-uri 'self', form-action 'self',
 *     frame-ancestors 'none' are already enforced by the blocking header, and are
 *     repeated here so the two policies do not drift.
 */
export const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'report-sample'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://api.deepseek.com https://api.siliconflow.cn https://dashscope.aliyuncs.com https://api.openai.com https://api.bibigpt.co https://www.kimi.com",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // report-uri only — measured, not assumed: with report-to also present Chrome
  // switches to the Reporting API and delivered nothing here (a bare report-uri
  // test page reported within the same second). Deprecated, but it is the one
  // that actually arrives.
  "report-uri /api/csp-report",
].join("; ");
