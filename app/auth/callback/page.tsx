"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCodeVerifier, clearOAuthState } from "@moikapy/openrouter-auth";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"exchanging" | "done">("exchanging");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setError("No authorization code received from OpenRouter.");
      return;
    }

    // Get the code_verifier stored by startOAuth()
    const codeVerifier = getCodeVerifier();

    fetch("/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: codeVerifier ?? "" }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error || "Exchange failed");
        }
        return res.json();
      })
      .then(() => {
        clearOAuthState();
        setStatus("done");
        // Redirect to chat
        router.push("/chat");
      })
      .catch((err) => {
        clearOAuthState();
        setError(err instanceof Error ? err.message : "Failed to connect OpenRouter");
      });
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold mb-2">Connection Failed</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <a
            href="/chat"
            className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Back to Chat
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-muted-foreground">
          {status === "exchanging"
            ? "Connecting to OpenRouter..."
            : "Connected! Redirecting..."}
        </p>
      </div>
    </div>
  );
}