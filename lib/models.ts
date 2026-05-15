/**
 * Static model registry for the client.
 * Updated May 2026 to match current OpenRouter offerings.
 * Free models work without an account; premium models need an API key.
 */

export interface UIModel {
  name: string;
  description: string;
  free: boolean;
  /** Whether this model supports OpenRouter tool/function calling. Defaults to true. */
  tools?: boolean;
  pricing?: { prompt: string; completion: string };
}

export const MODELS: Record<string, UIModel> = {
  // ── Free (supports tools) ──────────────────────────────────────────
  "openrouter/free":                          { name: "Free",                description: "Auto-selects best free model",        free: true },
  "openrouter/deepseek/deepseek-v4-flash:free":  { name: "DeepSeek V4 Flash",  description: "DeepSeek V4 Flash (fast, tools)",    free: true },
  "openrouter/deepseek/deepseek-chat-v3-0324:free":  { name: "DeepSeek V3",        description: "DeepSeek Chat V3",                    free: true },
  "openrouter/deepseek/deepseek-r1:free":     { name: "DeepSeek R1",         description: "DeepSeek reasoning model",              free: true, tools: false },
  "openrouter/google/gemini-2.0-flash-exp:free":  { name: "Gemini 2.0 Flash",   description: "Google Gemini Flash",                  free: true },
  "openrouter/nvidia/nemotron-3-super:free":   { name: "Nemotron 3 Super",    description: "NVIDIA 120B MoE (free)",                free: true },
  "openrouter/inclusionai/ring-2.6-1t:free":  { name: "Ring 2.6",            description: "inclusionAI 1T-parameter (free)",        free: true },
  "openrouter/meta-llama/llama-3.3-70b-instruct:free": { name: "Llama 3.3 70B", description: "Meta Llama 3.3 70B (free)",            free: true },

  // ── Premium: Claude ──────────────────────────────────────────────────
  "openrouter/anthropic/claude-sonnet-4":     { name: "Claude Sonnet 4",     description: "Anthropic Claude Sonnet 4",             free: false, pricing: { prompt: "$3.00", completion: "$15.00" } },
  "openrouter/anthropic/claude-opus-4":       { name: "Claude Opus 4",       description: "Anthropic Claude Opus 4",               free: false, pricing: { prompt: "$15.00", completion: "$75.00" } },

  // ── Premium: OpenAI ──────────────────────────────────────────────────
  "openrouter/openai/gpt-4o":                 { name: "GPT-4o",              description: "OpenAI GPT-4o",                         free: false, pricing: { prompt: "$2.50", completion: "$10.00" } },
  "openrouter/openai/gpt-4.1-mini":           { name: "GPT-4.1 Mini",        description: "OpenAI GPT-4.1 Mini",                   free: false, pricing: { prompt: "$0.40", completion: "$1.60" } },
  "openrouter/openai/gpt-4.1":                { name: "GPT-4.1",             description: "OpenAI GPT-4.1",                         free: false, pricing: { prompt: "$2.00", completion: "$8.00" } },
  "openrouter/openai/o3-mini":                { name: "O3 Mini",             description: "OpenAI reasoning (mini)",                free: false, pricing: { prompt: "$1.10", completion: "$4.40" } },
  "openrouter/openai/o4-mini":                { name: "O4 Mini",             description: "OpenAI reasoning (o4)",                  free: false, pricing: { prompt: "$1.10", completion: "$4.40" } },

  // ── Premium: Google ──────────────────────────────────────────────────
  "openrouter/google/gemini-2.5-pro":         { name: "Gemini 2.5 Pro",     description: "Google Gemini 2.5 Pro",                 free: false, pricing: { prompt: "$1.25", completion: "$10.00" } },
  "openrouter/google/gemini-2.5-flash":        { name: "Gemini 2.5 Flash",   description: "Google Gemini 2.5 Flash",               free: false, pricing: { prompt: "$0.15", completion: "$0.60" } },
  "openrouter/google/gemini-3.1-flash-lite":   { name: "Gemini 3.1 Flash Lite", description: "Google Gemini 3.1 Flash",             free: false, pricing: { prompt: "$0.10", completion: "$0.40" } },

  // ── Premium: Meta ────────────────────────────────────────────────────
  "openrouter/meta-llama/llama-4-maverick":    { name: "Llama 4 Maverick",   description: "Meta Llama 4 Maverick 400B",            free: false, pricing: { prompt: "$0.22", completion: "$0.88" } },

  // ── Premium: xAI ─────────────────────────────────────────────────────
  "openrouter/x-ai/grok-3-mini":              { name: "Grok 3 Mini",        description: "xAI Grok 3 Mini",                       free: false, pricing: { prompt: "$0.30", completion: "$0.50" } },
  "openrouter/x-ai/grok-3":                  { name: "Grok 3",              description: "xAI Grok 3",                             free: false, pricing: { prompt: "$3.00", completion: "$15.00" } },

  // ── Premium: Mistral ─────────────────────────────────────────────────
  "openrouter/mistralai/mistral-3.1-small":    { name: "Mistral 3.1 Small",  description: "Mistral Small (fast)",                   free: false, pricing: { prompt: "$0.10", completion: "$0.30" } },
};

/** Check if a model is free on OpenRouter. Free models cost $0 but need auth. */
export function isFreeModel(model: string): boolean {
  return model === "openrouter/free" || model.endsWith(":free") || model.startsWith("openrouter/free");
}

/** Check if a model supports tool/function calling.
 * Defaults to true — most OpenRouter models support tools now.
 * Only models explicitly marked tools:false are excluded.
 */
export function modelSupportsTools(modelId: string): boolean {
  const model = MODELS[modelId];
  if (!model) return true; // unknown model — assume tools work, let OpenRouter return errors
  return model.tools ?? true;
}

/** Strip "openrouter/" prefix for API calls.
 * UI IDs like "openrouter/deepseek/deepseek-v4-flash:free" become "deepseek/deepseek-v4-flash:free".
 * But "openrouter/free" stays as-is since @moikapy/origen knows it directly.
 */
export function stripOpenrouterPrefix(model: string): string {
  if (model === "openrouter/free") return model;
  if (model.startsWith("openrouter/")) return model.slice("openrouter/".length);
  return model;
}

export const MODEL_GROUPS = [
  {
    label: "Free",
    models: Object.entries(MODELS)
      .filter(([, m]) => m.free)
      .map(([id, m]) => ({ id, ...m })),
  },
  {
    label: "Premium",
    models: Object.entries(MODELS)
      .filter(([, m]) => !m.free)
      .map(([id, m]) => ({ id, ...m })),
  },
];

export type ModelId = keyof typeof MODELS;