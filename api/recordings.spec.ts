import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERFORMANCE_RECORDINGS } from "../src/data/recordings";
import { RECORDING_ILLUSTRATIONS } from "../src/data/recordingIllustrations";
import { MODULE_ILLUSTRATIONS } from "../src/data/moduleIllustrations";
import { HISTORICAL_ARTWORKS } from "../src/data/artworks";

const root = path.resolve(import.meta.dirname, "..");

describe("real performance recording catalogue", () => {
  it("contains twenty-two distinct real recordings: solos, chamber works, an accompanied duo, soloist-with-orchestra works, and purely instrumental orchestra", () => {
    expect(PERFORMANCE_RECORDINGS).toHaveLength(22);
    expect(new Set(PERFORMANCE_RECORDINGS.map((item) => item.id)).size).toBe(22);
    expect(new Set(PERFORMANCE_RECORDINGS.map((item) => item.src)).size).toBe(22);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.instrument === "Piano")).toHaveLength(2);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.instrument === "Flute")).toHaveLength(4);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.instrument === "Classical guitar")).toHaveLength(5);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.instrument === "Harp")).toHaveLength(3);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.instrument === "Cello")).toHaveLength(2);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.instrument === "Bassoon")).toHaveLength(4);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.instrument === "Symphony orchestra")).toHaveLength(2);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.format === "Solo recording")).toHaveLength(13);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.format === "Duo recording")).toHaveLength(1);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.format === "Chamber recording")).toHaveLength(2);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.format === "Concerto recording")).toHaveLength(4);
    expect(PERFORMANCE_RECORDINGS.filter((item) => item.format === "Orchestral recording")).toHaveLength(2);
    // No acoustic-era 78 rpm sides with surface noise on any harp recording; the
    // two Debussy dances stay the clean modern Marine Chamber Orchestra performances.
    for (const item of PERFORMANCE_RECORDINGS.filter((entry) => entry.instrument === "Harp")) {
      expect(item.character.toLowerCase(), item.id).not.toMatch(/78|1915|acoustic recording|victor/);
    }
    for (const item of PERFORMANCE_RECORDINGS.filter((entry) => entry.id === "harp" || entry.id === "harp-prelude")) {
      expect(item.composer).toBe("Claude Debussy");
      expect(item.performer).toContain("United States Marine Chamber Orchestra");
    }
    for (const item of PERFORMANCE_RECORDINGS) {
      // Accompaniment is allowed; choral works are excluded; nothing accompanied
      // may be labeled a solo.
      expect(["Solo recording", "Duo recording", "Chamber recording", "Concerto recording", "Orchestral recording"], item.id).toContain(item.format);
      expect(item.character.toLowerCase(), item.id).not.toMatch(/chorus|choir|vocal/);
      if (item.format === "Solo recording") {
        expect(item.character.toLowerCase(), item.id).not.toMatch(/& piano|& orchestra|with orchestra/);
      }
      if (item.format === "Orchestral recording") {
        expect(item.character.toLowerCase(), item.id).not.toMatch(/& chorus|chorus/);
      }
      expect(item.note.length, item.id).toBeGreaterThan(40);
    }
  });

  it("maps every performance to one complete, unique, credited illustration without touching module art", () => {
    expect(RECORDING_ILLUSTRATIONS).toHaveLength(22);
    expect(new Set(RECORDING_ILLUSTRATIONS.map((item) => item.recordingId)).size).toBe(22);
    expect(new Set(RECORDING_ILLUSTRATIONS.map((item) => item.src)).size).toBe(22);
    expect(new Set(RECORDING_ILLUSTRATIONS.map((item) => item.recordingId))).toEqual(new Set(PERFORMANCE_RECORDINGS.map((item) => item.id)));
    const moduleSources = new Set(Object.values(MODULE_ILLUSTRATIONS).map((item) => item.src));
    for (const item of RECORDING_ILLUSTRATIONS) {
      expect(moduleSources.has(item.src), item.recordingId).toBe(false);
      expect(statSync(path.join(root, "public", item.src)).size, item.recordingId).toBeGreaterThan(5_000);
      expect(item.book, item.recordingId).toContain("Toot & Puddle");
      expect(item.scene.length, item.recordingId).toBeGreaterThan(12);
      expect(item.scene.toLowerCase(), item.recordingId).not.toMatch(/\b(?:back-)?covers?\b/);
      expect(item.sourceUrl, item.recordingId).toMatch(/^https?:\/\//);
      expect(item.sourceLabel.length, item.recordingId).toBeGreaterThan(3);
    }
  });

  it("uses precise artwork sources and corrected museum catalogue data", () => {
    for (const item of HISTORICAL_ARTWORKS) {
      expect(item.sourceUrl, item.id).toMatch(/^https:\/\//);
      expect(item.sourceUrl, item.id).not.toContain("Special:MediaSearch");
      expect(item.artist.length, item.id).toBeGreaterThan(2);
      expect(item.collection.length, item.id).toBeGreaterThan(2);
    }
    expect(HISTORICAL_ARTWORKS.find((item) => item.id === "two-schooners")?.collection).toBe("Philadelphia Museum of Art");
    expect(HISTORICAL_ARTWORKS.find((item) => item.id === "mountain-fire")?.date).toBe("c. 1906–1907");
    expect(HISTORICAL_ARTWORKS.find((item) => item.id === "melon-boats")?.date).toBe("c. 1908");
  });

  it("ships a nonempty MP3 and explicit source and license for every entry", () => {
    for (const item of PERFORMANCE_RECORDINGS) {
      const file = path.join(root, "public", item.src);
      expect(statSync(file).size, item.id).toBeGreaterThan(100_000);
      const header = readFileSync(file).subarray(0, 3);
      const isMp3 = header.toString("latin1") === "ID3" || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
      expect(isMp3, item.id).toBe(true);
      expect(item.sourceUrl, item.id).toMatch(/^https:\/\//);
      expect(item.licenseUrl, item.id).toMatch(/^https:\/\//);
      expect(item.license.length, item.id).toBeGreaterThan(0);
      expect(item.performer.length, item.id).toBeGreaterThan(0);
    }
  });
});

describe("offline shell privacy", () => {
  it("uses the current cache and never intercepts private API responses or the on-device transcription runtime", () => {
    const worker = readFileSync(path.join(root, "public/sw.js"), "utf8");
    expect(worker).toContain("const CACHE = 'skopein-shell-v35'");
    // Illustration paths carry no content hash, so they must not be served
    // cache-first: a returning visitor would keep seeing the artwork from the
    // build that first cached it.
    expect(worker).toContain("isIllustration");
    expect(worker).toContain("^\\/(module-art|module-pigs|artworks|art-guides)\\/");
    expect(worker).toContain("if (url.pathname.startsWith('/api/')) return");
    expect(worker.indexOf("url.pathname.startsWith('/api/')")).toBeLessThan(worker.indexOf("request.mode === 'navigate'"));
    // Whisper model shards + ONNX WASM exceed the iOS Cache API quota; a failed
    // cache.put used to reject the whole transcription fetch. They must bypass
    // the cache entirely. Optional/runtime writes are quota-safe, while the
    // three required document/bundle writes may abort a broken installation.
    expect(worker).toContain("NEVER_CACHE");
    expect(worker).toContain("^\\/(models|ort)\\/");
    expect(worker.indexOf("NEVER_CACHE.test(url.pathname)")).toBeLessThan(worker.indexOf("request.mode === 'navigate'"));
    expect((worker.match(/await cache\.put\(/g) || []).length).toBe(4); // safePut + required HTML / root / bundle writes
    expect((worker.match(/safePut\(/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(worker).toContain("isExpectedAssetResponse");
  });
});
