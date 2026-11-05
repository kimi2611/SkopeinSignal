import { lookup } from "node:dns/promises";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import {
  extractPageMetadata,
  isBotChallenge,
  isPrivateIp,
  itunesTermVariants,
  matchEpisode,
  metadataFromMicrolink,
  metadataFromLinkPreview,
  parseRss,
  parseRss2Json,
  parseSnipdShareUrl,
  pickItunesEpisode,
  pickItunesShow,
  type ItunesEpisodeHit,
  type ItunesResultRow,
  type ParsedFeed,
  type RssItem,
  type SharePageMetadata,
} from "./lib/snipd";
import { log } from "./lib/logger";

/**
 * Snipd public-share resolver.
 *
 * What this endpoint is: a way to turn a PUBLIC share.snipd.com link into the
 * show's original RSS feed URL and the episode's enclosure audio URL, so the
 * listener can stream it in the atelier like any other public episode.
 *
 * What it is not: no Snipd login, no reading of private subscriptions, queues
 * or snips, and share-link query strings are dropped before fetching so stray
 * tokens never leave the server. Only the share page itself, the podcast's
 * own feed, and Apple's public podcast directory are ever contacted.
 *
 * SSRF discipline: every URL fetched is DNS-resolved first and private /
 * loopback / link-local / CGNAT / documentation addresses are refused — at
 * the entry URL AND again on every redirect hop. Responses are read
 * byte-capped and time-boxed.
 */

const FETCH_TIMEOUT_MS = 15_000;
/** Feeds are larger and slower (a 300-episode feed is routinely >1 MB), and
 * the relay adds its own latency — give the feed leg a longer budget. */
const FEED_TIMEOUT_MS = 40_000;
/** Hard ceiling for the whole resolve. Every leg gets only the time left, so
 * the endpoint always answers — even if only with partial warnings — before
 * any hosting gateway would kill a long-running request. */
const RESOLVE_BUDGET_MS = 50_000;
/** A leg is skipped when less time than this remains — nothing useful fits. */
const MIN_LEG_BUDGET_MS = 4_000;
/** The direct feed leg fails fast on poisoned/bot-walled routes; a healthy
 * host answers even a multi-MB feed well inside this. Relays get the rest. */
const DIRECT_FEED_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_RSS_BYTES = 12 * 1024 * 1024;
const MAX_DIRECTORY_BYTES = 1024 * 1024;
/** rss2json serialises full item contents — larger than a directory reply. */
const MAX_FEED_JSON_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = "SkopeinSignal-SnipdResolver/1.0 (public share-page resolution; no login)";

const inputSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

export interface SnipdResolveResult {
  /** Original podcast RSS feed, when it could be found and read. */
  feedUrl: string | null;
  /** The episode's enclosure audio URL, when the feed item matched. */
  audioUrl: string | null;
  showTitle: string | null;
  episodeTitle: string | null;
  guid: string | null;
  pubDate: string | null;
  durationSeconds: number | null;
  /** How the episode was matched inside the feed; null when unmatched. */
  matchedBy: "guid" | "title" | "fuzzy" | "date-duration" | "share-page" | null;
  /** Honest gaps, e.g. "feed-not-found" when only the share page answered. */
  warnings: string[];
}

/** Public http(s) URL only, credentials refused, DNS pinned to public space. */
async function assertPublicFetchUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "invalid-resolved-url" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "only http(s) resources are resolved" });
  }
  if (url.username || url.password) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "URLs with embedded credentials are refused" });
  }
  const hostname = url.hostname.toLowerCase();
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: `host ${hostname} did not resolve` });
  }
  if (!addresses.length) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: `host ${hostname} did not resolve` });
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      log.warn("snipd resolver blocked a private address", { hostname, address });
      throw new TRPCError({ code: "BAD_REQUEST", message: "host resolves to a private address — refused" });
    }
  }
  return url;
}

interface FetchedText {
  text: string;
  finalUrl: string;
  redirectHops: number;
}

/** Read at most maxBytes of a body, then cancel — for classifying errors. */
async function readBodyPrefix(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      chunks.push(value);
      if (total >= maxBytes) break;
    }
  } catch {
    // A truncated preview is still enough to classify.
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let at = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.length, bytes.length - at));
    bytes.set(slice, at);
    at += slice.length;
    if (at >= bytes.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** GET with manual redirect handling: every hop is re-validated before use. */
async function guardedFetchText(startUrl: string, maxBytes: number, timeoutMs = FETCH_TIMEOUT_MS): Promise<FetchedText> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicFetchUrl(current);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
        },
      });
    } catch (error) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: error instanceof Error && error.name === "TimeoutError" ? "upstream timed out" : "upstream fetch failed",
      });
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) throw new TRPCError({ code: "BAD_GATEWAY", message: "redirect without a Location header" });
      const next = new URL(location, current);
      next.hash = ""; // fragments are client-side; never send them upstream
      current = next.toString();
      continue;
    }
    if (!res.ok || !res.body) {
      // A 401/403/503 may be a bot-management interstitial rather than a real
      // refusal — read a small prefix so the caller can tell the difference
      // and fall back to a relay instead of giving up.
      if (res.body && (res.status === 401 || res.status === 403 || res.status === 503)) {
        const prefix = await readBodyPrefix(res.body, 32 * 1024);
        if (isBotChallenge(res.status, prefix)) {
          throw new TRPCError({ code: "BAD_GATEWAY", message: "upstream-bot-challenge" });
        }
      }
      throw new TRPCError({ code: "BAD_GATEWAY", message: `upstream answered HTTP ${res.status}` });
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "response too large to trust" });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return { text, finalUrl: current, redirectHops: hop };
  }
  throw new TRPCError({ code: "BAD_GATEWAY", message: "too many redirects" });
}

// ---------------------------------------------------------------------------
// Bot-wall fallback chain — used ONLY for the share.snipd.com page itself.
//
// share.snipd.com's Cloudflare bot management answers datacenter egress IPs
// (including this deployment's) with an interstitial instead of the page, so
// a direct fetch is not enough. The chain:
//   1. direct      — free and instant when the egress happens to be clean.
//   2. Cardyb      — public Open Graph preview, production then staging.
//   3. microlink   — renders the page on their side, returns title/show/date
//                    as JSON, but may be rate-limited.
//   4. allorigins  — full HTML when it works (richer: guid/feedUrl), but its
//                    own gateway is too flaky to sit any earlier.
// The RSS feed is fetched directly first; when the direct fetch fails — this
// network's DNS poisons some foreign feed hosts (observed: anchor.fm, acast),
// and others may bot-wall us the same way share.snipd.com does — the chain
// falls through rss2json (fast, latest ~10 items) to allorigins (full feed,
// flaky). A podcast feed URL is public by definition, so relaying leaks
// nothing.
// ---------------------------------------------------------------------------

const ALLORIGINS_RAW = "https://api.allorigins.win/raw?url=";
const MICROLINK_API = "https://api.microlink.io?url=";
const CARDYB_API = "https://cardyb.bsky.app/v1/extract?url=";
const CARDYB_STAGING_API = "https://cardyb.staging.bsky.dev/v1/extract?url=";

/**
 * Fetch any public URL through allorigins' (unblocked) egress. Their gateway
 * answers 408/502/522 on cold starts roughly half the time — but fails FAST,
 * so several retries fit inside one feed budget. Each attempt is capped by
 * both its own timeout and the resolver-wide remaining budget.
 */
async function fetchViaAllorigins(
  url: string,
  maxBytes: number,
  timeoutMs = FETCH_TIMEOUT_MS,
  remainingMs?: () => number,
): Promise<FetchedText> {
  let lastError: unknown = null;
  for (let retry = 0; retry < 3; retry++) {
    const left = remainingMs ? remainingMs() : timeoutMs;
    if (left < MIN_LEG_BUDGET_MS) break;
    try {
      return await guardedFetchText(ALLORIGINS_RAW + encodeURIComponent(url), maxBytes + 4096, Math.min(timeoutMs, left));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("allorigins relay failed");
}

const RSS2JSON_API = "https://api.rss2json.com/v1/api.json?rss_url=";

/**
 * Fetch a public feed through rss2json's (unblocked) egress: their service
 * reads the feed and answers with parsed JSON in ~2-3s, far more reliably
 * than the generic HTML relays. Free tier limits the item list to roughly the
 * latest 10 episodes, so a miss here may still fall through to the full-feed
 * relay. Feed URLs are public by definition — relaying leaks nothing.
 */
async function fetchViaRss2Json(feedUrl: string, timeoutMs: number, remainingMs?: () => number): Promise<ParsedFeed | null> {
  for (let retry = 0; retry < 2; retry++) {
    const left = remainingMs ? remainingMs() : timeoutMs;
    if (left < MIN_LEG_BUDGET_MS) break;
    try {
      const page = await guardedFetchText(RSS2JSON_API + encodeURIComponent(feedUrl), MAX_FEED_JSON_BYTES, Math.min(timeoutMs, left));
      const parsed = parseRss2Json(JSON.parse(page.text));
      if (parsed) return parsed;
    } catch (error) {
      log.warn("snipd feed rss2json relay failed", { feedUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return null;
}

interface SharePageFetch {
  /** Raw HTML when the page itself was fetched (direct or relayed). */
  html: string | null;
  /** Pre-extracted metadata when a metadata service answered instead. */
  meta: SharePageMetadata | null;
  finalUrl: string;
  via: "direct" | "allorigins" | "microlink" | "cardyb" | "cardyb-staging";
}

// A relay rate limit or Cloudflare challenge is transient, not evidence that a
// public link is invalid. Keep a small server-memory cache so one successful
// read can survive later relay outages; no workspace or private data is stored.
const SHARE_PAGE_FRESH_MS = 6 * 60 * 60 * 1000;
const SHARE_PAGE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const sharePageCache = new Map<string, { value: SharePageFetch; storedAt: number }>();

function cachedSharePage(shareUrl: string, allowStale: boolean): SharePageFetch | null {
  const entry = sharePageCache.get(shareUrl);
  if (!entry || Date.now() - entry.storedAt > SHARE_PAGE_STALE_MS) {
    sharePageCache.delete(shareUrl);
    return null;
  }
  if (!allowStale && Date.now() - entry.storedAt > SHARE_PAGE_FRESH_MS) return null;
  return entry.value;
}

function rememberSharePage(shareUrl: string, value: SharePageFetch) {
  if (sharePageCache.size >= 100) sharePageCache.delete(sharePageCache.keys().next().value as string);
  sharePageCache.set(shareUrl, { value, storedAt: Date.now() });
}

async function fetchSharePage(shareUrl: string, remainingMs?: () => number): Promise<SharePageFetch> {
  const cached = cachedSharePage(shareUrl, false);
  if (cached) return cached;
  let sawBotChallenge = false;
  const failures: string[] = [];
  const legBudget = (cap: number) => Math.min(cap, remainingMs ? remainingMs() : cap);

  const attempts: Array<() => Promise<SharePageFetch | null>> = [
    async () => {
      const page = await guardedFetchText(shareUrl, MAX_HTML_BYTES, legBudget(FETCH_TIMEOUT_MS));
      if (isBotChallenge(200, page.text.slice(0, 32768))) return null;
      return { html: page.text, meta: null, finalUrl: page.finalUrl, via: "direct" };
    },
    // Cardyb is an independent public link-preview reader. Its Open Graph
    // title + "Episode from <show>" description are enough for an exact
    // episode-level directory match, including the canonical audio URL.
    async () => {
      const page = await guardedFetchText(CARDYB_API + encodeURIComponent(shareUrl), MAX_DIRECTORY_BYTES, legBudget(FETCH_TIMEOUT_MS));
      let payload: unknown;
      try {
        payload = JSON.parse(page.text);
      } catch {
        return null;
      }
      const meta = metadataFromLinkPreview(payload);
      return meta ? { html: null, meta, finalUrl: shareUrl, via: "cardyb" } : null;
    },
    // The staging reader is an independent egress and currently answers from
    // networks where the production hostname is unreachable. It returns the
    // same public Open Graph evidence, but may leave likely_type empty.
    async () => {
      const page = await guardedFetchText(CARDYB_STAGING_API + encodeURIComponent(shareUrl), MAX_DIRECTORY_BYTES, legBudget(FETCH_TIMEOUT_MS));
      let payload: unknown;
      try {
        payload = JSON.parse(page.text);
      } catch {
        return null;
      }
      const meta = metadataFromLinkPreview(payload);
      return meta ? { html: null, meta, finalUrl: shareUrl, via: "cardyb-staging" } : null;
    },
    // Microlink renders the share page server-side and may additionally return
    // a publish date. It is useful but rate-limited, so Cardyb gets the first
    // relay attempt rather than letting that limit block every first resolve.
    async () => {
      const page = await guardedFetchText(MICROLINK_API + encodeURIComponent(shareUrl), MAX_DIRECTORY_BYTES, legBudget(FETCH_TIMEOUT_MS));
      let payload: unknown;
      try {
        payload = JSON.parse(page.text);
      } catch {
        return null;
      }
      const meta = metadataFromMicrolink(payload);
      return meta ? { html: null, meta, finalUrl: shareUrl, via: "microlink" } : null;
    },
    // Kept as a last-ditch HTML path: when it works it gives the FULL page
    // (JSON-LD guid, declared feedUrl) — a richer match than microlink. It is
    // simply too unreliable to sit any earlier in the chain.
    async () => {
      const page = await fetchViaAllorigins(shareUrl, MAX_HTML_BYTES, legBudget(FETCH_TIMEOUT_MS), remainingMs);
      if (isBotChallenge(200, page.text.slice(0, 32768))) return null;
      return { html: page.text, meta: null, finalUrl: shareUrl, via: "allorigins" };
    },
  ];

  for (const attempt of attempts) {
    if (remainingMs && remainingMs() < MIN_LEG_BUDGET_MS) break;
    try {
      const result = await attempt();
      if (result) {
        if (result.via !== "direct") {
          log.info("snipd share page resolved via relay fallback", { via: result.via });
        }
        rememberSharePage(shareUrl, result);
        return result;
      }
      // A relay passed the interstitial through with a success status.
      sawBotChallenge = true;
      failures.push("bot-challenge-passthrough");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "upstream-bot-challenge") sawBotChallenge = true;
      failures.push(message);
    }
  }

  const stale = cachedSharePage(shareUrl, true);
  if (stale) {
    log.info("snipd share page using stale public metadata after transient upstream failures", { via: stale.via, failures });
    return stale;
  }
  log.warn("snipd share page fetch failed on every path", { url: shareUrl, sawBotChallenge, failures });
  throw new TRPCError({
    code: "BAD_GATEWAY",
    message: sawBotChallenge ? "share-page-blocked" : "share-page-unreachable",
  });
}

/** Apple iTunes Search API — the public podcast directory, no key needed. */
async function findFeedInDirectories(
  meta: SharePageMetadata,
  remainingMs?: () => number,
): Promise<{ hit: ItunesEpisodeHit | null; outcome: "match" | "no-match" | "unreachable" }> {
  const queries: { term: string; entity: "podcast" | "podcastEpisode"; pick: (rows: ItunesResultRow[]) => ItunesEpisodeHit | null }[] = [];
  // Show-level search across title variants ("Show | Network" decorates many).
  for (const term of meta.showTitle ? itunesTermVariants(meta.showTitle) : []) {
    queries.push({ term, entity: "podcast", pick: (rows) => pickItunesShow(rows, meta.showTitle as string) });
  }
  // Episode-level fallback: the shared episode's own title also leads to the
  // show's feed, even when the share page never named the show at all.
  if (meta.episodeTitle) {
    queries.push({ term: meta.episodeTitle, entity: "podcastEpisode", pick: (rows) => pickItunesEpisode(rows, meta) });
  }
  if (!queries.length) return { hit: null, outcome: "no-match" };

  const itunesSearchUrl = (term: string, entity: string) => {
    const query = new URL("https://itunes.apple.com/search");
    query.searchParams.set("term", term);
    query.searchParams.set("media", "podcast");
    query.searchParams.set("entity", entity);
    query.searchParams.set("limit", "25");
    return query.toString();
  };

  let answered = 0;
  let failed = 0;
  let showHit: ItunesEpisodeHit | null = null;
  for (const q of queries) {
    // Once a show variant hit, later variants add nothing — but the episode
    // query still runs, because its hit carries the episode's own audio URL.
    if (showHit && q.entity === "podcast") continue;
    if (remainingMs && remainingMs() < MIN_LEG_BUDGET_MS) break;
    const urls = [itunesSearchUrl(q.term, q.entity)];
    // A DNS-poisoned or throttled direct route must not end the lookup — the
    // public directory rides the same relay we already trust for feeds.
    urls.push(ALLORIGINS_RAW + encodeURIComponent(urls[0]));
    for (const url of urls) {
      if (remainingMs && remainingMs() < MIN_LEG_BUDGET_MS) break;
      let payload: { results?: ItunesResultRow[] };
      try {
        const fetched = await guardedFetchText(url, MAX_DIRECTORY_BYTES, Math.min(FETCH_TIMEOUT_MS, remainingMs ? remainingMs() : FETCH_TIMEOUT_MS));
        payload = JSON.parse(fetched.text) as typeof payload;
      } catch {
        failed++;
        continue;
      }
      answered++;
      const hit = q.pick(payload.results ?? []);
      if (hit) {
        // An episode-level hit is the richest answer (feed + audio) — take it
        // outright; a show-level hit is kept while the episode query runs.
        if (q.entity === "podcastEpisode") return { hit, outcome: "match" };
        showHit = showHit ?? hit;
      }
      break; // the directory answered this query — relaying it adds nothing
    }
  }
  if (showHit) return { hit: showHit, outcome: "match" };
  return { hit: null, outcome: answered > 0 ? "no-match" : failed > 0 ? "unreachable" : "no-match" };
}

/** Result fields shared by every exit path. */
function baseResult(meta: SharePageMetadata): SnipdResolveResult {
  return {
    feedUrl: null,
    audioUrl: null,
    showTitle: meta.showTitle ?? null,
    episodeTitle: meta.episodeTitle ?? null,
    guid: meta.guid ?? null,
    pubDate: meta.pubDate ?? null,
    durationSeconds: meta.durationSeconds ?? null,
    matchedBy: null,
    warnings: [],
  };
}

export const snipdRouter = createRouter({
  resolve: authedQuery.input(inputSchema).mutation(async ({ input }): Promise<SnipdResolveResult> => {
    const share = parseSnipdShareUrl(input.url);
    if (!share) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "not-a-snipd-share-link",
      });
    }

    // Global budget: every leg below gets only the time still left, so the
    // endpoint always answers within RESOLVE_BUDGET_MS — partial warnings are
    // better than a hosting gateway killing a long request mid-flight.
    const deadline = Date.now() + RESOLVE_BUDGET_MS;
    const remainingMs = () => Math.max(0, deadline - Date.now());

    // 1. Read the public share page — direct first, then relays when the
    // host's bot wall answers our datacenter IP with a challenge instead.
    const page = await fetchSharePage(share.url, remainingMs);
    const meta: SharePageMetadata = page.meta ?? (page.html ? extractPageMetadata(page.html) : {});
    const result = baseResult(meta);
    if (meta.audioUrl) result.audioUrl = meta.audioUrl; // declared on the page; still not a confirmed feed match

    // 2. Find the original feed: page declaration first, directory second.
    let feedUrl: string | null = null;
    // When the directory matched the shared EPISODE (not just the show), it
    // often also carries that episode's canonical audio URL — the fallback
    // for feeds this network can only read truncated, or not at all.
    let directoryAudio: { audioUrl?: string; pubDate?: string; durationSeconds?: number } | null = null;
    if (meta.feedUrl && /^https?:\/\//i.test(meta.feedUrl)) {
      feedUrl = new URL(meta.feedUrl, page.finalUrl).toString();
    } else if ((meta.showTitle || meta.episodeTitle) && remainingMs() > MIN_LEG_BUDGET_MS) {
      const directory = await findFeedInDirectories(meta, remainingMs);
      if (directory.hit) {
        feedUrl = directory.hit.feedUrl;
        directoryAudio = {
          audioUrl: directory.hit.audioUrl,
          pubDate: directory.hit.pubDate,
          durationSeconds: directory.hit.durationSeconds,
        };
        log.info("snipd feed found via directory", { feedUrl, outcome: directory.outcome });
      } else if (directory.outcome === "unreachable") {
        // The directory never answered — a retry stands a real chance, which
        // is a different story for the listener than "no such podcast".
        result.warnings.push("directory-unreachable");
        if (!result.audioUrl) {
          throw new TRPCError({ code: "BAD_GATEWAY", message: "directory-unreachable" });
        }
        return result;
      } else {
        log.info("snipd directory lookup found no match", { showTitle: meta.showTitle ?? null, episodeTitle: meta.episodeTitle ?? null });
      }
    }
    if (!feedUrl) {
      result.warnings.push("feed-not-found");
      if (!result.audioUrl) {
        throw new TRPCError({ code: "NOT_FOUND", message: "feed-not-found" });
      }
      return result; // partial, honest: audio from the share page, no feed
    }
    result.feedUrl = feedUrl;

    // 3. Read the feed and match the episode inside it. From here on we
    // already know the feed — partial answers return 200 with warnings so the
    // UI can show what WAS found; only a total miss throws. Relay legs cover
    // DNS-poisoned or bot-walled feed hosts (public URLs, no privacy concern):
    // rss2json first (fast and reliable, but only the latest ~10 items), then
    // allorigins for the full feed as the deeper but flakier fallback.
    const fetchFeedDirect = () =>
      guardedFetchText(feedUrl, MAX_RSS_BYTES, Math.min(DIRECT_FEED_TIMEOUT_MS, remainingMs()))
        .then((page) => (isBotChallenge(200, page.text.slice(0, 32768)) ? null : parseRss(page.text)))
        .catch((error: unknown) => {
          log.warn("snipd feed fetch failed", { feedUrl, error: error instanceof Error ? error.message : String(error) });
          return null;
        });
    const fetchFeedViaAllorigins = () =>
      fetchViaAllorigins(feedUrl, MAX_RSS_BYTES, Math.min(FEED_TIMEOUT_MS, remainingMs()), remainingMs)
        .then((page) => (isBotChallenge(200, page.text.slice(0, 32768)) ? null : parseRss(page.text)))
        .catch((error: unknown) => {
          log.warn("snipd feed relay fetch failed", { feedUrl, error: error instanceof Error ? error.message : String(error) });
          return null;
        });

    let feed: ParsedFeed | null = await fetchFeedDirect();
    let feedVia: "direct" | "rss2json" | "allorigins" | null = feed ? "direct" : null;
    if (!feed && remainingMs() > MIN_LEG_BUDGET_MS) {
      feed = await fetchViaRss2Json(feedUrl, FEED_TIMEOUT_MS, remainingMs);
      if (feed) {
        feedVia = "rss2json";
        log.info("snipd feed resolved via rss2json relay", { feedUrl });
      }
    }
    if (!feed && remainingMs() > MIN_LEG_BUDGET_MS) {
      feed = await fetchFeedViaAllorigins();
      if (feed) {
        feedVia = "allorigins";
        log.info("snipd feed resolved via relay fallback", { feedUrl });
      }
    }
    if (!feed) {
      result.warnings.push("feed-unreachable");
      // The directory's episode row is the last honest source for the audio.
      if (!result.audioUrl && directoryAudio?.audioUrl) {
        result.audioUrl = directoryAudio.audioUrl;
        result.warnings.push("audio-from-directory");
        if (!result.pubDate && directoryAudio.pubDate) result.pubDate = directoryAudio.pubDate;
        if (!result.durationSeconds && directoryAudio.durationSeconds) result.durationSeconds = directoryAudio.durationSeconds;
      }
      return result;
    }
    if (feed.title && !result.showTitle) result.showTitle = feed.title;
    if (!feed.items.length) {
      result.warnings.push("feed-empty");
      return result;
    }

    // A show-level share link has no episode to match: return the feed itself.
    if (share.kind === "show") {
      result.matchedBy = null;
      result.episodeTitle = null;
      return result;
    }

    let match = matchEpisode(feed.items, meta);
    if (!match && feedVia === "rss2json" && remainingMs() > MIN_LEG_BUDGET_MS + 1000) {
      // rss2json serves only the latest handful of items — an older shared
      // episode may still sit deeper in the full feed behind the slow relay.
      // Re-match against the deeper feed; keep it only when it actually finds
      // the episode (a same-size truncated relay response must not replace it).
      const deeper = await fetchFeedViaAllorigins();
      if (deeper) {
        const deepMatch = matchEpisode(deeper.items, meta);
        if (deepMatch) {
          log.info("snipd episode found in full-feed relay after rss2json miss", { feedUrl });
          feed = deeper;
          match = deepMatch;
        }
      }
    }
    if (!match) {
      // The feed answered but did not list the episode (relay truncation drops
      // older entries). The directory's episode row still vouches for the audio.
      if (!result.audioUrl && directoryAudio?.audioUrl) {
        result.audioUrl = directoryAudio.audioUrl;
        result.warnings.push("audio-from-directory");
        if (!result.pubDate && directoryAudio.pubDate) result.pubDate = directoryAudio.pubDate;
        if (!result.durationSeconds && directoryAudio.durationSeconds) result.durationSeconds = directoryAudio.durationSeconds;
      } else {
        result.warnings.push("episode-not-found");
      }
      return result;
    }
    result.matchedBy = match.confidence;
    const item: RssItem = match.item;
    if (item.title) result.episodeTitle = item.title;
    if (item.guid) result.guid = item.guid;
    if (item.pubDate) result.pubDate = item.pubDate;
    if (item.durationSeconds) result.durationSeconds = item.durationSeconds;
    if (item.enclosureUrl) {
      result.audioUrl = item.enclosureUrl; // feed-declared enclosure beats the page hint
    } else {
      result.warnings.push("audio-not-found");
    }
    return result;
  }),
});
