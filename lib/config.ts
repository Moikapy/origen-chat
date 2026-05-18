import { type ModelId, type AgentConfig, type D1Like, type MemoryProvider, type MemoryFact, type PeerProvider, type PeersConfig, type WikiProviderEntry, CloudWikiProvider } from "@moikapy/origen";
import { modelSupportsTools } from "./models";
import { createTools } from "./tools";

export interface ChatConfig {
  model: ModelId | string;
  wiki: boolean;
  systemPrompt?: string;
  provider: string;
  apiKey: string;
  ollamaBaseUrl?: string;
  memory?: MemoryProvider;
  peerProvider?: PeerProvider;
  userId?: string;
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

  // Free models: max 1 tool call (2 steps = initial + tool response).
  // More than that burns through the 20 req/min free tier instantly.
  // Premium: up to 5 tool calls (10 steps).
  // No tool support: 1 step (single LLM call).
  const maxSteps = !supportsTools ? 1 : isFree ? 2 : 10;

  // ── Wiki configuration (v2: named providers) ──────────────────────────
  // Authenticated users get two wikis: a shared "canon" and a personal one
  // isolated by their userId. Anonymous users get a single shared "wiki".
  // Security by construction: each provider only sees its own data.
  let wiki: WikiProviderEntry[] | undefined;
  if (config.wiki && supportsTools && !isFree) {
    const d1Provider = async () => {
      const d1 = await getD1();
      return d1 as any;
    };

    if (config.userId) {
      // Authenticated user: canon (shared truths) + personal (user-isolated)
      wiki = [
        { name: "canon", description: "Core truths and verified knowledge. Read carefully.", provider: new CloudWikiProvider(d1Provider) },
        { name: "personal", description: "Your private notes and observations. Only you can see this.", provider: new CloudWikiProvider(d1Provider, { where: "user_id = ?", whereParams: [config.userId] }) },
      ];
    } else {
      // Anonymous user: single shared wiki
      wiki = [
        { name: "wiki", description: "Knowledge base", provider: new CloudWikiProvider(d1Provider) },
      ];
    }
  }

  return {
    appName: "Origen Chat",
    systemPrompt: config.systemPrompt,
    model: config.model as ModelId,
    tools,
    getD1: getD1 as () => Promise<D1Like>,
    getApiKey: async (provider: string) => {
      if (config.provider === provider) return config.apiKey;
      return undefined;
    },
    ollamaBaseUrl: config.ollamaBaseUrl,
    wiki,
    memory: config.memory,
    peers: config.peerProvider ? {
      peerProvider: config.peerProvider,
      reasoningModel: "openrouter/google/gemini-2.0-flash-001" as ModelId,
      peerIds: config.userId ? [`user:${config.userId}`] : ["user:default"],
      selfPeerId: "agent:origen-chat",
      autoBuild: true,
    } satisfies PeersConfig : undefined,
    maxSteps,
  };
}