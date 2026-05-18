"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useModel, type UIModel } from "@/lib/use-models";
import { SiteNav } from "@/components/site-layout";

// ── Modality labels ───────────────────────────────────────────────

const MODALITY_LABELS: Record<string, string> = {
  text: "Text",
  image: "Image",
  file: "Files",
  audio: "Audio",
  video: "Video",
};

// ── Parameter labels ─────────────────────────────────────────────

const PARAM_LABELS: Record<string, string> = {
  tools: "Tool use",
  tool_choice: "Tool choice",
  structured_outputs: "Structured output",
  reasoning: "Extended thinking",
  include_reasoning: "Reasoning output",
  response_format: "Response format",
  temperature: "Temperature",
  top_p: "Top P",
  top_k: "Top K",
  seed: "Seed",
  stop: "Stop sequences",
  max_tokens: "Max tokens",
  max_completion_tokens: "Max completion",
  frequency_penalty: "Freq. penalty",
  presence_penalty: "Pres. penalty",
  repetition_penalty: "Rep. penalty",
  verbosity: "Verbosity",
};

// ── Format helpers ───────────────────────────────────────────────

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatPrice(val: number | undefined, unit: string = "/1M tok"): string {
  if (val === undefined || val === 0) return "\u2014";
  if (val < 0.01) return `$${val.toFixed(4)} ${unit}`;
  return `$${val.toFixed(2)} ${unit}`;
}

// ── Sub-components ───────────────────────────────────────────────

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "primary" | "free" }) {
  const classes = {
    default: "bg-muted text-muted-foreground border border-border",
    primary: "bg-primary/10 text-primary border border-primary/30",
    free: "bg-primary/20 text-primary border border-primary/30",
  }[variant];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${classes}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-base sm:text-lg font-semibold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function PricingRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 px-3 rounded-md ${highlight ? "bg-primary/5" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-mono ${highlight ? "text-foreground" : "text-muted-foreground"}`}>{value}</span>
    </div>
  );
}

function ParameterTag({ param }: { param: string }) {
  const label = PARAM_LABELS[param] ?? param;
  const isKey = ["tools", "structured_outputs", "reasoning", "response_format"].includes(param);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
        isKey
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-muted text-muted-foreground border border-border"
      }`}
    >
      {label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function ModelDetailPage() {
  const params = useParams();
  const slug = decodeURIComponent(params.id as string);
  const { model, loading } = useModel(slug);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
          <p className="mt-4 text-muted-foreground">Loading model...</p>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Model not found</h1>
          <p className="text-muted-foreground mb-6">The model &quot;{slug}&quot; doesn&apos;t exist or isn&apos;t available.</p>
          <Link
            href="/models"
            className="px-4 py-2 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
          >
            Browse all models
          </Link>
        </div>
      </div>
    );
  }

  return <ModelDetail model={model} />;
}

function ModelDetail({ model }: { model: UIModel }) {
  const inputModes = model.modalities.input;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav active="models" />

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6 sm:mb-8 overflow-hidden">
          <Link href="/models" className="hover:text-foreground transition-colors shrink-0">
            Models
          </Link>
          <span className="shrink-0">/</span>
          <span className="text-foreground truncate">{model.name}</span>
        </div>

        {/* Hero */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold truncate">{model.name}</h1>
            {model.free ? <Badge variant="free">Free</Badge> : <Badge variant="default">Premium</Badge>}
          </div>
          <p className="text-muted-foreground text-base sm:text-lg">by {model.provider}</p>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <code className="text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground break-all">
              {model.slug}
            </code>
          </div>

          {model.fullDescription && (
            <p className="mt-6 text-muted-foreground leading-relaxed max-w-3xl text-sm sm:text-base">
              {model.fullDescription}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mb-8 sm:mb-12 flex-wrap">
          <Link
            href={`/chat?model=${encodeURIComponent(model.id)}`}
            className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity text-sm"
          >
            Chat with this model
          </Link>
          <Link
            href={`/models/compare?models=${encodeURIComponent(model.slug)}`}
            className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors text-sm"
          >
            Compare
          </Link>
          <a
            href={`https://openrouter.ai/${model.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors text-sm"
          >
            OpenRouter
          </a>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-8 sm:mb-12">
          <StatCard label="Context" value={formatContext(model.contextLength)} sub="token window" />
          <StatCard
            label="Max Output"
            value={model.maxCompletionTokens ? formatContext(model.maxCompletionTokens) : "\u2014"}
            sub="completion tokens"
          />
          <StatCard
            label="Input"
            value={inputModes.length === 1 && inputModes[0] === "text" ? "Text" : `${inputModes.length} types`}
            sub={inputModes.map((m) => MODALITY_LABELS[m] ?? m).join(", ")}
          />
          <StatCard
            label="Output"
            value={model.modalities.output[0] ?? "Text"}
            sub={model.tokenizer !== "unknown" ? model.tokenizer : undefined}
          />
        </div>

        {/* Pricing */}
        <section className="mb-8 sm:mb-12">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Pricing</h2>
          {model.free ? (
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 sm:p-6">
              <div className="text-primary font-semibold text-lg">Free</div>
              <p className="text-sm text-primary/80 mt-1">
                No API key required. No usage charges. Free models are rate-limited.
              </p>
            </div>
          ) : model.pricing ? (
            <div className="space-y-1">
              <PricingRow label="Input" value={`${model.pricing.prompt} / 1M tokens`} highlight />
              <PricingRow label="Output" value={`${model.pricing.completion} / 1M tokens`} highlight />
              {model.extraPricing?.cacheRead != null && (
                <PricingRow label="Cache read" value={formatPrice(model.extraPricing.cacheRead, "/1M tok")} />
              )}
              {model.extraPricing?.cacheWrite != null && (
                <PricingRow label="Cache write" value={formatPrice(model.extraPricing.cacheWrite, "/1M tok")} />
              )}
              {model.extraPricing?.image != null && (
                <PricingRow label="Image input" value={formatPrice(model.extraPricing.image)} />
              )}
              {model.extraPricing?.audio != null && (
                <PricingRow label="Audio input" value={formatPrice(model.extraPricing.audio)} />
              )}
              {model.extraPricing?.webSearch != null && (
                <PricingRow label="Web search" value={`$${model.extraPricing.webSearch.toFixed(2)} / request`} />
              )}
              {model.extraPricing?.internalReasoning != null && (
                <PricingRow label="Internal reasoning" value={formatPrice(model.extraPricing.internalReasoning)} />
              )}
            </div>
          ) : null}
          {!model.free && (
            <p className="text-xs text-muted-foreground mt-4">
              Pricing sourced live from OpenRouter. Pay only for what you use &mdash; no subscriptions, no minimums.
            </p>
          )}
        </section>

        {/* Capabilities */}
        {model.supportedParameters.length > 0 && (
          <section className="mb-8 sm:mb-12">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">Capabilities</h2>
            <div className="flex flex-wrap gap-2">
              {model.supportedParameters.map((p) => (
                <ParameterTag key={p} param={p} />
              ))}
            </div>
          </section>
        )}

        {/* Modalities */}
        <section className="mb-8 sm:mb-12">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Modalities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Input</h3>
              <div className="flex flex-wrap gap-2">
                {inputModes.map((m) => (
                  <span key={m} className="inline-flex items-center px-3 py-1.5 rounded-lg bg-muted text-foreground text-sm">
                    {MODALITY_LABELS[m] ?? m}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Output</h3>
              <div className="flex flex-wrap gap-2">
                {model.modalities.output.map((m) => (
                  <span key={m} className="inline-flex items-center px-3 py-1.5 rounded-lg bg-muted text-foreground text-sm">
                    {MODALITY_LABELS[m] ?? m}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{model.modalities.modality}</p>
        </section>

        {/* Back */}
        <div className="pt-6 sm:pt-8 border-t border-border/50">
          <Link href="/models" className="text-sm text-primary hover:underline">
            &larr; Back to all models
          </Link>
        </div>
      </main>
    </div>
  );
}