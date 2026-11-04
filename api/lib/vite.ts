import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  app.use("*", async (c, next) => {
    await next();
    // HTML and the worker are deployment pointers, not immutable assets. Never
    // let a browser or preview proxy pin them after a new bundle is saved.
    if (c.req.path === "/" || c.req.path.endsWith(".html") || c.req.path === "/sw.js") {
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  });

  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
