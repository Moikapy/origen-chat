"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface User {
  id: string;
  email: string;
  displayName: string | null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendEmail = useCallback(async (emailAddress: string) => {
    setStatus("sending");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddress.trim().toLowerCase() }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error || data.message || "Failed to send email"));
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="mx-auto max-w-sm px-4 py-8">
        <div className="text-center mb-8">
          <Link href="/" className="text-lg font-semibold hover:opacity-80 transition-opacity">Origen Chat</Link>
          <p className="text-muted-foreground mt-2">Sign in with your email to continue</p>
        </div>

        {status === "sent" ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">✉️</div>
            <p className="text-sm text-primary">Check your email for a sign-in link.</p>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be redirected automatically after signing in.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); if (email.trim()) sendEmail(email); }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="email" className="block text-sm mb-1">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                disabled={status === "sending"}
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending" || !email.trim()}
              className="w-full text-sm px-4 py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition-colors disabled:opacity-30"
            >
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </form>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          <Link href="/" className="hover:text-foreground transition-colors">← Back to chat</Link>
        </p>
      </div>
    </div>
  );
}