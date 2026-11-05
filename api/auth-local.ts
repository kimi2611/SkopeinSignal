import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import * as cookie from "cookie";
import bcrypt from "bcryptjs";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";
import { Session } from "@contracts/constants";
import { signSessionToken } from "./kimi/session";
import { findUserByUnionId, updateUserName, updateUserPassword, upsertUser } from "./queries/users";
import { verifySessionToken } from "./kimi/session";
import { sessionVersionFor, validateNewPassword } from "./lib/password";
import { log } from "./lib/logger";

// 本地账号密码登录（自托管改造，A 案）。
// 与 Kimi OAuth 并行存在：users.unionId 约定 `local:{email}`，与 OAuth 账号
// 天然隔离；session 签发复用原有 HS256 JWT 体系（密钥 = APP_SECRET）。
// OWNER_UNION_ID 匹配 local:{email} 时 upsertUser 自动授予 admin。

const unionFor = (email: string) => `local:${email.toLowerCase()}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 简单内存限流：每 IP 10 分钟最多 20 次尝试（单实例自托管足够）。
const attempts = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.reset) {
    attempts.set(ip, { n: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  rec.n += 1;
  if (attempts.size > 10_000) attempts.clear(); // 防内存膨胀
  return rec.n > 20;
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// 显示名校验：收紧到 50 字符（register 的 name 上限是 64），首尾空白剔除、
// 内部连续空白折叠成单空格，避免页面抬头出现不可见字符。
export function validateDisplayName(raw: unknown):
  | { ok: true; name: string }
  | { ok: false; error: string } {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Name must not be empty." };
  if (name.length > 50) return { ok: false, error: "Name must be 50 characters or fewer." };
  return { ok: true, name };
}

export const localAuthRoutes = new Hono();

localAuthRoutes.post("/register", async (c) => {
  if (rateLimited(clientIp(c))) {
    return c.json({ error: "Too many attempts. Try again later." }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim().slice(0, 64);
  if (!EMAIL_RE.test(email)) return c.json({ error: "Invalid email address." }, 400);
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters." }, 400);
  }
  if (!env.appSecret) {
    return c.json({ error: "Server auth is not configured." }, 500);
  }

  const unionId = unionFor(email);
  if (await findUserByUnionId(unionId)) {
    return c.json({ error: "An account with this email already exists." }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // upsertUser 内部处理 OWNER_UNION_ID → admin 授予
  await upsertUser({
    unionId,
    email,
    name: name || email.split("@")[0],
    passwordHash,
    lastSignInAt: new Date(),
  });
  const user = await findUserByUnionId(unionId);

  const token = await signSessionToken({
    unionId,
    clientId: env.appId || "skopein-local",
    sv: sessionVersionFor(user?.passwordHash) ?? undefined,
  });
  const opts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, token, { ...opts, maxAge: Session.maxAgeMs / 1000 });
  log.info("local auth: registered", { email });
  return c.json({ ok: true, user: { id: user?.id, email: user?.email, name: user?.name, role: user?.role } });
});

localAuthRoutes.post("/login", async (c) => {
  if (rateLimited(clientIp(c))) {
    return c.json({ error: "Too many attempts. Try again later." }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!email || !password) return c.json({ error: "Email and password are required." }, 400);

  const user = await findUserByUnionId(unionFor(email));
  const ok = user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) {
    return c.json({ error: "Invalid email or password." }, 401);
  }

  await upsertUser({ unionId: user.unionId, lastSignInAt: new Date() });
  const token = await signSessionToken({
    unionId: user.unionId,
    clientId: env.appId || "skopein-local",
    sv: sessionVersionFor(user.passwordHash) ?? undefined,
  });
  const opts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, token, { ...opts, maxAge: Session.maxAgeMs / 1000 });
  log.info("local auth: login", { email });
  return c.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

localAuthRoutes.post("/logout", (c) => {
  const opts = getSessionCookieOptions(c.req.raw.headers);
  c.header(
    "set-cookie",
    cookie.serialize(Session.cookieName, "", {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: 0,
    }),
  );
  return c.json({ ok: true });
});

// 修改显示名：仅登录用户可改自己的（session JWT 解析出 unionId），
// 返回结构与 login/register 一致的脱敏 user，前端 refresh auth.me 即全站生效。
localAuthRoutes.patch("/profile", async (c) => {
  if (rateLimited(clientIp(c))) {
    return c.json({ error: "Too many attempts. Try again later." }, 429);
  }
  const token = cookie.parse(c.req.raw.headers.get("cookie") ?? "")[Session.cookieName];
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return c.json({ error: "Not signed in." }, 401);

  const body = await c.req.json().catch(() => null);
  const checked = validateDisplayName(body?.name);
  if (!checked.ok) return c.json({ error: checked.error }, 400);

  const user = await findUserByUnionId(session.unionId);
  if (!user) return c.json({ error: "Account not found." }, 404);
  if (session.sv && user.passwordHash && session.sv !== sessionVersionFor(user.passwordHash)) {
    return c.json({ error: "Session expired. Please sign in again.", code: "not_signed_in" }, 401);
  }

  await updateUserName(user.unionId, checked.name);
  const updated = await findUserByUnionId(user.unionId);
  log.info("local auth: display name updated", { email: user.email });
  return c.json({
    ok: true,
    user: { id: updated?.id, email: updated?.email, name: updated?.name, role: updated?.role },
  });
});

// 修改密码：旧密码验证 → 规则校验 → 换 hash → 清当前 cookie。
// 换 hash 后所有旧 session 的 sv 失配（2026-11-05 起签发的 token 都带 sv），
// 因此"全部设备退出登录"不需要会话表。
localAuthRoutes.post("/password", async (c) => {
  if (rateLimited(clientIp(c))) {
    return c.json({ error: "Too many attempts. Try again later.", code: "rate_limited" }, 429);
  }
  const token = cookie.parse(c.req.raw.headers.get("cookie") ?? "")[Session.cookieName];
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return c.json({ error: "Not signed in.", code: "not_signed_in" }, 401);

  const body = await c.req.json().catch(() => null);
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");

  const user = await findUserByUnionId(session.unionId);
  if (!user) return c.json({ error: "Account not found.", code: "not_signed_in" }, 404);
  if (session.sv && user.passwordHash && session.sv !== sessionVersionFor(user.passwordHash)) {
    return c.json({ error: "Session expired. Please sign in again.", code: "not_signed_in" }, 401);
  }
  if (!user.passwordHash) {
    return c.json({ error: "This account has no local password.", code: "no_password" }, 400);
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    return c.json({ error: "Current password is incorrect.", code: "wrong_current" }, 401);
  }

  const checked = validateNewPassword(currentPassword, newPassword);
  if (!checked.ok) {
    const messages: Record<string, string> = {
      missing_current: "Current password is required.",
      too_short: "New password must be at least 8 characters.",
      too_long: "New password must be 200 characters or fewer.",
      same_as_current: "New password must differ from the current one.",
      no_password: "This account has no local password.",
    };
    return c.json({ error: messages[checked.code] ?? "Invalid new password.", code: checked.code }, 400);
  }

  await updateUserPassword(user.unionId, await bcrypt.hash(newPassword, 10));
  log.info("local auth: password changed", { email: user.email });

  // 当前这台设备也退出：cookie 立刻清掉，前端跳登录页。
  const opts = getSessionCookieOptions(c.req.raw.headers);
  c.header(
    "set-cookie",
    cookie.serialize(Session.cookieName, "", {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: 0,
    }),
  );
  return c.json({ ok: true });
});
