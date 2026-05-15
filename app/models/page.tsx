"use client";

import Link from "next/link";
import { useModels, type UIModel } from "@/lib/use-models";

function ModelCard({ model }: { model: UIModel }) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        model.free
          ? "border-primary/30 bg-primary/10"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={`font-semibold ${model.free ? "text-primary" : "text-foreground"}`}>
            {model.name}
            {model.free && (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                Free
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
        </div>
        {model.pricing && (
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">per 1M tokens</div>
            <div className="text-sm font-mono">
              <span className="text-foreground">{model.pricing.prompt}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-foreground">{model.pricing.completion}</span>
            </div>
          </div>
        )}
      </div>
      {model.context_length && (
        <div className="mt-2 text-xs text-muted-foreground">
          {model.context_length >= 1_000_000
            ? `${(model.context_length / 1_000_000).toFixed(1)}M`
            : `${(model.context_length / 1_000).toFixed(0)}K`}{" "}
          context
        </div>
      )}
    </div>
  );
}

export default function ModelsPage() {
  const { models, loading } = useModels();
  const freeModels = models.filter((m) => m.free);
  const premiumModels = models.filter((m) => !m.free);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border/50">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
            Origen
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/models" className="text-sm text-foreground font-medium">
              Models
            </Link>
            <Link href="/chat" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Chat
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

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-3">Models</h1>
          <p className="text-muted-foreground text-lg">
            Free models require no account. Premium models need an API key.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-16">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            <p className="mt-4">Loading models from OpenRouter…</p>
          </div>
        ) : (
          <>
            {freeModels.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-xl font-semibold text-primary">Free</h2>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                    {freeModels.length} models
                  </span>
                </div>
                <div className="grid gap-3">
                  {freeModels.map((m) => (
                    <ModelCard key={m.id} model={m} />
                  ))}
                </div>
              </section>
            )}
            {premiumModels.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-xl font-semibold">Premium</h2>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                    {premiumModels.length} models
                  </span>
                </div>
                <div className="grid gap-3">
                  {premiumModels.map((m) => (
                    <ModelCard key={m.id} model={m} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <div className="mt-16 rounded-lg border border-border p-6 text-sm text-muted-foreground">
          <h3 className="font-semibold text-foreground mb-2">How pricing works</h3>
          <p>
            Premium prices shown are <strong className="text-foreground">input / output per 1M tokens</strong>,
            sourced live from OpenRouter. Pay only for what you use — no subscriptions, no minimums.
          </p>
          <p className="mt-2">
            Free models are completely free with no API key required.
          </p>
        </div>
      </main>

      <footer className="border-t border-border/50 mt-16">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>Built by <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">Moikapy</a></span>
          <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">moikapy.dev</a>
        </div>
      </footer>
    </div>
  );
}