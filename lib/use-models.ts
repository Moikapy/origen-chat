"use client";

import { useEffect, useState, useCallback } from "react";

export interface UIModel {
  id: string;
  slug: string; // URL-safe slug, e.g. "anthropic/claude-sonnet-4"
  name: string;
  description: string;
  fullDescription: string;
  free: boolean;
  pricing: {
    prompt: string;
    completion: string;
    promptPer1M: number; // raw $ per 1M tokens
    completionPer1M: number;
  } | null;
  extraPricing?: {
    image?: number;
    audio?: number;
    webSearch?: number;
    internalReasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextLength: number;
  maxCompletionTokens: number | null;
  modalities: {
    input: string[];
    output: string[];
    modality: string;
  };
  supportedParameters: string[];
  tokenizer: string;
  provider: string; // e.g. "Anthropic", "OpenAI", "Google"
}

// Only include models from these major providers
const ALLOWED_PREFIXES = [
  "anthropic/",
  "openai/",
  "google/",
  "meta-llama/",
  "deepseek/",
  "x-ai/",
  "mistralai/",
  "nvidia/",
  "inclusionai/",
  "qwen/",
  "openrouter/free",
];

// Skip specific model IDs we don't want to surface
const SKIP_IDS = new Set([
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-haiku",
  "anthropic/claude-3-opus",
  "openai/gpt-chat-latest",
]);

// Provider names extracted from model IDs
const PROVIDER_MAP: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "meta-llama": "Meta",
  deepseek: "DeepSeek",
  "x-ai": "xAI",
  mistralai: "Mistral",
  nvidia: "NVIDIA",
  inclusionai: "inclusionAI",
  qwen: "Qwen",
  openrouter: "OpenRouter",
};

function extractProvider(id: string): string {
  const prefix = id.split("/")[0];
  return PROVIDER_MAP[prefix] ?? prefix;
}

function slugify(id: string): string {
  // Remove "openrouter/" prefix if present, keep provider/model
  return id.replace(/^openrouter\//, "");
}

let cachedModels: UIModel[] | null = null;
let cachePromise: Promise<UIModel[]> | null = null;

async function fetchModels(): Promise<UIModel[]> {
  if (cachedModels) return cachedModels;
  if (cachePromise) return cachePromise;

  cachePromise = fetch("https://openrouter.ai/api/v1/models")
    .then((r) => r.json())
    .then((raw: unknown) => {
      const data = raw as { data: any[] };
      const all = data.data ?? [];

      const filtered = all
        .filter((m: any) => {
          const isAllowed = ALLOWED_PREFIXES.some((p) => m.id.startsWith(p));
          if (!isAllowed) return false;
          if (SKIP_IDS.has(m.id)) return false;
          if (m.id.match(/:(extended|thinking|beta|nitro|vision|nitro)$/)) return false;
          return true;
        })
        .filter((m: any, _: number, arr: any[]) => {
          if (m.id.endsWith(":free") || m.id === "openrouter/free") return true;
          const freeId = m.id + ":free";
          return !arr.some((o: any) => o.id === freeId);
        })
        .map((m: any): UIModel => {
          const promptPrice = parseFloat(m.pricing?.prompt ?? "0");
          const completionPrice = parseFloat(m.pricing?.completion ?? "0");
          const isFree = promptPrice === 0 && completionPrice === 0;

          const cleanName = m.name
            .replace(/^(Anthropic|OpenAI|Google|Meta|xAI|Mistral|NVIDIA|DeepSeek|inclusionAI|Qwen):\s*/i, "")
            .replace(/\s*\(free\)\s*/i, "")
            .trim();

          const rawSlug = slugify(m.id);

          const extraPricing: UIModel["extraPricing"] = {};
          if (m.pricing?.image && parseFloat(m.pricing.image) > 0)
            extraPricing.image = parseFloat(m.pricing.image) * 1_000_000;
          if (m.pricing?.audio && parseFloat(m.pricing.audio) > 0)
            extraPricing.audio = parseFloat(m.pricing.audio) * 1_000_000;
          if (m.pricing?.web_search && parseFloat(m.pricing.web_search) > 0)
            extraPricing.webSearch = parseFloat(m.pricing.web_search);
          if (m.pricing?.internal_reasoning && parseFloat(m.pricing.internal_reasoning) > 0)
            extraPricing.internalReasoning = parseFloat(m.pricing.internal_reasoning) * 1_000_000;
          if (m.pricing?.input_cache_read && parseFloat(m.pricing.input_cache_read) > 0)
            extraPricing.cacheRead = parseFloat(m.pricing.input_cache_read) * 1_000_000;
          if (m.pricing?.input_cache_write && parseFloat(m.pricing.input_cache_write) > 0)
            extraPricing.cacheWrite = parseFloat(m.pricing.input_cache_write) * 1_000_000;

          return {
            id: m.id.includes("/") ? `openrouter/${m.id}` : m.id,
            slug: rawSlug,
            name: cleanName,
            description: (m.description ?? "").split(".")[0].substring(0, 60),
            fullDescription: m.description ?? "",
            free: isFree,
            pricing: isFree
              ? null
              : {
                  prompt: `$${(promptPrice * 1_000_000).toFixed(2)}`,
                  completion: `$${(completionPrice * 1_000_000).toFixed(2)}`,
                  promptPer1M: promptPrice * 1_000_000,
                  completionPer1M: completionPrice * 1_000_000,
                },
            extraPricing: Object.keys(extraPricing).length > 0 ? extraPricing : undefined,
            contextLength: m.context_length ?? 128_000,
            maxCompletionTokens: m.top_provider?.max_completion_tokens ?? null,
            modalities: {
              input: m.architecture?.input_modalities ?? ["text"],
              output: m.architecture?.output_modalities ?? ["text"],
              modality: m.architecture?.modality ?? "text->text",
            },
            supportedParameters: m.supported_parameters ?? [],
            tokenizer: m.architecture?.tokenizer ?? "unknown",
            provider: extractProvider(m.id),
          };
        })
        .sort((a: UIModel, b: UIModel) => {
          if (a.free !== b.free) return a.free ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      cachedModels = filtered;
      return filtered;
    });

  return cachePromise;
}

export function useModels() {
  const [models, setModels] = useState<UIModel[]>(cachedModels ?? []);
  const [loading, setLoading] = useState(cachedModels === null);

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { models, loading };
}

export function useModel(slug: string) {
  const [model, setModel] = useState<UIModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModels()
      .then((models) => {
        const found = models.find((m) => m.slug === slug);
        setModel(found ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  return { model, loading };
}

/**
 * Get a model by slug synchronously (from cache).
 * Returns null if not cached yet.
 */
export function getModelBySlug(slug: string): UIModel | null {
  return cachedModels?.find((m) => m.slug === slug) ?? null;
}

export { fetchModels };