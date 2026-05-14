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
            const id = m.id.toLowerCase();
            // Popular model families only
            return (
              id.includes("claude") ||
              id.includes("gpt-4") ||
              id.includes("gpt-4.1") ||
              id.includes("o1-") ||
              id.includes("o3-") ||
              id.includes("o4-") ||
              id.includes("gemini-2") ||
              id.includes("gemini-3") ||
              id.includes("deepseek") ||
              id.includes("llama-4") ||
              id.includes("llama-3") ||
              id.includes("grok") ||
              id.includes("mistral") ||
              id.includes("nemotron") ||
              id.includes("qwen") ||
              id === "openrouter/free"
            );
          })
          .filter((m: any) => {
            const id = m.id.toLowerCase();
            // Skip unwanted variants
            if (id.includes(":extended") || id.includes(":vision") || id.includes(":beta")) return false;
            if (id.includes("3.5-sonnet") || id.includes("3-haiku")) return false; // Old models
            return true;
          })
          // Deduplicate: prefer :free variant, skip base if free exists
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
              .replace(/\s*:free$/i, "")
              .trim();
            return {
              id: m.id.includes("/") ? `openrouter/${m.id}` : m.id,
              name: cleanName,
              description: (m.description ?? "").split(".")[0].substring(0, 60),
              pricing: isFree ? null : {
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