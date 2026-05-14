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
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`, {
      redirect: "manual", // Don't follow redirects — we handle them manually
    })
      .then((res) => {
        if (res.status === 302) {
          // Success — redirect to home (the Set-Cookie header is in the response)
          const setCookie = res.headers.get("Set-Cookie");
          if (setCookie) {
            document.cookie = setCookie;
          }
          setStatus("success");
          window.location.href = "/";
          return;
        }
        if (res.ok) {
          setStatus("success");
          window.location.href = "/";
          return;
        }
        return res.json().then((data) => {
          setStatus("error");
          setError((data as any).error || "Verification failed");
        });
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