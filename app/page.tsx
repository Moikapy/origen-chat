"use client";

import Link from "next/link";

const MODELS = [
  { name: "DeepSeek V3", tier: "free" },
  { name: "DeepSeek R1", tier: "free" },
  { name: "Gemini 2.0 Flash", tier: "free" },
  { name: "Claude Sonnet 4", tier: "premium" },
  { name: "Claude Opus 4", tier: "premium" },
  { name: "GPT-4o", tier: "premium" },
  { name: "GPT-4.1 Mini", tier: "premium" },
  { name: "O3 Mini", tier: "premium" },
  { name: "Gemini 2.5 Pro", tier: "premium" },
  { name: "Llama 4 Maverick", tier: "premium" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
            Origen
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link
              href="/chat"
              className="text-sm px-4 py-2 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
            >
              Start free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            3 free models — no account needed
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            One chat.<br />
            <span className="text-muted-foreground">Every model.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-10">
            Chat with DeepSeek, Gemini, Claude, GPT, and Llama — all in one place.
            Free models included. No vendor lock-in.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/chat"
              className="px-6 py-3 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity text-sm"
            >
              Try it free →
            </Link>
            <Link
              href="/auth/login"
              className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors text-sm"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Subtle gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Models grid */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-3">Models</h2>
            <p className="text-muted-foreground">Free models work without an account. Premium models need an API key.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {MODELS.map((m) => (
              <div
                key={m.name}
                className={`rounded-lg border px-4 py-3 text-center text-sm transition-colors ${
                  m.tier === "free"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <div className="font-medium">{m.name}</div>
                <div className="text-xs mt-1 opacity-75">
                  {m.tier === "free" ? "✓ Free" : "Premium"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-3">Built different</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                icon: "🔒",
                title: "Private by default",
                desc: "No data selling. No tracking. Your conversations stay yours. Open‑source agent core.",
              },
              {
                icon: "⚡",
                title: "Zero config for free",
                desc: "Start chatting instantly with free models. No sign-up required. Add your own keys for more.",
              },
              {
                icon: "🔄",
                title: "No lock-in",
                desc: "Bring your own OpenRouter or Ollama keys. Swap providers anytime. Your data, your choice.",
              },
            ].map((f) => (
              <div key={f.title} className="space-y-3">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">Start chatting now</h2>
          <p className="text-muted-foreground mb-8">No account needed for free models.</p>
          <Link
            href="/chat"
            className="inline-block px-8 py-3 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
          >
            Open chat →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>Built by <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">Moikapy</a></span>
          <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">moikapy.dev</a>
        </div>
      </footer>
    </div>
  );
}