import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanCrossrefAbstract,
  evidenceCaveats,
  mergeScholarlyResources,
  normalizeDoi,
  parseCrossrefResponse,
  parseOpenAlexResponse,
  reconstructOpenAlexAbstract,
  resourcesRouter,
  searchScholarlyResources,
  searchScholarlyResourcesDetailed,
} from "./resourcesRouter";
import { ScholarlyGateway } from "./scholarlyGateway";

function testGateway(): ScholarlyGateway {
  return new ScholarlyGateway({
    cacheTtlMs: 0,
    random: () => 0.5,
    policies: {
      OpenAlex: { minIntervalMs: 0, baseDelayMs: 0, maxDelayMs: 0 },
      Crossref: { minIntervalMs: 0, baseDelayMs: 0, maxDelayMs: 0 },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scholarly evidence normalisation", () => {
  it("reconstructs OpenAlex abstracts by word position and bounds the result", () => {
    expect(reconstructOpenAlexAbstract({ quiet: [0, 3], cities: [1], are: [2] })).toBe("quiet cities are quiet");
    expect(reconstructOpenAlexAbstract(null)).toBe("");
    expect(reconstructOpenAlexAbstract({ word: [-1, 1.5] })).toBe("");
  });

  it("turns Crossref JATS abstracts into readable plain text", () => {
    expect(cleanCrossrefAbstract("<jats:p>Quiet &amp; <jats:bold>slow</jats:bold> cities</jats:p>"))
      .toBe("Quiet & slow cities");
    expect(cleanCrossrefAbstract(undefined)).toBe("");
  });

  it("derives evidence caveats from the actual comparison scopes", () => {
    expect(evidenceCaveats("English", ["abstract", "metadata", "metadata", "metadata", "abstract"])[0])
      .toContain("3 of 5 comparisons");
    expect(evidenceCaveats("Chinese", ["metadata", "abstract"])[0]).toContain("2 条比较中有 1 条");
    expect(evidenceCaveats("Deutsch", ["metadata", "metadata"])[0]).toContain("2 von 2 Vergleichen");
    expect(evidenceCaveats("English", ["abstract"])).toHaveLength(1);
    const caveats = evidenceCaveats("Chinese", ["abstract"], {
      staleCount: 1,
      singleSourceCount: 2,
      conflictCount: 1,
      unavailableSources: ["Crossref"],
    });
    expect(caveats.join("\n")).toContain("限时缓存快照");
    expect(caveats.join("\n")).toContain("Crossref 本次不可用");
    expect(caveats.join("\n")).toContain("跨源差异");
    expect(caveats.join("\n")).toContain("不等于论文结论已被证实");
  });

  it("uses real OpenAlex metadata when the primary index responds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{
      id: "https://openalex.org/W1",
      display_name: "A real paper",
      publication_year: 2024,
      authorships: [{ author: { display_name: "A. Researcher" } }],
      primary_location: { landing_page_url: "https://example.test/paper", source: { display_name: "Journal" } },
      abstract_inverted_index: { Evidence: [0], matters: [1] },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const resources = await searchScholarlyResources("real evidence", testGateway());
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ database: "OpenAlex", title: "A real paper", abstract: "Evidence matters" });
  });

  it("skips malformed OpenAlex records and rejects insecure links without losing valid records", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      {
        id: "https://openalex.org/W-VALID-1",
        display_name: "Valid record with unsafe links",
        doi: "http://doi.org/10.1000/unsafe",
        primary_location: { landing_page_url: "javascript:alert(1)" },
      },
      { id: 42, display_name: ["Malformed record"] },
      {
        id: "https://openalex.org/W-VALID-2",
        display_name: "Second valid record",
        primary_location: { landing_page_url: "https://example.test/valid" },
      },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const resources = await searchScholarlyResources("mixed record quality", testGateway());
    expect(resources).toHaveLength(2);
    expect(resources.map((resource) => resource.title)).toEqual([
      "Valid record with unsafe links",
      "Second valid record",
    ]);
    expect(resources[0]).toMatchObject({
      url: "https://doi.org/10.1000/unsafe",
      doi: "https://doi.org/10.1000/unsafe",
    });
    expect(resources[1].url).toBe("https://example.test/valid");
  });

  it("falls back to Crossref when OpenAlex is rate-limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL | Request) => {
      const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
      if (host === "api.openalex.org") return Promise.resolve(new Response("limited", { status: 429 }));
      return Promise.resolve(new Response(JSON.stringify({ message: { items: [{
        DOI: "10.1000/real",
        title: ["Fallback paper"],
        published: { "date-parts": [[2023]] },
        abstract: "<jats:p>A useful abstract.</jats:p>",
      }] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }));
    const resources = await searchScholarlyResources("fallback evidence", testGateway());
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ database: "Crossref", doi: "https://doi.org/10.1000/real", abstract: "A useful abstract." });
  });

  it("drops invalid Crossref DOIs and replaces insecure record URLs with the canonical DOI", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { items: [
        { DOI: "not-a-doi", title: ["Invalid identifier"] },
        {
          DOI: "10.1000/valid",
          title: ["Valid Crossref record"],
          URL: "http://example.test/insecure",
        },
      ] } }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const resources = await searchScholarlyResources("identifier boundaries", testGateway());
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      title: "Valid Crossref record",
      url: "https://doi.org/10.1000/valid",
      doi: "https://doi.org/10.1000/valid",
    });
  });

  it("repairs optional OpenAlex fields without discarding an otherwise valid record", () => {
    const parsed = parseOpenAlexResponse({ results: [{
      id: "https://openalex.org/W-REPAIRED",
      display_name: "Structurally repaired",
      publication_year: "2024",
      authorships: [null, { author: { name: "A. Researcher" } }, { author: { display_name: 42 } }],
      primary_location: { landing_page_url: 42, source: { display_name: "Journal" } },
      abstract_inverted_index: { Evidence: [0, "2", -1], still: [1], invalid: { nope: true } },
    }] });
    expect(parsed.results[0]).toMatchObject({
      id: "https://openalex.org/W-REPAIRED",
      publication_year: 2024,
      authorships: [{ author: { display_name: "A. Researcher" } }],
      primary_location: { landing_page_url: undefined, source: { display_name: "Journal" } },
      abstract_inverted_index: { Evidence: [0, 2], still: [1] },
    });
  });

  it("normalizes common Crossref title, author and date-part variations", () => {
    const parsed = parseCrossrefResponse({ message: { items: [{
      DOI: "10.1000/repaired",
      title: "A string title",
      author: [{ name: "A. Researcher" }, null],
      published: { "date-parts": [["2024", "11", "4"]] },
      "container-title": "Journal",
    }] } });
    expect(parsed.message.items[0]).toMatchObject({
      title: ["A string title"],
      author: [{ name: "A. Researcher" }],
      published: { "date-parts": [[2024, 11, 4]] },
      "container-title": ["Journal"],
    });
    expect(parseCrossrefResponse({ message: { items: [{ DOI: "10.1000/x", title: ["Valid"] }] } }).message.items).toHaveLength(1);
    expect(() => parseCrossrefResponse({ message: { error: "wrong envelope" } })).toThrow();
  });

  it("canonicalizes DOI identifiers without accepting ambiguous resolver URLs", () => {
    expect(normalizeDoi("DOI: 10.1000/AbC.1")).toBe("https://doi.org/10.1000/abc.1");
    expect(normalizeDoi("https://dx.doi.org/10.1000/AbC.1")).toBe("https://doi.org/10.1000/abc.1");
    expect(normalizeDoi("http://doi.org/10.1000/upgraded")).toBe("https://doi.org/10.1000/upgraded");
    expect(normalizeDoi("https://doi.org/10.1000/valid?tracking=1")).toBeNull();
    expect(normalizeDoi("https://example.test/10.1000/wrong-host")).toBeNull();
  });

  it("merges matching DOIs, fills missing evidence, and flags bibliographic conflicts", () => {
    const checkedAt = "2026-01-02T03:04:05.000Z";
    const primary = [{
      id: "https://openalex.org/W1",
      title: "Café Learning & Memory: A Study",
      authors: [],
      year: 2024,
      venue: "OpenAlex record",
      url: "https://doi.org/10.1000/shared",
      doi: "https://doi.org/10.1000/shared",
      database: "OpenAlex" as const,
      abstract: "",
      provenance: [{ database: "OpenAlex" as const, retrieval: "network" as const, retrievedAt: checkedAt }],
    }];
    const secondary = [{
      id: "https://doi.org/10.1000/SHARED",
      title: "Cafe learning and memory a study",
      authors: ["A. Researcher"],
      year: 2024,
      venue: "Journal",
      url: "https://doi.org/10.1000/shared",
      doi: "https://doi.org/10.1000/shared",
      database: "Crossref" as const,
      abstract: "Abstract supplied by Crossref.",
      provenance: [{ database: "Crossref" as const, retrieval: "cache" as const, retrievedAt: checkedAt }],
    }];
    const merged = mergeScholarlyResources(primary, secondary, checkedAt);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      abstract: "Abstract supplied by Crossref.",
      authors: ["A. Researcher"],
      venue: "Journal",
      verification: { status: "cross-verified", sources: ["OpenAlex", "Crossref"], conflicts: [], checkedAt },
    });
    expect(merged[0].provenance).toHaveLength(2);

    const conflict = mergeScholarlyResources(primary, [{ ...secondary[0], title: "A different title", year: 2023 }], checkedAt);
    expect(conflict[0].verification).toMatchObject({ status: "metadata-conflict", conflicts: ["title", "year"] });
  });

  it("keeps usable results when only one index fails and reports the partial outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL | Request) => {
      const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
      if (host === "api.crossref.org") return Promise.resolve(new Response("down", { status: 503 }));
      return Promise.resolve(new Response(JSON.stringify({ results: [{
        id: "https://openalex.org/W-PARTIAL",
        display_name: "Partial but usable",
        doi: "https://doi.org/10.1000/partial",
      }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }));
    const result = await searchScholarlyResourcesDetailed("partial availability", testGateway());
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].verification).toMatchObject({ status: "single-source", sources: ["OpenAlex"] });
    expect(result.sourceOutcomes).toEqual([
      { database: "OpenAlex", status: "ok", recordCount: 1 },
      { database: "Crossref", status: "unavailable", recordCount: 0 },
    ]);
  });

  it("does not misreport one failed and one empty index as a genuine no-match result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL | Request) => {
      const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
      if (host === "api.crossref.org") return Promise.resolve(new Response("down", { status: 503 }));
      return Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }));
    await expect(searchScholarlyResourcesDetailed("uncertain availability", testGateway()))
      .rejects.toMatchObject({ message: "RESOURCE_SEARCH_UNAVAILABLE" });
  });

  it("reports an honest search outage when both live indexes fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(searchScholarlyResources("anything", testGateway())).rejects.toMatchObject({ message: "RESOURCE_SEARCH_UNAVAILABLE" });
  });
});

describe("resources access control", () => {
  it("rejects unauthenticated requests before AI or database work", async () => {
    const caller = resourcesRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(caller.compare({ language: "English", spark: "A testable idea." })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
