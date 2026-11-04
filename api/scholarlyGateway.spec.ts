import { describe, expect, it, vi } from "vitest";
import { ScholarlyGateway, type ScholarlyGatewayOptions } from "./scholarlyGateway";

function jsonResponse(value: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function gateway(options: ScholarlyGatewayOptions = {}): ScholarlyGateway {
  return new ScholarlyGateway({
    cacheTtlMs: 0,
    random: () => 0.5,
    ...options,
    policies: {
      OpenAlex: { minIntervalMs: 0, baseDelayMs: 0, maxDelayMs: 0, ...options.policies?.OpenAlex },
      Crossref: { minIntervalMs: 0, baseDelayMs: 0, maxDelayMs: 0, ...options.policies?.Crossref },
    },
  });
}

const openAlexUrl = () => new URL("https://api.openalex.org/works?search=evidence");
const crossrefUrl = () => new URL("https://api.crossref.org/works?query.bibliographic=evidence");
const identity = <T>(value: unknown): T => value as T;

 describe("scholarly gateway resilience", () => {
  it("coalesces identical concurrent requests and caches only validated success", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const client = gateway({ fetcher: fetcher as unknown as typeof fetch, cacheTtlMs: 60_000 });
    const first = client.fetchJson("OpenAlex", openAlexUrl(), identity);
    const second = client.fetchJson("OpenAlex", openAlexUrl(), identity);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch?.(jsonResponse({ results: [{ id: "real" }] }));
    await expect(first).resolves.toEqual({ results: [{ id: "real" }] });
    await expect(second).resolves.toEqual({ results: [{ id: "real" }] });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).resolves.toEqual({ results: [{ id: "real" }] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited request once with bounded backoff", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const client = gateway({ fetcher: fetcher as unknown as typeof fetch });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).resolves.toEqual({ results: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries a transient network error but not a permanent HTTP error", async () => {
    const transient = vi.fn()
      .mockRejectedValueOnce(new TypeError("socket closed"))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const client = gateway({ fetcher: transient as unknown as typeof fetch });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).resolves.toEqual({ results: [] });
    expect(transient).toHaveBeenCalledTimes(2);

    const permanent = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    const other = gateway({ fetcher: permanent as unknown as typeof fetch });
    await expect(other.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "HTTP_ERROR", status: 404 });
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it("does not wait through a long Retry-After or retry an exhausted daily budget", async () => {
    const longWait = vi.fn().mockResolvedValue(new Response("limited", { status: 429, headers: { "Retry-After": "30" } }));
    const client = gateway({ fetcher: longWait as unknown as typeof fetch });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ status: 429 });
    expect(longWait).toHaveBeenCalledTimes(1);

    const exhausted = vi.fn().mockResolvedValue(new Response("limited", { status: 429, headers: { "X-RateLimit-Remaining": "0" } }));
    const other = gateway({ fetcher: exhausted as unknown as typeof fetch });
    await expect(other.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ status: 429, retryable: false });
    expect(exhausted).toHaveBeenCalledTimes(1);
  });

  it("opens the circuit after repeated failures and admits one successful half-open probe", async () => {
    let now = 1_000;
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response("down", { status: 503 })));
    const client = gateway({
      now: () => now,
      fetcher: fetcher as unknown as typeof fetch,
      policies: { OpenAlex: { maxAttempts: 1, failureThreshold: 2, cooldownMs: 1_000 } },
    });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "HTTP_ERROR" });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "HTTP_ERROR" });
    expect(client.getSafetySnapshot().providers.OpenAlex.circuitOpen).toBe(true);
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    expect(fetcher).toHaveBeenCalledTimes(2);

    now += 1_001;
    fetcher.mockResolvedValueOnce(jsonResponse({ results: [] }));
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).resolves.toEqual({ results: [] });
    expect(client.getSafetySnapshot().providers.OpenAlex.circuitOpen).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects HTML, oversized responses, and invalid payload shapes", async () => {
    const html = vi.fn().mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));
    const client = gateway({ fetcher: html as unknown as typeof fetch });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "INVALID_CONTENT_TYPE" });
    expect(html).toHaveBeenCalledTimes(1);

    const large = vi.fn().mockResolvedValue(jsonResponse({}, { "Content-Length": "2000001" }));
    const other = gateway({ fetcher: large as unknown as typeof fetch });
    await expect(other.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });

    const wrongShape = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }));
    const third = gateway({ fetcher: wrongShape as unknown as typeof fetch });
    await expect(third.fetchJson("OpenAlex", openAlexUrl(), () => { throw new Error("wrong shape"); }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE_SHAPE" });
  });

  it("recovers bounded official JSON with a BOM or generic content type", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("\uFEFF{\"results\":[]}", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }));
    const client = gateway({ fetcher: fetcher as unknown as typeof fetch });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).resolves.toEqual({ results: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("enforces the byte cap while streaming when Content-Length is absent", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(`{"value":"${"x".repeat(100)}"}`, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const client = gateway({ fetcher: fetcher as unknown as typeof fetch, maxResponseBytes: 20 });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("adapts Crossref pacing from its advertised rate-limit headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ message: { items: [] } }, {
      "X-Rate-Limit-Limit": "2",
      "X-Rate-Limit-Interval": "1s",
    }));
    const client = gateway({ fetcher: fetcher as unknown as typeof fetch });
    await client.fetchJson("Crossref", crossrefUrl(), identity);
    expect(client.getSafetySnapshot().providers.Crossref.minIntervalMs).toBe(500);
  });

  it("serves only validated stale success with an explicit snapshot timestamp", async () => {
    let now = 1_000;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: "cached" }] }))
      .mockImplementation(() => Promise.resolve(new Response("down", { status: 503 })));
    const client = gateway({
      now: () => now,
      fetcher: fetcher as unknown as typeof fetch,
      cacheTtlMs: 100,
      staleTtlMs: 1_000,
      policies: { OpenAlex: { maxAttempts: 1 } },
    });
    const live = await client.fetchJsonWithMeta("OpenAlex", openAlexUrl(), identity, { allowStale: true });
    expect(live).toMatchObject({ retrieval: "network", retrievedAt: 1_000 });

    now = 1_050;
    const fresh = await client.fetchJsonWithMeta("OpenAlex", openAlexUrl(), identity, { allowStale: true });
    expect(fresh).toMatchObject({ retrieval: "cache", retrievedAt: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    now = 1_101;
    const stale = await client.fetchJsonWithMeta("OpenAlex", openAlexUrl(), identity, { allowStale: true });
    expect(stale).toMatchObject({ retrieval: "stale-cache", retrievedAt: 1_000, value: { results: [{ id: "cached" }] } });
    expect(fetcher).toHaveBeenCalledTimes(2);

    now = 3_000;
    await expect(client.fetchJsonWithMeta("OpenAlex", openAlexUrl(), identity, { allowStale: true }))
      .rejects.toMatchObject({ code: "HTTP_ERROR" });
  });

  it("detects access challenges, refuses retries, and pauses instead of bypassing them", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>Verify you are human</html>", {
      status: 403,
      headers: { "Content-Type": "text/html", "CF-Mitigated": "challenge" },
    }));
    const client = gateway({ fetcher: fetcher as unknown as typeof fetch });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({
      code: "ACCESS_CHALLENGE",
      retryable: false,
      accessSignal: { kind: "challenge", status: 403 },
    });
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "ACCESS_PAUSED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.getSafetySnapshot().providers.OpenAlex.accessSignal).toBe("challenge");
  });

  it("refuses untrusted hosts and never caches a failed request as an empty result", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("down", { status: 503 }));
    const client = gateway({
      fetcher: fetcher as unknown as typeof fetch,
      cacheTtlMs: 60_000,
      policies: { OpenAlex: { maxAttempts: 1 } },
    });
    await expect(client.fetchJson("OpenAlex", new URL("https://untrusted.example/works"), identity))
      .rejects.toMatchObject({ code: "UNTRUSTED_URL" });
    expect(fetcher).not.toHaveBeenCalled();

    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).rejects.toMatchObject({ code: "HTTP_ERROR" });
    fetcher.mockResolvedValueOnce(jsonResponse({ results: [] }));
    await expect(client.fetchJson("OpenAlex", openAlexUrl(), identity)).resolves.toEqual({ results: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
