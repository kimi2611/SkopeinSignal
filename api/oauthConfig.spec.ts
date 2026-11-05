import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { env } from "./lib/env";
import { oauthConfigRoutes } from "./routes/oauthConfig";

describe("runtime OAuth public configuration", () => {
  it("returns only browser-safe config and never the application secret", async () => {
    const app = new Hono();
    app.route("/api/oauth/config", oauthConfigRoutes);
    const response = await app.request("/api/oauth/config");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toEqual({
      configured: Boolean(env.appId && env.kimiAuthUrl),
      appId: env.appId && env.kimiAuthUrl ? env.appId : null,
      kimiAuthUrl: env.appId && env.kimiAuthUrl ? env.kimiAuthUrl : null,
    });
    expect(Object.keys(payload).sort()).toEqual([
      "appId",
      "configured",
      "kimiAuthUrl",
    ]);
    expect(payload).not.toHaveProperty("appSecret");
    if (env.appSecret) {
      expect(JSON.stringify(payload)).not.toContain(env.appSecret);
    }
  });
});
