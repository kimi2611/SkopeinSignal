/**
 * Snipd public-share resolver — pure helpers (no fetch, no Node APIs) so every
 * branch is unit-testable with fixtures. The network orchestration lives in
 * api/snipdRouter.ts.
 *
 * Scope discipline: we resolve PUBLIC share pages (share.snipd.com/episode/…)
 * only. No Snipd login, no private subscriptions, no snips. The pipeline:
 * share page HTML → metadata (JSON-LD, Open Graph, declared feed hints) →
 * original podcast RSS feed → the matching <item> → its enclosure audio URL.
 */

// ---------------------------------------------------------------------------
// 1. Share-link classification
// ---------------------------------------------------------------------------

export const SNIPD_SHARE_HOST = "share.snipd.com";

export type SnipdShareKind = "episode" | "show" | "episode-takeaways";

export interface SnipdShareLink {
  kind: SnipdShareKind;
  id: string;
  /** Canonical https URL with query and hash stripped — tokens never ride along. */
  url: string;
}

const SHARE_KINDS: readonly string[] = ["episode", "show", "episode-takeaways"];

/**
 * Accept exactly https://share.snipd.com/<kind>/<id>. Anything else (other
 * hosts, app links, credentials in the URL, non-standard ports) is rejected —
 * the entry host is allowlisted because it is the only thing we fetch first.
 */
export function parseSnipdShareUrl(raw: string): SnipdShareLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.hostname.toLowerCase() !== SNIPD_SHARE_HOST) return null;
  if (url.port && url.port !== "443") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [kindPart, id] = parts;
  if (!SHARE_KINDS.includes(kindPart)) return null;
  const kind = kindPart as SnipdShareKind;
  // Snipd ids are UUIDs; allow slug-flavoured ids too, but nothing exotic.
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(id)) return null;
  return { kind, id, url: `https://${SNIPD_SHARE_HOST}/${kind}/${id}` };
}

// ---------------------------------------------------------------------------
// 2. HTML metadata extraction (JSON-LD + Open Graph + declared feed hints)
// ---------------------------------------------------------------------------

export interface SharePageMetadata {
  showTitle?: string;
  episodeTitle?: string;
  guid?: string;
  pubDate?: string;
  durationSeconds?: number;
  feedUrl?: string;
  /** Some share pages embed the enclosure directly (og:audio / JSON-LD). */
  audioUrl?: string;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => {
      switch (name) {
        case "amp": return "&";
        case "lt": return "<";
        case "gt": return ">";
        case "quot": return '"';
        case "apos": return "'";
        case "nbsp": return " ";
        default: return _;
      }
    });
}

/** ISO8601 duration (PT1H2M3S), H:MM:SS / M:SS, or plain seconds → seconds. */
export function parseDurationValue(raw: string | number | undefined | null): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  const iso = /^P(?:(\d+(?:\.\d+)?)D)?T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(text);
  if (iso) {
    const [, d, h, m, s] = iso;
    const total = (parseFloat(d ?? "0") || 0) * 86400 + (parseFloat(h ?? "0") || 0) * 3600 + (parseFloat(m ?? "0") || 0) * 60 + (parseFloat(s ?? "0") || 0);
    return total > 0 ? Math.round(total) : undefined;
  }
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(text)) {
    const parts = text.split(":").map(Number);
    const total = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    return total > 0 ? total : undefined;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
}

/** Walk a parsed JSON-LD node (or @graph) collecting podcast-shaped facts. */
function collectJsonLd(node: unknown, meta: SharePageMetadata): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectJsonLd(child, meta);
    return;
  }
  const record = node as Record<string, unknown>;
  if (Array.isArray(record["@graph"])) collectJsonLd(record["@graph"], meta);
  const types = ([] as unknown[]).concat(record["@type"] ?? []).map((t) => String(t).toLowerCase());
  const name = typeof record.name === "string" ? decodeHtmlEntities(record.name).trim() : undefined;

  if (types.some((t) => t.includes("podcastepisode") || t === "episode")) {
    if (name && !meta.episodeTitle) meta.episodeTitle = name;
    if (typeof record.datePublished === "string" && !meta.pubDate) meta.pubDate = record.datePublished;
    const duration = parseDurationValue((record.timeDuration ?? record.duration) as string | number | undefined);
    if (duration && !meta.durationSeconds) meta.durationSeconds = duration;
    const media = (record.associatedMedia ?? record.encodes ?? record.encoding) as Record<string, unknown> | undefined;
    if (media && typeof media.contentUrl === "string" && !meta.audioUrl) meta.audioUrl = media.contentUrl;
    if (typeof record.identifier === "string" && !meta.guid) meta.guid = record.identifier;
    if (typeof record.sameAs === "string" && !meta.guid && /guid/i.test(record.sameAs)) meta.guid = record.sameAs;
    const series = record.partOfSeries as Record<string, unknown> | undefined;
    if (series && typeof series.name === "string" && !meta.showTitle) meta.showTitle = decodeHtmlEntities(series.name).trim();
  }
  if (types.some((t) => t.includes("podcastseries") || t === "radioseries" || t === "tvseries")) {
    if (name && !meta.showTitle) meta.showTitle = name;
    const webFeed = record.webFeed ?? record.feed;
    if (typeof webFeed === "string" && !meta.feedUrl) meta.feedUrl = webFeed;
    if (webFeed && typeof webFeed === "object" && typeof (webFeed as Record<string, unknown>).url === "string" && !meta.feedUrl) {
      meta.feedUrl = (webFeed as Record<string, unknown>).url as string;
    }
  }
}

/**
 * Pull every resolver-relevant fact out of a share page's HTML. Nothing here
 * is trusted blindly downstream — feedUrl and audioUrl still pass the SSRF
 * guard before any fetch, and the RSS <item> match decides the final answer.
 */
export function extractPageMetadata(html: string): SharePageMetadata {
  const meta: SharePageMetadata = {};

  // JSON-LD blocks — the richest source (schema.org PodcastEpisode/Series).
  const ldJson = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(ldJson)) {
    try {
      collectJsonLd(JSON.parse(match[1].trim()), meta);
    } catch {
      // Tolerate one broken block; other sources below may still deliver.
    }
  }

  // Open Graph / Twitter card meta tags.
  const metaTags = /<meta\b[^>]*>/gi;
  for (const tagMatch of html.matchAll(metaTags)) {
    const tag = tagMatch[0];
    const key = /\b(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1];
    if (!key || content == null) continue;
    const value = decodeHtmlEntities(content).trim();
    if (!value) continue;
    if ((key === "og:title" || key === "twitter:title") && !meta.episodeTitle) meta.episodeTitle = value;
    if ((key === "og:audio" || key === "og:audio:url" || key === "og:audio:secure_url" || key === "twitter:player:stream") && !meta.audioUrl) meta.audioUrl = value;
    if (key === "article:published_time" && !meta.pubDate) meta.pubDate = value;
  }

  // <link rel="alternate" type="application/rss+xml" href="…"> — a page's own
  // declaration of its feed.
  const linkTags = /<link\b[^>]*>/gi;
  for (const linkMatch of html.matchAll(linkTags)) {
    const tag = linkMatch[0];
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const type = /\btype=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    if (rel.includes("alternate") && (type.includes("rss") || type.includes("atom") || type.includes("xml"))) {
      if (!meta.feedUrl) meta.feedUrl = decodeHtmlEntities(href).trim();
    }
  }

  // Embedded hydration JSON often carries the raw facts verbatim.
  const feedHint = /"(?:feedUrl|rssUrl|feed_url)"\s*:\s*"((?:[^"\\]|\\.){4,2000})"/i.exec(html);
  if (feedHint && !meta.feedUrl) {
    try {
      meta.feedUrl = JSON.parse(`"${feedHint[1]}"`) as string;
    } catch {
      meta.feedUrl = feedHint[1];
    }
  }
  const guidHint = /"(?:guid|episodeGuid)"\s*:\s*"((?:[^"\\]|\\.){4,500})"/i.exec(html);
  if (guidHint && !meta.guid) {
    try {
      meta.guid = JSON.parse(`"${guidHint[1]}"`) as string;
    } catch {
      meta.guid = guidHint[1];
    }
  }
  const durationHint = /"(?:duration|durationSeconds|duration_seconds)"\s*:\s*(\d{1,7})/i.exec(html);
  if (durationHint && !meta.durationSeconds) meta.durationSeconds = parseDurationValue(durationHint[1]);
  const showHint = /"(?:showTitle|showName|podcastTitle|collectionName)"\s*:\s*"((?:[^"\\]|\\.){2,300})"/i.exec(html);
  if (showHint && !meta.showTitle) {
    try {
      meta.showTitle = JSON.parse(`"${showHint[1]}"`) as string;
    } catch {
      meta.showTitle = showHint[1];
    }
  }

  return meta;
}

// ---------------------------------------------------------------------------
// 2b. Bot-wall detection + metadata-service fallback
// ---------------------------------------------------------------------------
//
// share.snipd.com sits behind Cloudflare bot management. From many datacenter
// egress IPs (including this deployment's) every direct request is answered
// with an interstitial challenge page (HTTP 403, "Just a moment…") instead of
// the share page. That is not a fetch failure and not a user error — the
// resolver detects it and falls back to public metadata/relay services whose
// egress is not blocked (see the router for the chain).

/**
 * True when a response is a bot-management interstitial rather than real
 * content. Checked on the status AND a small body prefix: Cloudflare serves
 * its challenge as 403 or 503 with a recognisable page, and some relays pass
 * that page through with a 200.
 */
export function isBotChallenge(status: number, bodyPrefix: string): boolean {
  if (status === 200) {
    // A relay can pass the interstitial through with a success status — the
    // marker text is the only signal then.
    return /just a moment|challenge-platform|cf-chl-|verifying you are human/i.test(bodyPrefix);
  }
  if (status !== 401 && status !== 403 && status !== 503) return false;
  return /just a moment|challenge-platform|cf-chl-|cloudflare|verifying you are human|enable javascript and cookies/i.test(
    bodyPrefix,
  );
}

/**
 * Microlink (api.microlink.io) answers with pre-extracted page metadata, not
 * HTML. Its Snipd share-page payload carries the episode title, a description
 * naming the show, and the publish date — enough for the directory lookup and
 * a title/date RSS match, though never a guid or feedUrl.
 *
 * The description template is "Episode from <show>" on English pages, but the
 * share site localizes it — observed variants must not silently lose the show
 * name, because without it no directory lookup runs at all.
 */
const EPISODE_FROM_PATTERNS: readonly RegExp[] = [
  /^episode\s+from\s+(.+)$/i, // en
  /^(?:folge|episode)\s+(?:von|aus)\s+(.+)$/i, // de
  /^[eé]pisode\s+(?:de|du)\s+(.+)$/i, // fr
  /^episodio\s+(?:de|di|del)\s+(.+)$/i, // es / it
  /^aflevering\s+van\s+(.+)$/i, // nl
  /^avsnitt\s+(?:från|av)\s+(.+)$/i, // sv
  /^odcinek\s+(?:z|z\s+podcastu)\s+(.+)$/i, // pl
  /^epis[oó]dio\s+de\s+(.+)$/i, // pt
];

/** Extract the show name from a localized "Episode from …" description. */
export function showFromEpisodeDescription(description: string): string | undefined {
  const text = description.trim();
  for (const pattern of EPISODE_FROM_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

export function metadataFromMicrolink(payload: unknown): SharePageMetadata | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.status !== "success" || !root.data || typeof root.data !== "object") return null;
  const data = root.data as Record<string, unknown>;
  const meta: SharePageMetadata = {};
  if (typeof data.title === "string" && data.title.trim()) meta.episodeTitle = data.title.trim();
  if (typeof data.description === "string") {
    const show = showFromEpisodeDescription(data.description);
    if (show) meta.showTitle = show;
  }
  if (typeof data.date === "string" && data.date.trim()) meta.pubDate = data.date.trim();
  const audio = data.audio;
  if (audio && typeof audio === "object") {
    const url = (audio as Record<string, unknown>).url;
    if (typeof url === "string" && /^https:\/\//i.test(url)) meta.audioUrl = url;
  }
  return meta.episodeTitle || meta.showTitle ? meta : null;
}

/**
 * Bluesky's public Cardyb link-preview reader returns the same Open Graph
 * facts, without rendering HTML for us. It is an independent egress path when
 * both Snipd and Microlink are unavailable. Production labels HTML previews
 * explicitly; the staging reader may leave likely_type empty while returning
 * the same verified Open Graph title and description. Other types and error
 * payloads are never mistaken for metadata.
 */
export function metadataFromLinkPreview(payload: unknown): SharePageMetadata | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.error !== "" || (root.likely_type !== "html" && root.likely_type !== "") || typeof root.title !== "string" || !root.title.trim()) return null;
  const meta: SharePageMetadata = { episodeTitle: root.title.trim() };
  if (typeof root.description === "string") {
    const show = showFromEpisodeDescription(root.description);
    if (show) meta.showTitle = show;
  }
  return meta;
}

// ---------------------------------------------------------------------------
// 3. Server-side RSS parsing (Node has no DOMParser — small tolerant reader)
// ---------------------------------------------------------------------------

export interface RssItem {
  title?: string;
  guid?: string;
  pubDate?: string;
  durationSeconds?: number;
  enclosureUrl?: string;
  link?: string;
}

export interface ParsedFeed {
  title?: string;
  items: RssItem[];
}

/** Extract the (CDATA-aware) text of one tag inside an XML fragment. */
function tagText(fragment: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = pattern.exec(fragment);
  if (!match) return undefined;
  let inner = match[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(inner);
  if (cdata) inner = cdata[1];
  const value = decodeHtmlEntities(inner).trim();
  return value || undefined;
}

export function parseRss(xml: string): ParsedFeed {
  const items: RssItem[] = [];
  const channelEnd = xml.search(/<item[\s>]/i);
  const channelHead = channelEnd === -1 ? xml : xml.slice(0, channelEnd);
  const feed: ParsedFeed = { title: tagText(channelHead, "title"), items };

  const itemPattern = /<item[\s>]([\s\S]*?)<\/item>/gi;
  for (const match of xml.matchAll(itemPattern)) {
    const body = match[1];
    const enclosure = /<enclosure\b[^>]*>/i.exec(body)?.[0];
    let enclosureUrl: string | undefined;
    if (enclosure) {
      enclosureUrl = /\burl=["']([^"']+)["']/i.exec(enclosure)?.[1];
      if (enclosureUrl) enclosureUrl = decodeHtmlEntities(enclosureUrl).trim();
    }
    items.push({
      title: tagText(body, "title"),
      guid: tagText(body, "guid"),
      pubDate: tagText(body, "pubDate") ?? tagText(body, "dc:date") ?? tagText(body, "published"),
      durationSeconds: parseDurationValue(tagText(body, "itunes:duration") ?? tagText(body, "duration")),
      enclosureUrl: enclosureUrl || undefined,
      link: tagText(body, "link"),
    });
  }
  return feed;
}

/**
 * rss2json (api.rss2json.com) answers with pre-parsed feed JSON instead of
 * XML: the latest handful of items, each with title/guid/pubDate and an
 * enclosure carrying the audio URL and duration in seconds. Used only as a
 * relay leg when the feed host itself is unreachable from this network — the
 * feed URL is public by definition. Its free tier serves roughly the latest
 * 10 items, so the caller may still fall through to a full-feed relay when an
 * older episode does not match here.
 */
export function parseRss2Json(payload: unknown): ParsedFeed | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.status !== "ok") return null;
  const feedNode = root.feed && typeof root.feed === "object" ? (root.feed as Record<string, unknown>) : null;
  const title = feedNode && typeof feedNode.title === "string" && feedNode.title.trim() ? feedNode.title.trim() : undefined;
  const itemsNode = Array.isArray(root.items) ? root.items : [];
  const items: RssItem[] = [];
  for (const raw of itemsNode) {
    if (!raw || typeof raw !== "object") continue;
    const node = raw as Record<string, unknown>;
    const enclosure = node.enclosure && typeof node.enclosure === "object" ? (node.enclosure as Record<string, unknown>) : null;
    const enclosureLink = enclosure && typeof enclosure.link === "string" ? enclosure.link.trim() : "";
    let pubDate: string | undefined;
    if (typeof node.pubDate === "string" && node.pubDate.trim()) {
      const rawDate = node.pubDate.trim();
      // rss2json emits UTC as "YYYY-MM-DD HH:mm:ss" — normalize to ISO so
      // Date.parse reads it as UTC everywhere, not as implementation-local.
      pubDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(rawDate) ? rawDate.replace(" ", "T") + "Z" : rawDate;
    }
    const enclosureDuration = enclosure ? enclosure.duration : undefined;
    items.push({
      title: typeof node.title === "string" && node.title.trim() ? node.title.trim() : undefined,
      guid: typeof node.guid === "string" && node.guid.trim() ? node.guid.trim() : undefined,
      pubDate,
      durationSeconds:
        typeof enclosureDuration === "number" && Number.isFinite(enclosureDuration)
          ? Math.round(enclosureDuration)
          : typeof enclosureDuration === "string"
            ? parseDurationValue(enclosureDuration)
            : undefined,
      // Feeds occasionally declare plain-http enclosures; the relay already
      // fetched over https and the player upgrades/refuses as it would for any
      // pasted URL — refusing here would only strand resolvable episodes.
      enclosureUrl: /^https?:\/\//i.test(enclosureLink) ? enclosureLink : undefined,
      link: typeof node.link === "string" && node.link.trim() ? node.link.trim() : undefined,
    });
  }
  if (!title && !items.length) return null;
  return { title, items };
}

// ---------------------------------------------------------------------------
// 4. Episode matching — guid first, then title, then date+duration
// ---------------------------------------------------------------------------

export type MatchConfidence = "guid" | "title" | "fuzzy" | "date-duration";

export interface EpisodeMatch {
  item: RssItem;
  confidence: MatchConfidence;
  /** 0..1 — informational, for honest UI display. */
  score: number;
}

/** Aggressive but language-neutral title normalization. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Jaccard similarity over normalized word sets — good enough for re-titled shares. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const token of ta) if (tb.has(token)) overlap++;
  return overlap / (ta.size + tb.size - overlap);
}

const FUZZY_MIN = 0.6;
const DATE_TOLERANCE_MS = 36 * 3600 * 1000;
const DURATION_TOLERANCE_S = 60;

/**
 * Match the share-page episode against feed items. Never fabricates a match:
 * with no trustworthy signal the honest answer is null and the caller reports
 * "episode not found in this feed".
 */
export function matchEpisode(items: RssItem[], meta: SharePageMetadata): EpisodeMatch | null {
  // 1. GUID — the strongest identity.
  if (meta.guid) {
    const wanted = meta.guid.trim().toLowerCase();
    const hit = items.find((item) => item.guid?.trim().toLowerCase() === wanted);
    if (hit) return { item: hit, confidence: "guid", score: 1 };
  }
  // 2. Exact normalized title.
  if (meta.episodeTitle) {
    const wanted = normalizeTitle(meta.episodeTitle);
    if (wanted) {
      const hit = items.find((item) => item.title && normalizeTitle(item.title) === wanted);
      if (hit) return { item: hit, confidence: "title", score: 1 };
    }
  }
  // 3. Fuzzy title (Snipd sometimes decorates the share title).
  if (meta.episodeTitle) {
    let best: EpisodeMatch | null = null;
    for (const item of items) {
      if (!item.title) continue;
      const score = tokenSimilarity(meta.episodeTitle, item.title);
      if (score >= FUZZY_MIN && (!best || score > best.score)) best = { item, confidence: "fuzzy", score };
    }
    if (best) return best;
  }
  // 4. Publication date + duration agreement.
  if (meta.pubDate && meta.durationSeconds) {
    const wantedTime = Date.parse(meta.pubDate);
    if (!Number.isNaN(wantedTime)) {
      const hit = items.find((item) => {
        if (!item.pubDate || !item.durationSeconds) return false;
        const time = Date.parse(item.pubDate);
        if (Number.isNaN(time)) return false;
        return Math.abs(time - wantedTime) <= DATE_TOLERANCE_MS && Math.abs(item.durationSeconds - (meta.durationSeconds as number)) <= DURATION_TOLERANCE_S;
      });
      if (hit) return { item: hit, confidence: "date-duration", score: 0.7 };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5b. Podcast-directory search helpers (pure — network orchestration lives in
// the router, these stay unit-testable)
// ---------------------------------------------------------------------------

/**
 * Search-term variants for a show title, most specific first. Directory search
 * is literal: a decorated title ("Show | Network", "Show – mit Host") finds
 * nothing while its core name matches instantly, so we try the core too.
 */
export function itunesTermVariants(showTitle: string): string[] {
  const full = showTitle.trim();
  const variants: string[] = [];
  if (full.length >= 2) variants.push(full);
  const core = full.split(/\s*[|–—:·•]\s*|\s+(?:mit|with|by|von)\s+/i)[0]?.trim() ?? "";
  if (core.length >= 2 && core !== full) variants.push(core);
  return variants;
}

/** One result row of an iTunes Search API reply (show or episode entity). */
export interface ItunesResultRow {
  collectionName?: string;
  trackName?: string;
  feedUrl?: string;
  /** Episode-entity rows only: the canonical audio redirect, publish date, length. */
  episodeUrl?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
}

/**
 * Pick the show feed from an iTunes podcast-entity reply. An exact normalized
 * collection-name match wins; otherwise the first feed-bearing row stands —
 * the episode match against the real feed still guards the final answer.
 */
export function pickItunesShow(results: ItunesResultRow[], showTitle: string): { feedUrl: string; collectionName: string } | null {
  const candidates = results.filter((r) => typeof r.feedUrl === "string" && r.feedUrl.startsWith("http"));
  if (!candidates.length) return null;
  const wanted = normalizeTitle(showTitle);
  const exact = candidates.find((r) => r.collectionName && normalizeTitle(r.collectionName) === wanted);
  const chosen = exact ?? candidates[0];
  return { feedUrl: chosen.feedUrl as string, collectionName: chosen.collectionName ?? showTitle };
}

/**
 * A directory match for the shared EPISODE: the show's feed plus, when the
 * directory's episode row carries them, the canonical audio URL, publish date
 * and duration. The audio URL matters when the feed itself is only partially
 * readable (relay truncation) or unreachable — the directory entry is then
 * the only honest source for the episode's audio.
 */
export interface ItunesEpisodeHit {
  feedUrl: string;
  collectionName: string;
  audioUrl?: string;
  pubDate?: string;
  durationSeconds?: number;
}

/**
 * Pick a feed from an iTunes podcastEPISODE reply — the fallback when the show
 * title alone finds nothing (or no show title was extracted at all). Strict on
 * purpose: without a show name to cross-check, the returned episode title must
 * actually resemble the shared episode, or we would pin the wrong show's feed.
 */
export function pickItunesEpisode(results: ItunesResultRow[], meta: SharePageMetadata): ItunesEpisodeHit | null {
  const candidates = results.filter((r) => typeof r.feedUrl === "string" && r.feedUrl.startsWith("http"));
  if (!candidates.length) return null;
  const wantedShow = meta.showTitle ? normalizeTitle(meta.showTitle) : "";
  const wantedEpisode = meta.episodeTitle ? normalizeTitle(meta.episodeTitle) : "";
  if (!wantedEpisode) return null;
  for (const row of candidates) {
    const rowEpisode = row.trackName ? normalizeTitle(row.trackName) : "";
    const episodeAgrees = rowEpisode === wantedEpisode || tokenSimilarity(row.trackName ?? "", meta.episodeTitle ?? "") >= 0.6;
    if (!episodeAgrees) continue;
    // A known show name must not contradict the row's collection.
    if (wantedShow && row.collectionName) {
      const rowShow = normalizeTitle(row.collectionName);
      if (rowShow !== wantedShow && tokenSimilarity(row.collectionName, meta.showTitle as string) < 0.5) continue;
    }
    const hit: ItunesEpisodeHit = { feedUrl: row.feedUrl as string, collectionName: row.collectionName ?? meta.showTitle ?? "" };
    if (typeof row.episodeUrl === "string" && /^https:\/\//i.test(row.episodeUrl)) hit.audioUrl = row.episodeUrl;
    if (typeof row.releaseDate === "string" && !Number.isNaN(Date.parse(row.releaseDate))) hit.pubDate = row.releaseDate;
    if (typeof row.trackTimeMillis === "number" && Number.isFinite(row.trackTimeMillis) && row.trackTimeMillis > 0) {
      hit.durationSeconds = Math.round(row.trackTimeMillis / 1000);
    }
    return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. SSRF guard — IP literal classification (the router resolves DNS first)
// ---------------------------------------------------------------------------

/**
 * True for any address that must never be fetched server-side: loopback,
 * RFC1918, link-local, CGNAT, documentation ranges, multicast/reserved,
 * IPv6 loopback/ULA/link-local, and IPv4-mapped IPv6.
 */
export function isPrivateIp(ip: string): boolean {
  const text = ip.trim().toLowerCase();
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) — unwrap and re-check.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (mapped) return isPrivateIp(mapped[1]);
  if (text.includes(":")) {
    if (text === "::" || text === "::1") return true;
    if (text.startsWith("fe80:") || text.startsWith("fe80::")) return true;
    const firstGroup = parseInt(text.split(":")[0] || "0", 16);
    if ((firstGroup & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((firstGroup & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((firstGroup & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }
  const parts = text.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // unparseable → refuse
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true; // 192.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}
