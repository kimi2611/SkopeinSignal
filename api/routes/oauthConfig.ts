import { Hono } from "hono";
import { env } from "../lib/env";

// These two values are already browser-visible when Vite embeds them in the
// login bundle. Serving them at runtime keeps OAuth working when a container
// is deliberately built without the platform's private .env file. No secret
// or session material is exposed by this route.
export const oauthConfigRoutes = new Hono();

oauthConfigRoutes.get("/", (c) => {
  const configured = Boolean(env.appId && env.kimiAuthUrl);
  c.header("Cache-Control", "no-store");
  return c.json({
    configured,
    appId: configured ? env.appId : null,
    kimiAuthUrl: configured ? env.kimiAuthUrl : null,
  });
});
