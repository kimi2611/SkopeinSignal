import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery } from "./middleware";

export const authRouter = createRouter({
  // 只暴露安全字段：ctx.user 是完整 users 行，本地账号改造后含 passwordHash，
  // 原样返回会把密码哈希泄给浏览器。
  me: authedQuery.query((opts) => {
    const { passwordHash: _ph, ...safeUser } = opts.ctx.user;
    return safeUser;
  }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
