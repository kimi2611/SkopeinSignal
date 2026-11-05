import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 本地账号密码登录（自托管部署）。后端 /api/auth/local/{login,register}，
// 成功即种下 session cookie；失败展示服务端返回的错误信息。
// Kimi OAuth 若配置了仍可在服务端走原回调，本页只负责本地凭据入口。

type Mode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const resp = await fetch(`/api/auth/local/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        setError(data?.error ?? `Sign-in failed (${resp.status}).`);
        setPending(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setPending(false);
      setError("Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password (at least 8 characters)"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button className="w-full" size="lg" disabled={pending} onClick={submit}>
            {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login"
              ? "No account yet? Create one"
              : "Already have an account? Sign in"}
          </button>
          {error ? (
            <p className="text-sm text-muted-foreground" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground text-center">
            Your workspace syncs to this server once signed in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
