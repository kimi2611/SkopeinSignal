/**
 * In-process token buckets.
 *
 * Scope, stated plainly: this is a single-process, single-container deployment,
 * so a Map is the right size of tool — no Redis, no extra moving part. If the
 * app is ever run as more than one replica the buckets become per-replica and
 * the effective limit multiplies; that is the moment to move this to a shared
 * store, and the comment is here so nobody has to rediscover it.
 *
 * Keys are deliberately composite ("trpc:<ip>", "ai:<session>") so one category
 * running hot cannot lock a caller out of the other.
 */

export type RateDecision = { ok: true } | { ok: false; retryAfter: number };

const buckets = new Map<string, { n: number; reset: number }>();
// A hard ceiling on tracked keys: a rotating-IP flood must not turn the limiter
// itself into the memory leak. Clearing wholesale is crude but bounded, and the
// worst case is that a few limits reset early.
const MAX_KEYS = 50_000;

export function take(key: string, limit: number, windowMs: number): RateDecision {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) buckets.clear();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { ok: true };
  }
  bucket.n += 1;
  if (bucket.n <= limit) return { ok: true };
  return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)) };
}

/** For tests and for the rare "reset everything" case. */
export function clearBuckets(): void {
  buckets.clear();
}

/**
 * Client address as seen through the Tailscale funnel.
 *
 * The funnel overwrites X-Forwarded-For with the real peer address (spoofed
 * values get replaced, measured), so the first entry is trustworthy here in a
 * way it would not be behind an arbitrary proxy. Direct :3000 access is NAT'd
 * and unreachable from outside, which is what keeps that assumption true.
 */
export function clientIpOf(header: (name: string) => string | undefined): string {
  return (
    header("x-forwarded-for")?.split(",")[0]?.trim() ||
    header("x-real-ip")?.trim() ||
    "unknown"
  );
}

/**
 * A stable, non-reversible handle for "this signed-in caller". We hash the
 * session cookie rather than decoding the JWT: the limiter only needs an
 * identity to count against, and hashing means the token itself never becomes
 * a key that could leak through a debug dump.
 */
export async function sessionKeyOf(cookie: string | undefined): Promise<string> {
  if (!cookie) return "anon";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cookie));
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
