export type OAuthPublicConfig = {
  appId: string;
  kimiAuthUrl: string;
};

type BuildOAuthConfig = {
  appId?: string;
  kimiAuthUrl?: string;
};

type Fetcher = typeof fetch;

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function createOAuthUrl(
  config: OAuthPublicConfig,
  origin: string,
): string {
  const redirectUri = `${origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${config.kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function resolveOAuthConfig(
  buildConfig: BuildOAuthConfig,
  fetcher: Fetcher = fetch,
): Promise<OAuthPublicConfig> {
  if (nonempty(buildConfig.appId) && nonempty(buildConfig.kimiAuthUrl)) {
    return {
      appId: buildConfig.appId,
      kimiAuthUrl: buildConfig.kimiAuthUrl,
    };
  }

  const response = await fetcher("/api/oauth/config", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error("Kimi sign-in configuration is unavailable");
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new Error("Kimi sign-in is not configured on this server");
  }
  const config = payload as Record<string, unknown>;
  if (!nonempty(config.appId) || !nonempty(config.kimiAuthUrl)) {
    throw new Error("Kimi sign-in is not configured on this server");
  }

  // Validate before leaving the page so malformed runtime configuration cannot
  // produce a misleading navigation error.
  const resolved = {
    appId: config.appId,
    kimiAuthUrl: config.kimiAuthUrl,
  };
  createOAuthUrl(resolved, "http://localhost:3000");
  return resolved;
}
