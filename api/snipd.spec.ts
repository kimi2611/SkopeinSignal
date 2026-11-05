import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  extractPageMetadata,
  isBotChallenge,
  isPrivateIp,
  itunesTermVariants,
  matchEpisode,
  metadataFromMicrolink,
  metadataFromLinkPreview,
  normalizeTitle,
  parseDurationValue,
  parseRss,
  parseRss2Json,
  parseSnipdShareUrl,
  pickItunesEpisode,
  pickItunesShow,
  showFromEpisodeDescription,
  tokenSimilarity,
} from "./lib/snipd";

describe("parseSnipdShareUrl — only canonical public share links pass", () => {
  it("accepts an episode share link and strips query + hash", () => {
    const link = parseSnipdShareUrl("https://share.snipd.com/episode/3fa85f64-5717-4562-b3fc-2c963f66afa6?utm_source=x#frag");
    expect(link).toEqual({
      kind: "episode",
      id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      url: "https://share.snipd.com/episode/3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });
  });

  it("accepts show and takeaways kinds", () => {
    expect(parseSnipdShareUrl("https://share.snipd.com/show/9b2c9f5e-1111-4222-8333-abcdefabcdef")?.kind).toBe("show");
    expect(parseSnipdShareUrl("https://share.snipd.com/episode-takeaways/9b2c9f5e-1111-4222-8333-abcdefabcdef")?.kind).toBe("episode-takeaways");
  });

  it("rejects other hosts, http, credentials, ports, and junk paths", () => {
    expect(parseSnipdShareUrl("https://snipd.com/episode/3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBeNull();
    expect(parseSnipdShareUrl("http://share.snipd.com/episode/3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBeNull();
    expect(parseSnipdShareUrl("https://user:pass@share.snipd.com/episode/3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBeNull();
    expect(parseSnipdShareUrl("https://share.snipd.com:8443/episode/3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBeNull();
    expect(parseSnipdShareUrl("https://share.snipd.com/episode/")).toBeNull();
    expect(parseSnipdShareUrl("https://share.snipd.com/episode/id/extra")).toBeNull();
    expect(parseSnipdShareUrl("not a url")).toBeNull();
    expect(parseSnipdShareUrl("https://share.snipd.com/episode/../../etc")).toBeNull();
  });
});

describe("parseDurationValue", () => {
  it("parses ISO8601, clock, and plain-seconds forms", () => {
    expect(parseDurationValue("PT1H2M3S")).toBe(3723);
    expect(parseDurationValue("PT45M")).toBe(2700);
    expect(parseDurationValue("1:02:03")).toBe(3723);
    expect(parseDurationValue("12:05")).toBe(725);
    expect(parseDurationValue("3723")).toBe(3723);
    expect(parseDurationValue(3723.4)).toBe(3723);
    expect(parseDurationValue("0")).toBeUndefined();
    expect(parseDurationValue("nonsense")).toBeUndefined();
  });
});

describe("extractPageMetadata — JSON-LD + OG + declared feed hints", () => {
  it("reads a schema.org PodcastEpisode with a series and declared feed", () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">{
        "@context": "https://schema.org",
        "@type": "PodcastEpisode",
        "name": "The Mystery of the Blue Train &amp; Beyond",
        "datePublished": "2026-09-14T07:00:00Z",
        "timeDuration": "PT47M30S",
        "identifier": "podlove-2026-09-14t07:00:00+00:00-abc123",
        "partOfSeries": { "@type": "PodcastSeries", "name": "Signals &amp; Noise" }
      }</script>
      <link rel="alternate" type="application/rss+xml" href="https://podcast.example.org/feed.xml" />
      </head><body></body></html>`;
    const meta = extractPageMetadata(html);
    expect(meta.episodeTitle).toBe("The Mystery of the Blue Train & Beyond");
    expect(meta.showTitle).toBe("Signals & Noise");
    expect(meta.pubDate).toBe("2026-09-14T07:00:00Z");
    expect(meta.durationSeconds).toBe(2850);
    expect(meta.guid).toBe("podlove-2026-09-14t07:00:00+00:00-abc123");
    expect(meta.feedUrl).toBe("https://podcast.example.org/feed.xml");
  });

  it("falls back to OG tags and hydration JSON", () => {
    const html = `<html><head>
      <meta property="og:title" content="Episode 12: The Long Now" />
      <meta property="og:audio" content="https://cdn.example.net/audio/ep12.mp3" />
      <script>window.__DATA__ = {"feedUrl":"https:\\/\\/feeds.example.org\\/show","duration":3615,"showTitle":"Deep Time"}</script>
      </head></html>`;
    const meta = extractPageMetadata(html);
    expect(meta.episodeTitle).toBe("Episode 12: The Long Now");
    expect(meta.audioUrl).toBe("https://cdn.example.net/audio/ep12.mp3");
    expect(meta.feedUrl).toBe("https://feeds.example.org/show");
    expect(meta.durationSeconds).toBe(3615);
    expect(meta.showTitle).toBe("Deep Time");
  });

  it("tolerates a page with nothing useful", () => {
    expect(extractPageMetadata("<html><body>hello</body></html>")).toEqual({});
  });
});

describe("parseRss — server-side feed reading", () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
    <channel>
      <title>Signals &amp; Noise</title>
      <item>
        <title><![CDATA[The Mystery of the Blue Train & Beyond]]></title>
        <guid isPermaLink="false">podlove-2026-09-14t07:00:00+00:00-abc123</guid>
        <pubDate>Mon, 14 Sep 2026 07:00:00 +0000</pubDate>
        <itunes:duration>47:30</itunes:duration>
        <enclosure url="https://cdn.example.org/episodes/blue-train.mp3" length="45600000" type="audio/mpeg"/>
      </item>
      <item>
        <title>Older episode</title>
        <guid>older-1</guid>
        <pubDate>Mon, 07 Sep 2026 07:00:00 +0000</pubDate>
        <enclosure url="https://cdn.example.org/episodes/older.mp3" type="audio/mpeg"/>
      </item>
    </channel>
  </rss>`;

  it("reads the channel title and both items with CDATA + entities decoded", () => {
    const parsed = parseRss(feed);
    expect(parsed.title).toBe("Signals & Noise");
    expect(parsed.items.length).toBe(2);
    expect(parsed.items[0]).toMatchObject({
      title: "The Mystery of the Blue Train & Beyond",
      guid: "podlove-2026-09-14t07:00:00+00:00-abc123",
      durationSeconds: 2850,
      enclosureUrl: "https://cdn.example.org/episodes/blue-train.mp3",
    });
  });
});

describe("matchEpisode — guid > title > fuzzy > date+duration", () => {
  const items = [
    {
      title: "The Mystery of the Blue Train & Beyond",
      guid: "podlove-2026-09-14t07:00:00+00:00-abc123",
      pubDate: "Mon, 14 Sep 2026 07:00:00 +0000",
      durationSeconds: 2850,
      enclosureUrl: "https://cdn.example.org/episodes/blue-train.mp3",
    },
    {
      title: "A Completely Different Episode",
      guid: "other-9",
      pubDate: "Mon, 07 Sep 2026 07:00:00 +0000",
      durationSeconds: 1900,
      enclosureUrl: "https://cdn.example.org/episodes/other.mp3",
    },
  ];

  it("wins on guid even when titles drift", () => {
    const match = matchEpisode(items, { guid: "podlove-2026-09-14t07:00:00+00:00-abc123", episodeTitle: "Renamed beyond recognition" });
    expect(match?.confidence).toBe("guid");
    expect(match?.item.enclosureUrl).toBe("https://cdn.example.org/episodes/blue-train.mp3");
  });

  it("matches an exact normalized title", () => {
    // Case and punctuation differences still land on the same normalized form.
    const match = matchEpisode(items, { episodeTitle: "The Mystery of the Blue Train & Beyond!" });
    expect(match?.confidence).toBe("title");
  });

  it("matches a fuzzy title when the share page decorates it", () => {
    const match = matchEpisode(items, { episodeTitle: "The Mystery of the Blue Train and Beyond — Snipd" });
    expect(match?.confidence).toBe("fuzzy");
  });

  it("matches on date + duration when nothing else is known", () => {
    const match = matchEpisode(items, { pubDate: "2026-09-14T06:30:00Z", durationSeconds: 2820 });
    expect(match?.confidence).toBe("date-duration");
  });

  it("honestly reports no match instead of guessing", () => {
    expect(matchEpisode(items, { episodeTitle: "Unrelated Words Entirely" })).toBeNull();
    expect(matchEpisode(items, {})).toBeNull();
  });
});

describe("normalizeTitle / tokenSimilarity", () => {
  it("strips diacritics, case, and punctuation", () => {
    expect(normalizeTitle("  Das Café — Folge 12! ")).toBe("das cafe folge 12");
  });

  it("scores token overlap", () => {
    expect(tokenSimilarity("the long now", "the long now")).toBe(1);
    expect(tokenSimilarity("the long now", "completely different words")).toBe(0);
  });
});

describe("isPrivateIp — SSRF guard classification", () => {
  it("blocks loopback, RFC1918, link-local, CGNAT, and multicast", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.5", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it("blocks IPv6 loopback, ULA, link-local, and mapped v4", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("::ffff:192.168.0.1")).toBe(true);
  });

  it("allows ordinary public addresses", () => {
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("172.15.0.1")).toBe(false); // just outside 172.16/12
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });

  it("refuses garbage instead of passing it through", () => {
    expect(isPrivateIp("999.1.2.3")).toBe(true);
    expect(isPrivateIp("not-an-ip")).toBe(true);
  });
});

describe("decodeHtmlEntities", () => {
  it("handles named, decimal, and hex entities", () => {
    expect(decodeHtmlEntities("Signals &amp; Noise &#8212; &#x2014; &quot;quoted&quot;")).toBe('Signals & Noise — — "quoted"');
  });
});

describe("isBotChallenge", () => {
  const CF_CHALLENGE =
    '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id="challenge-platform">Enable JavaScript and cookies to continue</div></body></html>';
  const REAL_PAGE = '<!DOCTYPE html><html><head><title>Snipd — Episode</title><meta property="og:title" content="A real episode"></head><body>content</body></html>';

  it("flags a Cloudflare interstitial served as 403", () => {
    expect(isBotChallenge(403, CF_CHALLENGE)).toBe(true);
  });

  it("flags a challenge passed through by a relay with status 200", () => {
    expect(isBotChallenge(200, CF_CHALLENGE)).toBe(true);
  });

  it("does not flag a genuine page, whatever the status", () => {
    expect(isBotChallenge(200, REAL_PAGE)).toBe(false);
    expect(isBotChallenge(403, REAL_PAGE)).toBe(false);
    expect(isBotChallenge(404, REAL_PAGE)).toBe(false);
  });

  it("does not flag a bare error status without challenge markers", () => {
    expect(isBotChallenge(500, "Internal Server Error")).toBe(false);
    expect(isBotChallenge(403, "Forbidden")).toBe(false);
  });
});

describe("metadataFromMicrolink", () => {
  it("extracts title, show name, date and audio from a success payload", () => {
    const meta = metadataFromMicrolink({
      status: "success",
      data: {
        title: "自来水冲出的奴性：虚荣过剩，自尊缺席",
        description: "Episode from 徒步的骑手",
        date: "2025-07-23T12:00:00.000Z",
        audio: { url: "https://example.com/ep.mp3" },
      },
    });
    expect(meta).toEqual({
      episodeTitle: "自来水冲出的奴性：虚荣过剩，自尊缺席",
      showTitle: "徒步的骑手",
      pubDate: "2025-07-23T12:00:00.000Z",
      audioUrl: "https://example.com/ep.mp3",
    });
  });

  it("ignores descriptions that do not name a show", () => {
    const meta = metadataFromMicrolink({
      status: "success",
      data: { title: "Some episode", description: "Listen now on all platforms" },
    });
    expect(meta?.episodeTitle).toBe("Some episode");
    expect(meta?.showTitle).toBeUndefined();
  });

  it("refuses non-http audio urls and failed payloads", () => {
    expect(
      metadataFromMicrolink({ status: "success", data: { title: "X", audio: { url: "file:///etc/passwd" } } })?.audioUrl,
    ).toBeUndefined();
    expect(metadataFromMicrolink({ status: "fail" })).toBeNull();
    expect(metadataFromMicrolink(null)).toBeNull();
    expect(metadataFromMicrolink({ status: "success", data: {} })).toBeNull();
  });
});

describe("metadataFromLinkPreview", () => {
  it("extracts the real title and show from the reported Snipd link preview", () => {
    const meta = metadataFromLinkPreview({
      error: "",
      likely_type: "html",
      title: "Wolfgang Munchau: The end of the Euro",
      description: "Episode from UnHerd with Freddie Sayers",
    });
    expect(meta).toEqual({
      episodeTitle: "Wolfgang Munchau: The end of the Euro",
      showTitle: "UnHerd with Freddie Sayers",
    });
  });

  it("accepts the staging reader's untyped response when it contains the same public metadata", () => {
    expect(metadataFromLinkPreview({
      error: "",
      likely_type: "",
      title: "Wolfgang Munchau: The end of the Euro",
      description: "Episode from UnHerd with Freddie Sayers",
    })).toEqual({
      episodeTitle: "Wolfgang Munchau: The end of the Euro",
      showTitle: "UnHerd with Freddie Sayers",
    });
  });

  it("rejects errors, non-HTML previews and empty titles", () => {
    expect(metadataFromLinkPreview({ error: "blocked", likely_type: "html", title: "X" })).toBeNull();
    expect(metadataFromLinkPreview({ error: "", likely_type: "image", title: "X" })).toBeNull();
    expect(metadataFromLinkPreview({ error: "", likely_type: "html", title: " " })).toBeNull();
    expect(metadataFromLinkPreview(null)).toBeNull();
  });
});

describe("parseRss2Json", () => {
  it("extracts items with enclosure audio, guid, UTC-normalized dates and duration", () => {
    const feed = parseRss2Json({
      status: "ok",
      feed: { title: "UnHerd with Freddie Sayers" },
      items: [
        {
          title: "France in crisis: What happens next?",
          guid: "6ad668d3d068f31796ad2a45",
          pubDate: "2026-10-19 19:00:35",
          link: "https://shows.acast.com/x/episodes/france-in-crisis",
          enclosure: { link: "https://sphinx.acast.com/p/open/s/1/e/2/media.mp3", type: "audio/mpeg", duration: 2683 },
        },
      ],
    });
    expect(feed).not.toBeNull();
    expect(feed?.title).toBe("UnHerd with Freddie Sayers");
    expect(feed?.items).toHaveLength(1);
    const item = feed?.items[0];
    expect(item?.title).toBe("France in crisis: What happens next?");
    expect(item?.guid).toBe("6ad668d3d068f31796ad2a45");
    expect(item?.enclosureUrl).toBe("https://sphinx.acast.com/p/open/s/1/e/2/media.mp3");
    expect(item?.durationSeconds).toBe(2683);
    expect(item?.pubDate).toBe("2026-10-19T19:00:35Z");
    // The normalized date must parse as UTC so the date+duration match works.
    expect(Date.parse(item?.pubDate ?? "")).toBe(Date.UTC(2026, 9, 19, 19, 0, 35));
  });

  it("parses an item matched against microlink metadata by title", () => {
    const feed = parseRss2Json({
      status: "ok",
      feed: { title: "Show" },
      items: [{ title: "France in crisis: What happens next?", pubDate: "2026-10-19 19:00:35", enclosure: { link: "https://cdn.example.com/ep.mp3", duration: 2683 } }],
    });
    const match = matchEpisode(feed?.items ?? [], { episodeTitle: "France in crisis: What happens next?", showTitle: "Show", pubDate: "2026-10-19T12:00:00.000Z" });
    expect(match?.confidence).toBe("title");
    expect(match?.item.enclosureUrl).toBe("https://cdn.example.com/ep.mp3");
  });

  it("accepts plain-http enclosure links (some feeds still declare them)", () => {
    const feed = parseRss2Json({
      status: "ok",
      items: [{ title: "Ep", enclosure: { link: "http://insecure.example.com/ep.mp3" } }],
    });
    expect(feed?.items[0]?.enclosureUrl).toBe("http://insecure.example.com/ep.mp3");
    const bad = parseRss2Json({ status: "ok", items: [{ title: "Ep", enclosure: { link: "file:///etc/passwd" } }] });
    expect(bad?.items[0]?.enclosureUrl).toBeUndefined();
  });

  it("returns null for fail status, non-object payloads and empty successes", () => {
    expect(parseRss2Json(null)).toBeNull();
    expect(parseRss2Json("not json")).toBeNull();
    expect(parseRss2Json({ status: "error", message: "feed not found" })).toBeNull();
    expect(parseRss2Json({ status: "ok" })).toBeNull();
  });

  it("keeps unparseable dates as-is rather than fabricating ISO", () => {
    const feed = parseRss2Json({ status: "ok", items: [{ title: "Ep", pubDate: "yesterday-ish" }] });
    expect(feed?.items[0]?.pubDate).toBe("yesterday-ish");
  });
});

describe("showFromEpisodeDescription — localized share-page templates", () => {
  it("parses the English template", () => {
    expect(showFromEpisodeDescription("Episode from 徒步的骑手")).toBe("徒步的骑手");
  });

  it("parses the German templates", () => {
    expect(showFromEpisodeDescription("Folge von Fest & Flauschig")).toBe("Fest & Flauschig");
    expect(showFromEpisodeDescription("Episode aus Der Podcast")).toBe("Der Podcast");
  });

  it("parses French, Spanish, Dutch and Portuguese templates", () => {
    expect(showFromEpisodeDescription("Épisode de France Culture")).toBe("France Culture");
    expect(showFromEpisodeDescription("Episodio de Radio Ambulante")).toBe("Radio Ambulante");
    expect(showFromEpisodeDescription("Aflevering van Echt Gebeurd")).toBe("Echt Gebeurd");
    expect(showFromEpisodeDescription("Episódio de Antena 1")).toBe("Antena 1");
  });

  it("returns undefined for descriptions that name no show", () => {
    expect(showFromEpisodeDescription("Listen now on all platforms")).toBeUndefined();
    expect(showFromEpisodeDescription("")).toBeUndefined();
  });

  it("feeds the show title into metadataFromMicrolink for localized pages", () => {
    const meta = metadataFromMicrolink({
      status: "success",
      data: { title: "Die große Frage", description: "Folge von Fest & Flauschig" },
    });
    expect(meta?.showTitle).toBe("Fest & Flauschig");
  });
});

describe("itunesTermVariants — decorated show titles", () => {
  it("returns the full title plus a stripped core", () => {
    expect(itunesTermVariants("Fest & Flauschig | ZEIT ONLINE")).toEqual(["Fest & Flauschig | ZEIT ONLINE", "Fest & Flauschig"]);
    expect(itunesTermVariants("The Daily – mit allem")).toEqual(["The Daily – mit allem", "The Daily"]);
  });

  it("splits on host-attribution phrases", () => {
    expect(itunesTermVariants("Podcast mit Jan Böhmermann")).toEqual(["Podcast mit Jan Böhmermann", "Podcast"]);
    expect(itunesTermVariants("Show with Friends")).toEqual(["Show with Friends", "Show"]);
  });

  it("keeps a plain title as the only variant and drops too-short terms", () => {
    expect(itunesTermVariants("Fest & Flauschig")).toEqual(["Fest & Flauschig"]);
    expect(itunesTermVariants("A")).toEqual([]);
    expect(itunesTermVariants("  ")).toEqual([]);
  });
});

describe("pickItunesShow", () => {
  it("prefers an exact normalized collection match over row order", () => {
    const hit = pickItunesShow(
      [
        { collectionName: "Other Show", feedUrl: "https://a.example.com/feed" },
        { collectionName: "Fest & Flauschig!", feedUrl: "https://b.example.com/feed" },
      ],
      "Fest & Flauschig",
    );
    expect(hit).toEqual({ feedUrl: "https://b.example.com/feed", collectionName: "Fest & Flauschig!" });
  });

  it("falls back to the first feed-bearing row when nothing matches exactly", () => {
    const hit = pickItunesShow([{ collectionName: "Something", feedUrl: "https://a.example.com/feed" }], "Unknown");
    expect(hit?.feedUrl).toBe("https://a.example.com/feed");
  });

  it("returns null when no row carries a feed URL", () => {
    expect(pickItunesShow([{ collectionName: "No Feed" }], "No Feed")).toBeNull();
  });
});

describe("pickItunesEpisode — episode-title directory fallback", () => {
  const rows = [
    { collectionName: "徒步的骑手", trackName: "自来水冲出的奴性：虚荣过剩，自尊缺席", feedUrl: "https://anchor.fm/s/x/podcast/rss" },
    { collectionName: "Unrelated", trackName: "Something else entirely", feedUrl: "https://other.example.com/rss" },
  ];

  it("matches on the episode title and returns the feed", () => {
    const hit = pickItunesEpisode(rows, { episodeTitle: "自来水冲出的奴性：虚荣过剩，自尊缺席" });
    expect(hit?.feedUrl).toBe("https://anchor.fm/s/x/podcast/rss");
  });

  it("carries the episode's audio URL, date and duration when the directory has them", () => {
    const hit = pickItunesEpisode(
      [
        {
          collectionName: "徒步的骑手",
          trackName: "自来水冲出的奴性：虚荣过剩，自尊缺席",
          feedUrl: "https://anchor.fm/s/x/podcast/rss",
          episodeUrl: "https://anchor.fm/s/x/podcast/play/123/https%3A%2F%2Fcdn.example.com%2Fep.m4a",
          releaseDate: "2025-07-23T02:46:17Z",
          trackTimeMillis: 1807000,
        },
      ],
      { episodeTitle: "自来水冲出的奴性：虚荣过剩，自尊缺席" },
    );
    expect(hit?.audioUrl).toBe("https://anchor.fm/s/x/podcast/play/123/https%3A%2F%2Fcdn.example.com%2Fep.m4a");
    expect(hit?.pubDate).toBe("2025-07-23T02:46:17Z");
    expect(hit?.durationSeconds).toBe(1807);
  });

  it("drops non-https episode URLs and junk dates rather than passing them on", () => {
    const hit = pickItunesEpisode(
      [
        {
          trackName: "Die große Frage",
          feedUrl: "https://x.example.com/rss",
          episodeUrl: "file:///etc/passwd",
          releaseDate: "not a date",
          trackTimeMillis: -5,
        },
      ],
      { episodeTitle: "Die große Frage" },
    );
    expect(hit?.audioUrl).toBeUndefined();
    expect(hit?.pubDate).toBeUndefined();
    expect(hit?.durationSeconds).toBeUndefined();
  });

  it("rejects rows whose episode title does not resemble the shared one", () => {
    expect(pickItunesEpisode([rows[1]], { episodeTitle: "自来水冲出的奴性：虚荣过剩，自尊缺席" })).toBeNull();
  });

  it("rejects an episode match whose collection contradicts a known show title", () => {
    const hit = pickItunesEpisode(
      [{ collectionName: "Totally Different Show", trackName: "Die große Frage", feedUrl: "https://x.example.com/rss" }],
      { episodeTitle: "Die große Frage", showTitle: "Fest & Flauschig" },
    );
    expect(hit).toBeNull();
  });

  it("requires an episode title — never picks a feed on the show name alone", () => {
    expect(pickItunesEpisode(rows, { showTitle: "徒步的骑手" })).toBeNull();
  });
});
