"use client";

import Link from "next/link";
import { useModels } from "@/lib/use-models";

export default function LandingPage() {
  const { models, loading } = useModels();

  const freeModels = models.filter((m) => m.free);
  const premiumModels = models.filter((m) => !m.free);

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
            {freeModels.length} free models — no account needed
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            One chat.<br />
            <span className="text-muted-foreground">Every model.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-10">
            Chat with DeepSeek, Gemini, Claude, GPT, Llama, Grok and more — all in one place.
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

      {/* Models grid — dynamic from OpenRouter API */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-3">Models</h2>
            <p className="text-muted-foreground">Free models work without an account. Premium models need an API key.</p>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading models…</div>
          ) : (
            <>
              {freeModels.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-medium text-primary mb-3">Free</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {freeModels.map((m) => (
                      <div key={m.id} className="rounded-lg border border-primary/30 bg-primary/10 text-primary px-3 py-2.5 text-left text-sm">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs mt-0.5 opacity-75">✓ Free</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {premiumModels.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Premium</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {premiumModels.map((m) => (
                      <div key={m.id} className="rounded-lg border border-border bg-card text-muted-foreground px-3 py-2.5 text-left text-sm">
                        <div className="font-medium text-foreground">{m.name}</div>
                        <div className="text-xs mt-0.5 opacity-75">
                          {m.pricing ? `${m.pricing.prompt}/${m.pricing.completion}` : "Premium"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
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