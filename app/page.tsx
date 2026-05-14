"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">Origen</span>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/chat" className="text-sm px-4 py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition-colors">
              Start chatting
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="mx-auto max-w-2xl text-center space-y-8 py-20">
          <div className="space-y-4">
            <p className="text-sm font-medium text-primary uppercase tracking-wide">Powered by sovereign AI agents</p>
            <h1 className="text-5xl font-bold tracking-tight">
              Chat with any<br />AI model
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Free models included. Bring your own API key for premium models. No vendor lock-in.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Link href="/chat" className="px-6 py-3 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-colors">
              Try it free
            </Link>
            <Link href="/auth/login" className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors">
              Sign in
            </Link>
          </div>

          {/* Free models */}
          <div className="pt-8">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Free models — no account needed</p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {["DeepSeek V3", "DeepSeek R1", "Gemini 2.0 Flash"].map((m) => (
                <span key={m} className="text-sm px-3 py-1 rounded-full border border-border text-muted-foreground">
                  {m} ✓
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between text-xs text-muted-foreground">
          <span>Built by <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">Moikapy</a></span>
          <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">moikapy.dev</a>
        </div>
      </footer>
    </div>
  );
}