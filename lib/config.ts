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

/**
 * Build an AgentConfig from the chat request parameters.
 * Tools are only included for models that support tool use on OpenRouter.
 */
export function buildAgentConfig(config: ChatConfig, getD1: () => Promise<unknown>): AgentConfig {
  const supportsTools = modelSupportsTools(config.model);
  const tools = createTools(supportsTools);

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
    // Wiki and tools both require models that support function/tool calling.
    // Free models and models without tool support will 404 if given tools.
    wiki: config.wiki && supportsTools ? { type: "cloud" as const } : undefined,
    maxSteps: supportsTools ? 10 : 1,
  };
}