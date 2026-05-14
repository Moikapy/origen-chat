/**
 * Static model registry for the client.
 * Mirrors @moikapy/origen MODELS but doesn't import Node.js modules.
 */

export interface UIModel {
  name: string;
  description: string;
  free: boolean;
}

export const MODELS: Record<string, UIModel> = {
  "openrouter/free": { name: "Free", description: "Free tier (various models)", free: true },
  "openrouter/deepseek/deepseek-chat-v3-0324:free": { name: "DeepSeek V3", description: "DeepSeek Chat V3 (free)", free: true },
  "openrouter/deepseek/deepseek-r1:free": { name: "DeepSeek R1", description: "DeepSeek R1 reasoning (free)", free: true },
  "openrouter/google/gemini-2.0-flash-exp:free": { name: "Gemini 2.0 Flash", description: "Google Gemini Flash (free)", free: true },
  "openrouter/anthropic/claude-sonnet-4": { name: "Claude Sonnet 4", description: "Anthropic Claude Sonnet 4", free: false },
  "openrouter/anthropic/claude-opus-4": { name: "Claude Opus 4", description: "Anthropic Claude Opus 4", free: false },
  "openrouter/openai/gpt-4o": { name: "GPT-4o", description: "OpenAI GPT-4o", free: false },
  "openrouter/openai/gpt-4.1-mini": { name: "GPT-4.1 Mini", description: "OpenAI GPT-4.1 Mini", free: false },
  "openrouter/openai/o3-mini": { name: "O3 Mini", description: "OpenAI O3 Mini reasoning", free: false },
  "openrouter/google/gemini-2.5-pro": { name: "Gemini 2.5 Pro", description: "Google Gemini 2.5 Pro", free: false },
  "openrouter/meta-llama/llama-4-maverick": { name: "Llama 4 Maverick", description: "Meta Llama 4 Maverick", free: false },
};

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