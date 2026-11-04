import { describe, expect, it, vi } from "vitest";
import { createOAuthUrl, resolveOAuthConfig } from "./oauth";

describe("OAuth public configuration", () => {
  it("keeps the original build-time OAuth flow when both values are present", async () => {
    const fetcher = vi.fn();
    const config = await resolveOAuthConfig(
      { appId: "build-app", kimiAuthUrl: "https://auth.example.test" },
      fetcher as unknown as typeof fetch,
    );
    expect(config).toEqual({
      appId: "build-app",
      kimiAuthUrl: "https://auth.example.test",
    });
    expect(fetcher).not.toHaveBeenCalled();

    const url = new URL(createOAuthUrl(config, "https://atelier.example.test"));
    expect(url.origin).toBe("https://auth.example.test");
    expect(url.pathname).toBe("/api/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("build-app");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://atelier.example.test/api/oauth/callback",
    );
    expect(atob(url.searchParams.get("state")!)).toBe(
      "https://atelier.example.test/api/oauth/callback",
    );
  });

  it("loads only public runtime values when a credential-free image has no Vite config", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          configured: true,
          appId: "runtime-app",
          kimiAuthUrl: "https://auth.example.test",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(
      resolveOAuthConfig({}, fetcher as unknown as typeof fetch),
    ).resolves.toEqual({
      appId: "runtime-app",
      kimiAuthUrl: "https://auth.example.test",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/oauth/config", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  });

  it("fails honestly instead of constructing an undefined OAuth URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ configured: false, appId: null, kimiAuthUrl: null }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(
      resolveOAuthConfig({}, fetcher as unknown as typeof fetch),
    ).rejects.toThrow("not configured");
  });

  it("rejects malformed or unavailable runtime configuration", async () => {
    const unavailable = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      resolveOAuthConfig({}, unavailable as unknown as typeof fetch),
    ).rejects.toThrow("unavailable");

    const malformed = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ appId: "app", kimiAuthUrl: "not a URL" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      resolveOAuthConfig({}, malformed as unknown as typeof fetch),
    ).rejects.toThrow();
  });
});
