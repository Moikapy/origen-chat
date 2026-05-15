import { type ModelId, type AgentConfig, type D1Like } from "@moikapy/origen";
import { modelSupportsTools } from "./models";
import { createTools } from "./tools";

export interface ChatConfig {
  model: ModelId | string;
  wiki: boolean;
  provider: string;
  apiKey: string;
  ollamaBaseUrl?: string;
}

/** Check if a model is a free model on OpenRouter. */
function isFreeModelId(model: string): boolean {
  return model === "free" || model.endsWith(":free");
}

/**
 * Build an AgentConfig from the chat request parameters.
 * Free models get fewer agent steps and no wiki tools to reduce API calls
 * and avoid hitting the free tier rate limit (~20 req/min).
 */
export function buildAgentConfig(config: ChatConfig, getD1: () => Promise<unknown>): AgentConfig {
  const supportsTools = modelSupportsTools(config.model);
  const isFree = isFreeModelId(config.model);
  const tools = createTools(supportsTools);
  const isOllama = config.provider === "ollama";

  // Free models: max 1 tool call (2 steps = initial + tool response).
  // More than that burns through the 20 req/min free tier instantly.
  // Premium: up to 5 tool calls (10 steps).
  // No tool support: 1 step (single LLM call).
  const maxSteps = !supportsTools ? 1 : isFree ? 2 : 10;

  return {
    appName: "Origen Chat",
    model: config.model as ModelId,
    tools,
    getD1: getD1 as () => Promise<D1Like>,
    getApiKey: async (provider: string) => {
      if (config.provider === provider) return config.apiKey;
      return undefined;
    },
    ollamaBaseUrl: config.ollamaBaseUrl,
    // Wiki tools require D1 + multiple API calls. Skip for free models
    // to avoid rate limiting. Premium users get the full wiki experience.
    wiki: config.wiki && supportsTools && !isFree ? { type: "cloud" as const } : undefined,
    maxSteps,
    // OpenRouter plugins: response-healing auto-retries on malformed responses
    onPayload: !isOllama ? (params: Record<string, unknown>) => {
      // OpenRouter response-healing plugin fixes truncated/malformed responses
      // Only applies to OpenRouter calls (not Ollama)
      (params as any).plugins = [{ id: "response-healing" }];
      return params;
    } : undefined,
  };
}