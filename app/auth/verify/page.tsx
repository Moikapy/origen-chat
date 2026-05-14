"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function VerifyPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setError("No sign-in link found. Please request a new one.");
      return;
    }

    // Strip token from URL for security
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.pathname);

    // Verify the token via the API route
    fetch(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.redirected) {
          // Server redirected us home — success
          setStatus("success");
          window.location.href = "/";
        } else if (res.ok) {
          setStatus("success");
          setTimeout(() => { window.location.href = "/"; }, 1000);
        } else {
          return res.json().then((data) => {
            setStatus("error");
            setError((data as any).error || "Verification failed");
          });
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Network error. Please try again.");
      });
  }, []);

  if (status === "success") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-primary">Signed in! Redirecting…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-destructive">{error}</p>
          <Link href="/auth/login" className="text-primary hover:underline text-sm">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse h-2 w-2 rounded-full bg-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}