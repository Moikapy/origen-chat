"use client";

import Link from "next/link";
import { useModels } from "@/lib/use-models";
import { SiteNav, SiteFooter } from "@/components/site-layout";

// Top-tier premium models to feature on landing page
const FEATURED_PREMIUM = [
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4",
  "anthropic/claude-sonnet-4",
  "openai/gpt-4.1",
  "openai/o4-mini",
  "google/gemini-2.5-pro",
  "x-ai/grok-4.3",
  "meta-llama/llama-4-maverick",
];

export default function LandingPage() {
  const { models, loading } = useModels();
  const freeModels = models.filter((m) => m.free);

  // Show featured premium models that exist in the live data
  const premiumModels = models.filter((m) => {
    if (m.free) return false;
    return FEATURED_PREMIUM.some((p) => m.id.endsWith("/" + p) || m.id === "openrouter/" + p);
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav variant="landing" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {loading ? "Loading…" : `${freeModels.length} free models — no account needed`}
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
              href="/models"
              className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors text-sm"
            >
              View all models
            </Link>
          </div>
        </div>

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Free models preview */}
      {!loading && freeModels.length > 0 && (
        <section className="border-t border-border/50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Free models</h2>
                <p className="text-muted-foreground text-sm mt-1">No account needed. No API key required.</p>
              </div>
              <span className="text-xs text-primary bg-primary/10 px-3 py-1 rounded-full font-medium">
                {freeModels.length} available
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {freeModels.slice(0, 8).map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-primary/30 bg-primary/10 text-primary px-3 py-2.5 text-sm"
                >
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs mt-0.5 opacity-75">✓ Free</div>
                </div>
              ))}
            </div>
            {freeModels.length > 8 && (
              <div className="mt-4 text-center">
                <Link href="/models" className="text-sm text-primary hover:underline">
                  + {freeModels.length - 8} more free models →
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Premium models preview */}
      {!loading && premiumModels.length > 0 && (
        <section className="border-t border-border/50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Top premium models</h2>
                <p className="text-muted-foreground text-sm mt-1">Bring your own API key. Pay only for what you use.</p>
              </div>
              <Link
                href="/models"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {premiumModels.slice(0, 8).map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-foreground">{m.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {m.contextLength >= 1_000_000
                        ? `${(m.contextLength / 1_000_000).toFixed(0)}M context`
                        : `${(m.contextLength / 1_000).toFixed(0)}K context`}
                    </div>
                  </div>
                  {m.pricing && (
                    <div className="text-right text-sm font-mono">
                      <div className="text-foreground">{m.pricing.prompt}</div>
                      <div className="text-muted-foreground text-xs">{m.pricing.completion}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/chat"
              className="px-8 py-3 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
            >
              Open chat →
            </Link>
            <Link
              href="/models"
              className="px-8 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors"
            >
              Browse models
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}