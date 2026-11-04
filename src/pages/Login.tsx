import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createOAuthUrl, resolveOAuthConfig } from "@/lib/oauth";

export default function Login() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const config = await resolveOAuthConfig({
        appId: import.meta.env.VITE_APP_ID,
        kimiAuthUrl: import.meta.env.VITE_KIMI_AUTH_URL,
      });
      window.location.assign(createOAuthUrl(config, window.location.origin));
    } catch {
      setPending(false);
      setError(
        "Kimi sign-in is not configured for this deployment. You can still use the browser-local workspace.",
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            size="lg"
            disabled={pending}
            onClick={signIn}
          >
            {pending ? "Opening Kimi…" : "Sign in with Kimi"}
          </Button>
          {error ? (
            <p className="mt-3 text-sm text-muted-foreground" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
