import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:")) {
    return true;
  }
  // 自托管内网信任：tailnet (100.64.0.0/10)、Tailscale MagicDNS (*.ts.net) 和
  // RFC1918 私网入口都走纯 http，浏览器会拒收 Secure cookie——把这些当作本地
  // 场景处理（SameSite=Lax、不标 Secure）。公网域名入口仍走严格 Secure 策略。
  const hostname = host.replace(/:\d+$/, "");
  if (hostname.endsWith(".ts.net")) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(hostname)) return true;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return true;
  return false;
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);

  return {
    httpOnly: true,
    path: "/",
    sameSite: localhost ? "Lax" : "None",
    secure: !localhost,
  };
}
