"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useModels, type UIModel } from "@/lib/use-models";
import { getProviderBadge } from "@/lib/models";
import { SiteNav, SiteFooter } from "@/components/site-layout";

// ── Helpers ──────────────────────────────────────────────────────

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

type SortKey = "name" | "price" | "context";

// ── Context ranges ───────────────────────────────────────────────

const CONTEXT_RANGES = [
  { label: "< 128K", test: (n: number) => n < 128_000 },
  { label: "128K \u2013 512K", test: (n: number) => n >= 128_000 && n < 512_000 },
  { label: "512K \u2013 1M", test: (n: number) => n >= 512_000 && n < 1_000_000 },
  { label: "1M+", test: (n: number) => n >= 1_000_000 },
];

// ── Key capabilities ─────────────────────────────────────────────

const CAPABILITY_OPTIONS = [
  { key: "tools", label: "Tool use" },
  { key: "reasoning", label: "Extended thinking" },
  { key: "structured_outputs", label: "Structured output" },
  { key: "response_format", label: "Response format" },
  { key: "vision", label: "Vision / Image input" },
];

// ── Input modalities ─────────────────────────────────────────────

const MODALITY_OPTIONS = [
  { key: "image", label: "Image" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
  { key: "file", label: "Files" },
];

// ── Capability badges ─────────────────────────────────────────────

function CapBadges({ model }: { model: UIModel }) {
  const inputModes = model.modalities.input.filter((m) => m !== "text");
  const badges: string[] = [...inputModes];
  if (model.supportedParameters.includes("tools")) badges.push("Tools");
  if (model.supportedParameters.includes("reasoning")) badges.push("Thinking");
  if (model.supportedParameters.includes("structured_outputs")) badges.push("Structured");
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {badges.map((b) => (
        <span key={b} className="text-[11px] leading-none px-1.5 py-1 rounded bg-muted text-muted-foreground">
          {b}
        </span>
      ))}
    </div>
  );
}

// ── Collapsible section ──────────────────────────────────────────

function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50 pb-3 mb-3 last:border-0 last:mb-0 last:pb-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-sm font-medium text-foreground mb-2 hover:text-primary transition-colors"
      >
        {title}
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function ModelsPage() {
  const { models, loading } = useModels();

  // Search & sort
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  // Sidebar filters
  const [showFree, setShowFree] = useState(true);
  const [showPremium, setShowPremium] = useState(true);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [selectedContext, setSelectedContext] = useState<Set<string>>(new Set());
  const [selectedCapabilities, setSelectedCapabilities] = useState<Set<string>>(new Set());
  const [selectedModalities, setSelectedModalities] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Derive provider list from data
  const providers = useMemo(() => {
    const s = new Set(models.map((m) => m.provider));
    return Array.from(s).sort();
  }, [models]);

  // Filter logic
  const filtered = useMemo(() => {
    let result = [...models];

    // Tier
    if (!showFree) result = result.filter((m) => !m.free);
    if (!showPremium) result = result.filter((m) => m.free);

    // Provider
    if (selectedProviders.size > 0) {
      result = result.filter((m) => selectedProviders.has(m.provider));
    }

    // Context range
    if (selectedContext.size > 0) {
      result = result.filter((m) =>
        Array.from(selectedContext).some((range) =>
          CONTEXT_RANGES.find((r) => r.label === range)?.test(m.contextLength) ?? false
        )
      );
    }

    // Capabilities
    if (selectedCapabilities.size > 0) {
      result = result.filter((m) => {
        for (const cap of selectedCapabilities) {
          if (cap === "vision") {
            if (!m.modalities.input.includes("image")) return false;
          } else {
            if (!m.supportedParameters.includes(cap)) return false;
          }
        }
        return true;
      });
    }

    // Modalities
    if (selectedModalities.size > 0) {
      result = result.filter((m) =>
        Array.from(selectedModalities).every((mod) => m.modalities.input.includes(mod))
      );
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q)
      );
    }

    // Sort: free first, then within groups
    const freeGroup = result.filter((m) => m.free);
    const premiumGroup = result.filter((m) => !m.free);

    const sortFn = (a: UIModel, b: UIModel) => {
      switch (sort) {
        case "price":
          return (a.pricing?.promptPer1M ?? 0) - (b.pricing?.promptPer1M ?? 0);
        case "context":
          return b.contextLength - a.contextLength;
        default:
          return a.name.localeCompare(b.name);
      }
    };

    freeGroup.sort(sortFn);
    premiumGroup.sort(sortFn);
    return showFree && showPremium ? [...freeGroup, ...premiumGroup] : showFree ? freeGroup : premiumGroup;
  }, [models, search, sort, showFree, showPremium, selectedProviders, selectedContext, selectedCapabilities, selectedModalities]);

  const activeFilterCount = selectedProviders.size + selectedContext.size + selectedCapabilities.size + selectedModalities.size + (showFree && showPremium ? 0 : 1);

  function clearAllFilters() {
    setSelectedProviders(new Set());
    setSelectedContext(new Set());
    setSelectedCapabilities(new Set());
    setSelectedModalities(new Set());
    setShowFree(true);
    setShowPremium(true);
  }

  function toggleSet<T>(set: Set<T>, item: T): Set<T> {
    const next = new Set(set);
    if (next.has(item)) next.delete(item); else next.add(item);
    return next;
  }

  // ── Sidebar content (shared between desktop & mobile) ──
  function SidebarContent() {
    return (
      <div className="space-y-1">
        {/* Tier */}
        <FilterSection title="Pricing Tier">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showFree}
                onChange={() => setShowFree(!showFree)}
                className="rounded border-border accent-primary"
              />
              <span className="text-primary font-medium">Free</span>
              <span className="text-xs text-muted-foreground ml-auto">{models.filter((m) => m.free).length}</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showPremium}
                onChange={() => setShowPremium(!showPremium)}
                className="rounded border-border accent-primary"
              />
              <span className="text-foreground">Premium</span>
              <span className="text-xs text-muted-foreground ml-auto">{models.filter((m) => !m.free).length}</span>
            </label>
          </div>
        </FilterSection>

        {/* Provider */}
        <FilterSection title="Provider">
          <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-area">
            {providers.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedProviders.has(p)}
                  onChange={() => setSelectedProviders(toggleSet(selectedProviders, p))}
                  className="rounded border-border accent-primary"
                />
                <span>{p}</span>
                <span className="text-xs text-muted-foreground ml-auto">{models.filter((m) => m.provider === p).length}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Context window */}
        <FilterSection title="Context Window">
          <div className="space-y-1.5">
            {CONTEXT_RANGES.map((r) => (
              <label key={r.label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedContext.has(r.label)}
                  onChange={() => setSelectedContext(toggleSet(selectedContext, r.label))}
                  className="rounded border-border accent-primary"
                />
                <span>{r.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{models.filter((m) => r.test(m.contextLength)).length}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Capabilities */}
        <FilterSection title="Capabilities" defaultOpen={false}>
          <div className="space-y-1.5">
            {CAPABILITY_OPTIONS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCapabilities.has(c.key)}
                  onChange={() => setSelectedCapabilities(toggleSet(selectedCapabilities, c.key))}
                  className="rounded border-border accent-primary"
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Input modalities */}
        <FilterSection title="Input Modalities" defaultOpen={false}>
          <div className="space-y-1.5">
            {MODALITY_OPTIONS.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedModalities.has(m.key)}
                  onChange={() => setSelectedModalities(toggleSet(selectedModalities, m.key))}
                  className="rounded border-border accent-primary"
                />
                <span>{m.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{models.filter((mod) => mod.modalities.input.includes(m.key)).length}</span>
              </label>
            ))}
          </div>
        </FilterSection>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav active="models" />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Models</h1>
          <p className="text-muted-foreground">
            {filtered.length} model{filtered.length !== 1 ? "s" : ""} across {new Set(filtered.map((m) => m.provider)).size} providers
          </p>
        </div>

        {/* Mobile filter toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-accent transition-colors mb-4"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M3 4h18M3 12h18M3 20h18" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="flex gap-6">
          {/* Sidebar — desktop */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">Filters</h2>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-xs text-primary hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <SidebarContent />
            </div>
          </aside>

          {/* Sidebar — mobile drawer */}
          {sidebarOpen && (
            <div className="lg:hidden fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
              <div className="absolute left-0 top-0 h-full w-72 bg-background border-r border-border overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">Filters</h2>
                  <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-xs text-primary hover:underline mb-4 block">
                    Clear all filters
                  </button>
                )}
                <SidebarContent />
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Search + sort */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx={11} cy={11} r={8} />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search models..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="px-3 py-2 text-sm bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
                <option value="context">Sort: Context</option>
              </select>
            </div>

            {/* Active filter pills */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {Array.from(selectedProviders).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedProviders(toggleSet(selectedProviders, p))}
                    className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    {p} <span className="ml-0.5">&times;</span>
                  </button>
                ))}
                {Array.from(selectedContext).map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedContext(toggleSet(selectedContext, c))}
                    className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    {c} <span className="ml-0.5">&times;</span>
                  </button>
                ))}
                {Array.from(selectedCapabilities).map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedCapabilities(toggleSet(selectedCapabilities, c))}
                    className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    {CAPABILITY_OPTIONS.find((o) => o.key === c)?.label ?? c} <span className="ml-0.5">&times;</span>
                  </button>
                ))}
                {Array.from(selectedModalities).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedModalities(toggleSet(selectedModalities, m))}
                    className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    {MODALITY_OPTIONS.find((o) => o.key === m)?.label ?? m} <span className="ml-0.5">&times;</span>
                  </button>
                ))}
                {(!showFree || !showPremium) && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
                    {!showFree && !showPremium ? "None" : !showFree ? "Premium only" : "Free only"}
                  </span>
                )}
              </div>
            )}

            {/* Models */}
            {loading ? (
              <div className="text-center text-muted-foreground py-16">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
                <p className="mt-4">Loading models from OpenRouter...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">
                <p>No models match your filters.</p>
                <button onClick={clearAllFilters} className="mt-2 text-sm text-primary hover:underline">
                  Clear all filters
                </button>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden lg:block rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_80px_80px_80px_80px_20px_130px] text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-2.5 border-b border-border">
                    <div>Model</div>
                    <div className="text-right">Input</div>
                    <div className="text-right">Output</div>
                    <div className="text-right">Context</div>
                    <div className="text-right">Max out</div>
                    <div />
                    <div className="text-left">Capabilities</div>
                  </div>
                  {filtered.map((m) => (
                    <ModelRow key={m.id} model={m} />
                  ))}
                </div>

                {/* Mobile cards */}
                <div className="lg:hidden flex flex-col gap-2">
                  {filtered.map((m) => (
                    <ModelCard key={m.id} model={m} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-10 rounded-lg border border-border p-5 text-sm text-muted-foreground">
          <h3 className="font-semibold text-foreground mb-2">How pricing works</h3>
          <p>
            Prices are <strong className="text-foreground">per 1M tokens</strong>, sourced live from OpenRouter.
            Free models require no API key. Premium models need an OpenRouter key &mdash; pay only for what you use.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

// ── Desktop table row ────────────────────────────────────────────

function ModelRow({ model }: { model: UIModel }) {
  return (
    <Link
      href={`/models/${encodeURIComponent(model.slug)}`}
      className={`grid grid-cols-[1fr_80px_80px_80px_80px_20px_130px] items-center px-4 py-3 text-sm border-b border-border/50 hover:bg-accent/30 transition-colors ${model.free ? "bg-primary/5" : ""
        }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {model.free && (
          <span className="shrink-0 inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
            Free
          </span>
        )}
      <div className="min-w-0">
          <div className="font-medium text-foreground truncate">{model.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            <span className={`inline-block px-1 py-0.5 rounded text-[10px] font-medium mr-1 ${getProviderBadge(model.id).color}`}>
              {getProviderBadge(model.id).text}
            </span>
            {model.provider}
          </div>
        </div>
      </div>
      <div className="text-right font-mono text-sm">
        {model.free ? <span className="text-primary font-semibold">$0</span> : model.pricing ? <span className="text-foreground">{model.pricing.prompt}</span> : <span className="text-muted-foreground">&mdash;</span>}
      </div>
      <div className="text-right font-mono text-sm">
        {model.free ? <span className="text-primary font-semibold">$0</span> : model.pricing ? <span className="text-foreground">{model.pricing.completion}</span> : <span className="text-muted-foreground">&mdash;</span>}
      </div>
      <div className="text-right text-muted-foreground">{formatContext(model.contextLength)}</div>
      <div className="text-right text-muted-foreground">{model.maxCompletionTokens ? formatContext(model.maxCompletionTokens) : "\u2014"}</div>
      <div />
      <div className="text-right"><CapBadges model={model} /></div>
    </Link>
  );
}

// ── Mobile card ───────────────────────────────────────────────────

function ModelCard({ model }: { model: UIModel }) {
  return (
    <Link
      href={`/models/${encodeURIComponent(model.slug)}`}
      className={`block rounded-lg border p-4 transition-colors hover:border-primary/40 ${model.free ? "border-primary/30 bg-primary/10" : "border-border bg-card hover:bg-accent/50"
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-semibold ${model.free ? "text-primary" : "text-foreground"}`}>{model.name}</h3>
            {model.free && (
              <span className="inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                Free
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{model.provider}</p>
        </div>
        <div className="text-right shrink-0">
          {model.pricing ? (
            <>
              <div className="text-sm font-mono text-foreground">
                {model.pricing.prompt}<span className="text-muted-foreground"> / </span>{model.pricing.completion}
              </div>
              <div className="text-xs text-muted-foreground">per 1M tokens</div>
            </>
          ) : (
            <span className="text-sm font-semibold text-primary">Free</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
        <span>{formatContext(model.contextLength)} ctx</span>
        {model.maxCompletionTokens && <span>{formatContext(model.maxCompletionTokens)} out</span>}
        <CapBadges model={model} />
      </div>
    </Link>
  );
}
