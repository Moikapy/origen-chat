"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useModels } from "@/lib/use-models";
import { getProviderBadge, isRouterModel } from "@/lib/models";
import { useAuth } from "@/lib/auth";
import { useOllama, type OllamaModel } from "@/lib/use-ollama";

interface ModelOption {
  id: string;
  name: string;
  description: string;
  provider: { text: string; color: string };
  pricing?: { prompt: string; completion: string; promptPer1M?: number; completionPer1M?: number } | null;
  free: boolean;
  locked: boolean;
  group: string;
  sizeLabel?: string;
}

/** Cost tier from pricing — returns $ indicators like T3 Chat */
function getCostTier(opt: ModelOption): string {
  if (opt.free) return "Free";
  if (!opt.pricing?.promptPer1M) return "$·";
  const cost = opt.pricing.promptPer1M;
  if (cost < 0.5) return "$·";
  if (cost < 5) return "$$·";
  return "$$$·";
}

function getCostColor(opt: ModelOption): string {
  if (opt.free) return "text-primary/80";
  if (!opt.pricing?.promptPer1M) return "text-muted-foreground/60";
  const cost = opt.pricing.promptPer1M;
  if (cost < 0.5) return "text-emerald-400/80";
  if (cost < 5) return "text-amber-400/80";
  return "text-red-400/80";
}

function buildOptions(
  models: Awaited<ReturnType<typeof useModels>["models"]>,
  ollamaModels: OllamaModel[],
  ollamaConnected: boolean,
  showPremium: boolean,
  byok: boolean,
  openrouterConnected: boolean,
): ModelOption[] {
  const options: ModelOption[] = [];

  const routers = models.filter((m) => isRouterModel(m.id));
  for (const m of routers) {
    options.push({
      id: m.id, name: m.name, description: m.description,
      provider: getProviderBadge(m.id), pricing: m.pricing, free: m.free,
      locked: false, group: "Routers",
    });
  }

  const freeModels = models.filter((m) => m.free && !isRouterModel(m.id));
  for (const m of freeModels) {
    options.push({
      id: m.id, name: m.name, description: m.description,
      provider: getProviderBadge(m.id), pricing: m.pricing, free: m.free,
      locked: false, group: "Free",
    });
  }

  const premiumModels = models.filter((m) => !m.free && !isRouterModel(m.id));
  const locked = !showPremium;
  for (const m of premiumModels) {
    const slug = m.id.startsWith("openrouter/") ? m.id.slice("openrouter/".length) : m.id;
    const providerSlug = slug.split("/")[0];
    const providerNames: Record<string, string> = {
      anthropic: "Claude", openai: "OpenAI", google: "Google",
      deepseek: "DeepSeek", "meta-llama": "Meta", "x-ai": "xAI",
      mistralai: "Mistral", nvidia: "NVIDIA", inclusionai: "inclusionAI",
    };
    const groupLabel = locked ? "Premium" : (providerNames[providerSlug] ?? "Premium");
    options.push({
      id: m.id, name: m.name, description: m.description,
      provider: getProviderBadge(m.id), pricing: m.pricing, free: m.free,
      locked, group: groupLabel,
    });
  }

  if (ollamaConnected && ollamaModels.length > 0) {
    for (const m of ollamaModels) {
      options.push({
        id: m.id, name: m.name, description: "Local Ollama model",
        provider: { text: "OLL", color: "bg-emerald-500/20 text-emerald-400" },
        free: true, locked: false, group: "Ollama", sizeLabel: m.sizeLabel,
      });
    }
  }

  return options;
}

export function ModelSelector({
  value,
  onChange,
  freeOnly = false,
  byok = false,
}: {
  value: string;
  onChange: (model: string) => void;
  freeOnly?: boolean;
  byok?: boolean;
}) {
  const { models, loading } = useModels();
  const { openrouterConnected } = useAuth();
  const { models: ollamaModels, connected: ollamaConnected } = useOllama();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showPremium = byok || !freeOnly || openrouterConnected;

  const allOptions = useMemo(
    () => buildOptions(models, ollamaModels, ollamaConnected, showPremium, byok, openrouterConnected),
    [models, ollamaModels, ollamaConnected, showPremium, byok, openrouterConnected],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.text.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q),
    );
  }, [allOptions, search]);

  const groups = useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const opt of filtered) {
      const group = map.get(opt.group) ?? [];
      group.push(opt);
      map.set(opt.group, group);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const current = allOptions.find((m) => m.id === value);
  const displayName = current?.name ?? value.split("/").pop() ?? "Select model";
  const showOllamaHint = !ollamaConnected && open;

  if (loading) {
    return <div className="h-7 w-28 rounded-md bg-secondary animate-pulse" />;
  }

  return (
    <div ref={ref} className="relative">
      {/* Compact trigger pill — T3 Chat style */}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={`Select model. Current model: ${displayName}`}
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="chat-input-model-trigger relative flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground h-8"
      >
        {current && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${current.provider.color}`}>
            {current.provider.text}
          </span>
        )}
        {!current && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/20 text-primary shrink-0">
            FREE
          </span>
        )}
        <span className="truncate text-sm font-medium">{displayName}</span>
        {current && (
          <span className={`hidden sm:inline text-[10px] font-semibold tracking-tight shrink-0 ${getCostColor(current)}`}>
            {getCostTier(current)}
          </span>
        )}
        <svg className="size-3.5 shrink-0 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Command palette popover */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Model list */}
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {Array.from(groups.entries()).map(([group, options]) => (
              <div key={group}>
                <div className="sticky top-0 bg-card/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                  {group}
                </div>
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={opt.locked}
                    onClick={() => {
                      if (!opt.locked) {
                        onChange(opt.id);
                        setOpen(false);
                        setSearch("");
                      }
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors ${
                      opt.id === value ? "bg-accent/50" : ""
                    } ${opt.locked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${opt.provider.color} shrink-0`}>
                      {opt.provider.text}
                    </span>
                    <span className="truncate flex-1 font-medium">{opt.name}</span>
                    <span className={`text-[10px] font-semibold shrink-0 ${getCostColor(opt)}`}>
                      {getCostTier(opt)}
                    </span>
                    {opt.sizeLabel && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {opt.sizeLabel}
                      </span>
                    )}
                    {opt.locked && (
                      <svg className="size-3 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {/* Ollama hint when not connected */}
            {showOllamaHint && (
              <div>
                <div className="sticky top-0 bg-card/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                  Ollama
                </div>
                <a
                  href="/settings"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                >
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500">
                    OLL
                  </span>
                  <span className="flex-1 font-medium">Connect in Settings</span>
                  <span className="text-[10px]">→</span>
                </a>
              </div>
            )}

            {filtered.length === 0 && !showOllamaHint && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No models found
              </div>
            )}
          </div>

          {/* Footer hint */}
          {!showPremium && (
            <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
              <a href="/auth/login" className="text-primary hover:underline">Sign in</a> or{" "}
              <a href="/settings" className="text-primary hover:underline">connect OpenRouter</a> to unlock premium models
            </div>
          )}
        </div>
      )}
    </div>
  );
}