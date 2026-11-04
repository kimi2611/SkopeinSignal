import "dotenv/config";

// Missing variables must not kill the process: the site still serves every
// local feature without them, and the dependent routes (OAuth, sync, AI)
// degrade to their own honest "not configured" errors. Warn loudly instead —
// in production the platform injects all of these, so a warning there means
// a provisioning problem worth reading.
const missing: string[] = [];

function required(name: string): string {
  const value = process.env[name];
  if (!value) missing.push(name);
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
};

if (missing.length) {
  console.warn(
    `[env] Missing environment variables: ${missing.join(", ")} — ` +
      "login, cloud sync and AI features stay disabled until they are provided.",
  );
}
