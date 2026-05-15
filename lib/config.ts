import { type OrigenTool, type ModelId, type AgentConfig, type D1Like } from "@moikapy/origen";
import { createWikipediaTool } from "./tools/wikipedia";

export interface ChatConfig {
  model: ModelId | string;
  wiki: boolean;
  provider: string;
  apiKey: string;
  ollamaBaseUrl?: string;
}

/**
 * Is this model free on OpenRouter?
 * Free models typically don't support tool use.
 */
function isFreeModel(model: string): boolean {
  return model === "free" || model === "openrouter/free" || model.endsWith(":free");
}

/**
 * Build an AgentConfig from the chat request parameters.
 */
export function buildAgentConfig(config: ChatConfig, getD1: () => Promise<unknown>): AgentConfig {
  // Free models generally don't support tool use — skip tools for them
  const skipTools = isFreeModel(config.model);

  const tools: OrigenTool[] = skipTools ? [] : [createWikipediaTool()];

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
    wiki: config.wiki ? { type: "cloud" as const } : undefined,
    maxSteps: skipTools ? 1 : 10,
  };
}