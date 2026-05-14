"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setError("No authorization code found");
      return;
    }

    // Exchange code for API key
    fetch("/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Auth exchange failed");
        return res.json();
      })
      .then(() => {
        router.push("/");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Auth failed");
      });
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Authentication failed: {error}</p>
          <a href="/" className="text-primary hover:underline">Go home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse h-2 w-2 rounded-full bg-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Connecting to OpenRouter...</p>
      </div>
    </div>
  );
}