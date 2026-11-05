import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";

export const authRouter = createRouter({
  // 只暴露安全字段：ctx.user 是完整 users 行，本地账号改造后含 passwordHash，
  // 原样返回会把密码哈希泄给浏览器。
  //
  // 未登录返回 null 而不是 UNAUTHORIZED：这个方法在每个页面加载时都会调用一
  // 次，401 会让浏览器控制台每次都记一条红色失败请求，而"没登录"是正常状态，
  // 不是异常。调用方（useAuth）本来就是按 `!user` 判断未登录的。
  me: publicQuery.query((opts) => {
    if (!opts.ctx.user) return null;
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
