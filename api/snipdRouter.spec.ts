import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34" }] }));

import { snipdRouter } from "./snipdRouter";

const EPISODE_ID = "48974812-22b2-4757-97db-f9be322b23fa";
const SHARE_URL = `https://share.snipd.com/episode/${EPISODE_ID}`;
const FEED_URL = "https://feeds.acast.com/public/shows/5fad6d24bc034454b53fe011";
const AUDIO_URL = "https://sphinx.acast.com/p/open/s/5fad6d24bc034454b53fe011/e/6adf949c1131e981782fa04b/media.mp3";
const TITLE = "Wolfgang Munchau: The end of the Euro";
const SHOW = "UnHerd with Freddie Sayers";

function caller() {
  return snipdRouter.createCaller({
    req: new Request("http://localhost/"),
    resHeaders: new Headers(),
    user: {
      id: 1,
      unionId: "test-user",
      name: "Test",
      email: null,
      avatar: null,
      passwordHash: null,
      role: "user",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      lastSignInAt: new Date(0),
    },
  });
}

function preview(shareUrl = SHARE_URL) {
  return {
    error: "",
    likely_type: "html",
    url: shareUrl,
    title: TITLE,
    description: `Episode from ${SHOW}`,
  };
}

function directory() {
  return {
    resultCount: 1,
    results: [{
      trackName: TITLE,
      collectionName: SHOW,
      feedUrl: FEED_URL,
      episodeUrl: AUDIO_URL,
      episodeGuid: "6adf949c1131e981782fa04b",
      releaseDate: "2026-10-26T17:57:48Z",
      trackTimeMillis: 2022000,
    }],
  };
}

function feed() {
  return `<?xml version="1.0"?><rss><channel><title>${SHOW}</title><item><title>${TITLE}</title><guid>6adf949c1131e981782fa04b</guid><pubDate>Mon, 26 Oct 2026 17:57:48 GMT</pubDate><itunes:duration>2022</itunes:duration><enclosure url="${AUDIO_URL}" type="audio/mpeg" /></item></channel></rss>`;
}

function routeSuccess(fetchMock: ReturnType<typeof vi.fn>, shareUrl = SHARE_URL) {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === shareUrl) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    if (url.startsWith("https://cardyb.bsky.app/")) return new Response(JSON.stringify(preview(shareUrl)));
    if (url.startsWith("https://itunes.apple.com/search")) return new Response(JSON.stringify(directory()));
    if (url === FEED_URL) return new Response(feed());
    throw new Error(`unexpected test fetch: ${url}`);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Snipd resolver — public preview fallback and cache", () => {
  it("resolves the reported complete link through Cardyb, directory and RSS evidence", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    routeSuccess(fetchMock);
    const result = await caller().resolve({ url: SHARE_URL });
    expect(result.episodeTitle).toBe(TITLE);
    expect(result.showTitle).toBe(SHOW);
    expect(result.feedUrl).toBe(FEED_URL);
    expect(result.audioUrl).toBe(AUDIO_URL);
    expect(result.guid).toBe("6adf949c1131e981782fa04b");
    expect(result.durationSeconds).toBe(2022);
    expect(result.matchedBy).toBe("title");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://cardyb.bsky.app/"))).toBe(true);
  });

  it("falls through an unreachable production Cardyb to the staging preview reader", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const stagingShareUrl = "https://share.snipd.com/episode/58974812-22b2-4757-97db-f9be322b23fa";
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === stagingShareUrl || url.startsWith("https://cardyb.bsky.app/")) throw new Error("unreachable");
      if (url.startsWith("https://cardyb.staging.bsky.dev/")) {
        return new Response(JSON.stringify({ ...preview(), likely_type: "" }));
      }
      if (url.startsWith("https://itunes.apple.com/search")) return new Response(JSON.stringify(directory()));
      if (url === FEED_URL) return new Response(feed());
      throw new Error(`unexpected test fetch: ${url}`);
    });
    const result = await caller().resolve({ url: stagingShareUrl });
    expect(result.episodeTitle).toBe(TITLE);
    expect(result.audioUrl).toBe(AUDIO_URL);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://cardyb.staging.bsky.dev/"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://api.microlink.io"))).toBe(false);
  });

  it("reuses fresh public metadata without touching Snipd or any relay", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    routeSuccess(fetchMock);
    const api = caller();
    await api.resolve({ url: SHARE_URL });
    fetchMock.mockClear();
    routeSuccess(fetchMock);
    const result = await api.resolve({ url: SHARE_URL });
    expect(result.audioUrl).toBe(AUDIO_URL);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === SHARE_URL)).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://cardyb.bsky.app/"))).toBe(false);
  });

  it("uses recent stale public metadata only after every live share-page path fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    const staleShareUrl = "https://share.snipd.com/episode/68974812-22b2-4757-97db-f9be322b23fa";
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    routeSuccess(fetchMock, staleShareUrl);
    const api = caller();
    await api.resolve({ url: staleShareUrl });
    vi.advanceTimersByTime(7 * 60 * 60 * 1000);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://itunes.apple.com/search")) return new Response(JSON.stringify(directory()));
      if (url === FEED_URL) return new Response(feed());
      if (url === staleShareUrl || url.startsWith("https://cardyb.bsky.app/") || url.startsWith("https://cardyb.staging.bsky.dev/") || url.startsWith("https://api.microlink.io") || url.startsWith("https://api.allorigins.win/")) {
        return new Response("temporarily unavailable", { status: 429 });
      }
      throw new Error(`unexpected test fetch: ${url}`);
    });
    const result = await api.resolve({ url: staleShareUrl });
    expect(result.episodeTitle).toBe(TITLE);
    expect(result.audioUrl).toBe(AUDIO_URL);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://api.microlink.io"))).toBe(true);
  });

  it("reports a transient bot/relay failure, never an invalid-link verdict", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const otherId = "99974812-22b2-4757-97db-f9be322b23fa";
    const otherUrl = `https://share.snipd.com/episode/${otherId}`;
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === otherUrl) return new Response("<html>Just a moment... cf-chl-</html>", { status: 403 });
      return new Response("rate limited", { status: 429 });
    });
    await expect(caller().resolve({ url: otherUrl })).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: "share-page-blocked",
    });
  });
});
