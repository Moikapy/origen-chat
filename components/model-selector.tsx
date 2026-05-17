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

function buildOptions(
  models: Awaited<ReturnType<typeof useModels>["models"]>,
  ollamaModels: OllamaModel[],
  ollamaConnected: boolean,
  showPremium: boolean,
  byok: boolean,
  openrouterConnected: boolean,
): ModelOption[] {
  const options: ModelOption[] = [];

  // Routers
  const routers = models.filter((m) => isRouterModel(m.id));
  for (const m of routers) {
    options.push({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: getProviderBadge(m.id),
      pricing: m.pricing,
      free: m.free,
      locked: false,
      group: "Routers",
    });
  }

  // Free models
  const freeModels = models.filter((m) => m.free && !isRouterModel(m.id));
  for (const m of freeModels) {
    options.push({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: getProviderBadge(m.id),
      pricing: m.pricing,
      free: m.free,
      locked: false,
      group: "Free",
    });
  }

  // Premium models
  const premiumModels = models.filter((m) => !m.free && !isRouterModel(m.id));
  const locked = !showPremium;
  for (const m of premiumModels) {
    // Group by provider
    const slug = m.id.startsWith("openrouter/") ? m.id.slice("openrouter/".length) : m.id;
    const providerSlug = slug.split("/")[0];
    const providerNames: Record<string, string> = {
      anthropic: "Claude",
      openai: "OpenAI",
      google: "Google",
      deepseek: "DeepSeek",
      "meta-llama": "Meta",
      "x-ai": "xAI",
      mistralai: "Mistral",
      nvidia: "NVIDIA",
      inclusionai: "inclusionAI",
    };
    const groupLabel = locked ? "Premium (locked)" : (providerNames[providerSlug] ?? "Premium");
    options.push({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: getProviderBadge(m.id),
      pricing: m.pricing,
      free: m.free,
      locked,
      group: groupLabel,
    });
  }

  // Ollama models
  if (ollamaConnected && ollamaModels.length > 0) {
    for (const m of ollamaModels) {
      options.push({
        id: m.id,
        name: m.name,
        description: "Local Ollama model",
        provider: { text: "OLL", color: "bg-emerald-500/20 text-emerald-400" },
        free: true,
        locked: false,
        group: "Ollama",
        sizeLabel: m.sizeLabel,
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

  // Group filtered options
  const groups = useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const opt of filtered) {
      const group = map.get(opt.group) ?? [];
      group.push(opt);
      map.set(opt.group, group);
    }
    return map;
  }, [filtered]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Current model display
  const current = allOptions.find((m) => m.id === value);
  const displayText = current?.name ?? value.split("/").pop() ?? "Select model";

  // Always show Ollama section even when not connected (with setup hint)
  const ollamaGroup = groups.get("Ollama");
  const showOllamaHint = !ollamaConnected && open;

  if (loading) {
    return <div className="h-9 w-full rounded-md bg-secondary animate-pulse" />;
  }

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center gap-2 w-full text-sm bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
      >
        {current ? (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${current.provider.color}`}>
            {current.provider.text}
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary">FREE</span>
        )}
        <span className="truncate flex-1 text-left">{displayText}</span>
        <svg className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Model list */}
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {Array.from(groups.entries()).map(([group, options]) => (
              <div key={group}>
                <div className="sticky top-0 bg-muted/80 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
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
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50 transition-colors ${
                      opt.id === value ? "bg-primary/10" : ""
                    } ${opt.locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${opt.provider.color} shrink-0`}>
                      {opt.provider.text}
                    </span>
                    <span className="truncate flex-1">{opt.name}</span>
                    {opt.pricing && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {opt.pricing.prompt}
                      </span>
                    )}
                    {opt.sizeLabel && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {opt.sizeLabel}
                      </span>
                    )}
                    {opt.locked && (
                      <span className="text-[10px] text-muted-foreground shrink-0">locked</span>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {/* Ollama hint when not connected */}
            {showOllamaHint && (
              <div>
                <div className="sticky top-0 bg-muted/80 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                  Ollama
                </div>
                <a
                  href="/settings"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500">
                    OLL
                  </span>
                  <span className="flex-1">Connect in Settings</span>
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