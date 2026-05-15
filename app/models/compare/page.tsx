"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useModels, type UIModel } from "@/lib/use-models";
import { getProviderBadge } from "@/lib/models";
import { SiteNav, SiteFooter } from "@/components/site-layout";
import { Suspense } from "react";

function formatPrice(n: number): string {
  if (n === 0) return "Free";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function CompareTable({ models }: { models: UIModel[] }) {
  if (models.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg mb-2">No models selected</p>
        <p className="text-sm">Go to the models page and select models to compare.</p>
        <Link href="/models" className="text-primary hover:underline mt-4 inline-block">
          Browse models
        </Link>
      </div>
    );
  }

  // Find best values for highlighting
  const cheapestInput = Math.min(...models.map(m => m.pricing?.promptPer1M ?? Infinity));
  const cheapestOutput = Math.min(...models.map(m => m.pricing?.completionPer1M ?? Infinity));
  const longestContext = Math.max(...models.map(m => m.contextLength));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Model</th>
            {models.map(m => (
              <th key={m.id} className="text-center py-3 px-4 min-w-[180px]">
                <Link href={`/models/${encodeURIComponent(m.slug)}`} className="hover:underline">
                  <div className="font-semibold text-foreground">{m.name}</div>
                </Link>
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mt-1 ${getProviderBadge(m.id).color}`}>
                  {getProviderBadge(m.id).text}
                </span>
                {m.free && (
                  <span className="block text-xs text-primary font-medium mt-0.5">Free</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Pricing — Input */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Input price</td>
            {models.map(m => (
              <td key={m.id} className={`text-center py-2.5 px-4 font-mono ${m.pricing?.promptPer1M === cheapestInput ? "text-primary font-semibold" : "text-foreground"}`}>
                {m.pricing ? formatPrice(m.pricing.promptPer1M) : "—"}
              </td>
            ))}
          </tr>
          {/* Pricing — Output */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Output price</td>
            {models.map(m => (
              <td key={m.id} className={`text-center py-2.5 px-4 font-mono ${m.pricing?.completionPer1M === cheapestOutput ? "text-primary font-semibold" : "text-foreground"}`}>
                {m.pricing ? formatPrice(m.pricing.completionPer1M) : "—"}
              </td>
            ))}
          </tr>
          {/* Context length */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Context</td>
            {models.map(m => (
              <td key={m.id} className={`text-center py-2.5 px-4 ${m.contextLength === longestContext ? "text-primary font-semibold" : "text-foreground"}`}>
                {m.contextLength ? formatCtx(m.contextLength) : "—"}
              </td>
            ))}
          </tr>
          {/* Max output */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Max output</td>
            {models.map(m => (
              <td key={m.id} className="text-center py-2.5 px-4 text-foreground">
                {m.maxCompletionTokens ? formatCtx(m.maxCompletionTokens) : "—"}
              </td>
            ))}
          </tr>
          {/* Provider */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Provider</td>
            {models.map(m => (
              <td key={m.id} className="text-center py-2.5 px-4 text-foreground">
                {m.provider}
              </td>
            ))}
          </tr>
          {/* Input modalities */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Input</td>
            {models.map(m => (
              <td key={m.id} className="text-center py-2.5 px-4 text-foreground text-xs">
                {m.modalities.input.join(", ") || "—"}
              </td>
            ))}
          </tr>
          {/* Output modalities */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Output</td>
            {models.map(m => (
              <td key={m.id} className="text-center py-2.5 px-4 text-foreground text-xs">
                {m.modalities.output.join(", ") || "—"}
              </td>
            ))}
          </tr>
          {/* Tools */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 px-4 text-muted-foreground">Tools</td>
            {models.map(m => (
              <td key={m.id} className="text-center py-2.5 px-4">
                {m.supportedParameters.includes("tools") ? (
                  <span className="text-primary">Yes</span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </td>
            ))}
          </tr>
          {/* Try link */}
          <tr>
            <td className="py-2.5 px-4 text-muted-foreground">Try it</td>
            {models.map(m => (
              <td key={m.id} className="text-center py-2.5 px-4">
                <Link
                  href={`/chat?model=${encodeURIComponent(m.id)}`}
                  className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
                >
                  Chat
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ComparePageInner() {
  const searchParams = useSearchParams();
  const { models } = useModels();

  const selectedSlugs = useMemo(() => {
    const m = searchParams.get("models");
    return m ? m.split(",").filter(Boolean) : [];
  }, [searchParams]);

  const selectedModels = useMemo(() => {
    return selectedSlugs
      .map(slug => models.find(m => m.slug === slug || m.id === slug))
      .filter((m): m is UIModel => m !== undefined);
  }, [selectedSlugs, models]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav active="models" />

      <main className="mx-auto max-w-6xl px-6 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href="/models" className="hover:text-foreground transition-colors">
            Models
          </Link>
          <span>/</span>
          <span className="text-foreground">Compare</span>
        </div>

        <h1 className="text-3xl font-bold mb-2">Compare Models</h1>
        <p className="text-muted-foreground mb-8">
          Side-by-side comparison of {selectedModels.length > 0 ? `${selectedModels.length} model${selectedModels.length > 1 ? "s" : ""}` : "selected models"}.
          {selectedModels.length === 0 && " Add models by selecting them on the models page."}
        </p>

        <CompareTable models={selectedModels} />

        {/* Add more models */}
        {selectedModels.length > 0 && selectedModels.length < 5 && (
          <div className="mt-8 text-center">
            <Link href="/models" className="text-primary hover:underline text-sm">
              Add more models from the models page
            </Link>
          </div>
        )}
        {selectedModels.length >= 5 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Maximum 5 models for comparison. Remove some to add others.
          </p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <ComparePageInner />
    </Suspense>
  );
}