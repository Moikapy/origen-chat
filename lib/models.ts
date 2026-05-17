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
  // ── Routers (OpenRouter built-in)
  "openrouter/auto":                            { name: "Auto Router",            description: "Smart routing — picks best model for your prompt (NotDiamond)", free: false, pricing: { prompt: "Variable", completion: "Variable" } },
  "openrouter/pareto-code":                    { name: "Pareto Code",            description: "Cost-efficient coding router — cheapest model that meets your bar", free: false, pricing: { prompt: "Variable", completion: "Variable" } },

  // ── Free (supports tools) ──────────────────────────────────────────
  "openrouter/free":                          { name: "Free",                description: "Auto-selects best free model",        free: true },
  "openrouter/deepseek/deepseek-v4-flash:free":  { name: "DeepSeek V4 Flash",  description: "DeepSeek V4 Flash (fast, tools)",    free: true },
  "openrouter/deepseek/deepseek-chat-v3-0324:free":  { name: "DeepSeek V3",        description: "DeepSeek Chat V3",                    free: true },
  "openrouter/deepseek/deepseek-r1:free":     { name: "DeepSeek R1",         description: "DeepSeek reasoning model",              free: true, tools: false },
  "openrouter/google/gemini-2.0-flash-001":   { name: "Gemini 2.0 Flash",   description: "Google Gemini 2.0 Flash (fast, cheap)",              free: false, pricing: { prompt: "$0.00010", completion: "$0.00040" } },
  "openrouter/nvidia/nemotron-3-super-120b-a12b:free":   { name: "Nemotron 3 Super",    description: "NVIDIA 120B MoE (free)",                free: true },
  "openrouter/inclusionai/ring-2.6-1t":         { name: "Ring 2.6",            description: "inclusionAI 1T-parameter thinking model",       free: false, pricing: { prompt: "$0.10", completion: "$0.40" } },
  "openrouter/meta-llama/llama-3.3-70b-instruct:free": { name: "Llama 3.3 70B", description: "Meta Llama 3.3 70B (free)",            free: true },

  // ── Premium: Claude ──────────────────────────────────────────────────
  "openrouter/anthropic/claude-sonnet-4":     { name: "Claude Sonnet 4",     description: "Anthropic Claude Sonnet 4",             free: false, pricing: { prompt: "$3.00", completion: "$15.00" } },
  "openrouter/anthropic/claude-sonnet-4-5":   { name: "Claude Sonnet 4.5",   description: "Anthropic Claude Sonnet 4.5",           free: false, pricing: { prompt: "$3.00", completion: "$15.00" } },
  "openrouter/anthropic/claude-opus-4":       { name: "Claude Opus 4",       description: "Anthropic Claude Opus 4",               free: false, pricing: { prompt: "$15.00", completion: "$75.00" } },
  "openrouter/anthropic/claude-opus-4-5":     { name: "Claude Opus 4.5",     description: "Anthropic Claude Opus 4.5",             free: false, pricing: { prompt: "$15.00", completion: "$75.00" } },

  // ── Premium: OpenAI ──────────────────────────────────────────────────
  "openrouter/openai/gpt-4o":                 { name: "GPT-4o",              description: "OpenAI GPT-4o",                         free: false, pricing: { prompt: "$2.50", completion: "$10.00" } },
  "openrouter/openai/gpt-4.1-mini":           { name: "GPT-4.1 Mini",        description: "OpenAI GPT-4.1 Mini",                   free: false, pricing: { prompt: "$0.40", completion: "$1.60" } },
  "openrouter/openai/gpt-4.1":                { name: "GPT-4.1",             description: "OpenAI GPT-4.1",                         free: false, pricing: { prompt: "$2.00", completion: "$8.00" } },
  "openrouter/openai/gpt-5.2":                { name: "GPT-5.2",             description: "OpenAI GPT-5.2 (flagship)",              free: false, pricing: { prompt: "$2.50", completion: "$10.00" } },
  "openrouter/openai/gpt-5.4-mini":            { name: "GPT-5.4 Mini",        description: "OpenAI GPT-5.4 Mini (fast)",             free: false, pricing: { prompt: "$0.15", completion: "$0.60" } },
  "openrouter/openai/gpt-5.4":                { name: "GPT-5.4",             description: "OpenAI GPT-5.4 (balanced)",              free: false, pricing: { prompt: "$2.00", completion: "$8.00" } },
  "openrouter/openai/o3-mini":                { name: "O3 Mini",             description: "OpenAI reasoning (mini)",                free: false, pricing: { prompt: "$1.10", completion: "$4.40" } },
  "openrouter/openai/o4-mini":                { name: "O4 Mini",             description: "OpenAI reasoning (o4)",                  free: false, pricing: { prompt: "$1.10", completion: "$4.40" } },

  // ── Premium: Google ──────────────────────────────────────────────────
  "openrouter/google/gemini-2.5-pro":         { name: "Gemini 2.5 Pro",     description: "Google Gemini 2.5 Pro",                 free: false, pricing: { prompt: "$1.25", completion: "$10.00" } },
  "openrouter/google/gemini-2.5-flash":        { name: "Gemini 2.5 Flash",   description: "Google Gemini 2.5 Flash",               free: false, pricing: { prompt: "$0.15", completion: "$0.60" } },
  "openrouter/google/gemini-3-pro":            { name: "Gemini 3 Pro",       description: "Google Gemini 3 Pro (thinking)",           free: false, pricing: { prompt: "$1.25", completion: "$5.00" } },
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

/** Check if a model is a router (not a concrete model — routes to another model at runtime). */
export function isRouterModel(model: string): boolean {
  return model === "openrouter/auto" || model === "openrouter/pareto-code" || model === "openrouter/free";
}

/** Check if a model supports tool/function calling.
 * Defaults to true — most OpenRouter models support tools now.
 * Only models explicitly marked tools:false are excluded.
 */
export function modelSupportsTools(modelId: string): boolean {
  // Ollama models: tools support varies, assume true for chat endpoint
  if (modelId.startsWith("ollama/")) return true;
  const model = MODELS[modelId];
  if (!model) return true; // unknown model — assume tools work, let OpenRouter return errors
  return model.tools ?? true;
}

/** Strip "openrouter/" prefix for API calls.
 * UI IDs like "openrouter/deepseek/deepseek-v4-flash:free" become "deepseek/deepseek-v4-flash:free".
 * But router model IDs ("openrouter/free", "openrouter/auto", "openrouter/pareto-code") stay as-is
 * since the OpenRouter API knows them directly.
 */
export function stripOpenrouterPrefix(model: string): string {
  if (model === "openrouter/free" || model === "openrouter/auto" || model === "openrouter/pareto-code") return model;
  if (model.startsWith("openrouter/")) return model.slice("openrouter/".length);
  return model;
}

export const MODEL_GROUPS = [
  {
    label: "Routers",
    models: Object.entries(MODELS)
      .filter(([id]) => isRouterModel(id))
      .map(([id, m]) => ({ id, ...m })),
  },
  {
    label: "Free",
    models: Object.entries(MODELS)
      .filter(([, m]) => m.free)
      .filter(([id]) => !isRouterModel(id))
      .map(([id, m]) => ({ id, ...m })),
  },
  {
    label: "Premium",
    models: Object.entries(MODELS)
      .filter(([, m]) => !m.free)
      .filter(([id]) => !isRouterModel(id))
      .map(([id, m]) => ({ id, ...m })),
  },
];

export type ModelId = keyof typeof MODELS;

/** Extract provider from a model ID and return a display badge */
export function getProviderBadge(modelId: string): { text: string; color: string } {
  const slug = modelId.startsWith("openrouter/") ? modelId.slice("openrouter/".length) : modelId;
  const provider = slug.split("/")[0];

  const badges: Record<string, { text: string; color: string }> = {
    anthropic: { text: "ANT", color: "bg-orange-500/20 text-orange-400" },
    openai: { text: "OAI", color: "bg-green-500/20 text-green-400" },
    google: { text: "GOO", color: "bg-blue-500/20 text-blue-400" },
    deepseek: { text: "DS", color: "bg-yellow-500/20 text-yellow-400" },
    "meta-llama": { text: "ML", color: "bg-purple-500/20 text-purple-400" },
    "x-ai": { text: "XAI", color: "bg-gray-500/20 text-gray-400" },
    mistralai: { text: "MIS", color: "bg-cyan-500/20 text-cyan-400" },
    nvidia: { text: "NV", color: "bg-lime-500/20 text-lime-400" },
    inclusionai: { text: "INC", color: "bg-pink-500/20 text-pink-400" },
  };

  // Special case: routers
  if (modelId === "openrouter/auto" || slug === "auto") {
    return { text: "AUTO", color: "bg-violet-500/20 text-violet-400" };
  }
  if (modelId === "openrouter/pareto-code") {
    return { text: "PARETO", color: "bg-amber-500/20 text-amber-400" };
  }

  // Special case: free router
  if (modelId === "openrouter/free" || slug === "free") {
    return { text: "FREE", color: "bg-primary/20 text-primary" };
  }

  return badges[provider] ?? { text: provider.slice(0, 3).toUpperCase(), color: "bg-muted text-muted-foreground" };
}