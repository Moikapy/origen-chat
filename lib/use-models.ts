"use client";

import { useEffect, useState } from "react";

export interface UIModel {
  id: string;
  name: string;
  description: string;
  pricing: { prompt: string; completion: string } | null;
  context_length: number;
  free: boolean;
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
  // Old/deprecated Claude models
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-haiku",
  "anthropic/claude-3-opus",
  // OpenAI internal aliases
  "openai/gpt-chat-latest",
]);

export function useModels() {
  const [models, setModels] = useState<UIModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://openrouter.ai/api/v1/models")
      .then((r) => r.json())
      .then((raw: unknown) => {
        const data = raw as { data: any[] };
        const all = data.data ?? [];

        const filtered = all
          .filter((m: any) => {
            // Must be from an allowed provider
            const isAllowed = ALLOWED_PREFIXES.some((p) => m.id.startsWith(p));
            if (!isAllowed) return false;

            // Skip explicitly excluded IDs
            if (SKIP_IDS.has(m.id)) return false;

            // Skip variant suffixes we don't want
            if (m.id.match(/:(extended|thinking|beta|nitro|vision|nitro)$/)) return false;

            // Skip very old model IDs (3.x and earlier, except our approved prefixes)
            return true;
          })
          // Remove duplicate base+free pairs — only keep :free version
          .filter((m: any, _: number, arr: any[]) => {
            if (m.id.endsWith(":free") || m.id === "openrouter/free") return true;
            const freeId = m.id + ":free";
            // If there's a free variant, skip the paid one
            return !arr.some((o: any) => o.id === freeId);
          })
          .map((m: any): UIModel => {
            const promptPrice = parseFloat(m.pricing?.prompt ?? "0");
            const completionPrice = parseFloat(m.pricing?.completion ?? "0");
            const isFree = promptPrice === 0 && completionPrice === 0;

            // Clean up display name
            const cleanName = m.name
              .replace(/^(Anthropic|OpenAI|Google|Meta|xAI|Mistral|NVIDIA|DeepSeek|inclusionAI|Qwen):\s*/i, "")
              .replace(/\s*\(free\)\s*/i, "")
              .trim();

            return {
              id: m.id.includes("/") ? `openrouter/${m.id}` : m.id,
              name: cleanName,
              description: (m.description ?? "").split(".")[0].substring(0, 60),
              pricing: isFree
                ? null
                : {
                    prompt: `$${(promptPrice * 1_000_000).toFixed(2)}`,
                    completion: `$${(completionPrice * 1_000_000).toFixed(2)}`,
                  },
              context_length: m.context_length ?? 128_000,
              free: isFree,
            };
          })
          .sort((a: UIModel, b: UIModel) => {
            if (a.free !== b.free) return a.free ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        setModels(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { models, loading };
}