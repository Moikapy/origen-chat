import { streamOrigen, type StreamEvent } from "@moikapy/origen";
import { buildAgentConfig, type ChatConfig } from "@/lib/config";
import { getApiKeyFromCookie } from "@moikapy/openrouter-auth/next";

// No edge runtime — Cloudflare Workers with nodejs_compat handles Node.js APIs
export const maxDuration = 60;

interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model: string;
  wiki: boolean;
  ollamaBaseUrl?: string;
  ollamaApiKey?: string;
}

/**
 * Is this model free on OpenRouter?
 * Free models have the ":free" suffix or are the "openrouter/free" router.
 * They cost $0 to call but still require an API key for authentication.
 */
function isFreeModel(model: string): boolean {
  return model === "openrouter/free" || model.endsWith(":free") || model.startsWith("openrouter/free");
}

/** Get Cloudflare Workers env (with fallback for local dev) */
async function getEnv(): Promise<Record<string, string | undefined>> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    const { env } = await getCloudflareContext();
    return env as Record<string, string | undefined>;
  } catch {
    // Local dev fallback — use process.env
    return {
      OPENROUTER_ENCRYPT_KEY: process.env.OPENROUTER_ENCRYPT_KEY,
      OPENROUTER_ENCRYPT_KEY_PREVIOUS: process.env.OPENROUTER_ENCRYPT_KEY_PREVIOUS,
      OPENROUTER_FREE_KEY: process.env.OPENROUTER_FREE_KEY,
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  const body: ChatRequest = await request.json();
  const { messages, model, wiki, ollamaBaseUrl, ollamaApiKey } = body;

  const env = await getEnv();

  // 1. Try user's own key (OpenRouter OAuth cookie)
  const cookieApiKey = await getApiKeyFromCookie({
    encryptKey: env.OPENROUTER_ENCRYPT_KEY!,
    previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS?.split(","),
  });

  // 2. Try client-passed Ollama key
  const userKey = cookieApiKey || ollamaApiKey || "";

  // 3. Determine final API key
  const freeModel = isFreeModel(model);
  const serverFreeKey = env.OPENROUTER_FREE_KEY || "";

  let apiKey: string;
  let provider: string;

  if (ollamaBaseUrl) {
    // User is connecting to their own Ollama instance
    provider = "ollama";
    apiKey = userKey;
  } else if (userKey) {
    // User has their own OpenRouter key (OAuth or manual)
    provider = "openrouter";
    apiKey = userKey;
  } else if (freeModel && serverFreeKey) {
    // No user key, but model is free and we have a server key
    provider = "openrouter";
    apiKey = serverFreeKey;
  } else if (freeModel) {
    // Free model but no server key configured — still need auth
    return new Response(
      JSON.stringify({
        error: "No API key. Sign in or add an OpenRouter key in Settings. Free models need an account but cost $0.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  } else {
    // Premium model, no key at all
    return new Response(
      JSON.stringify({
        error: "No API key. Premium models require an OpenRouter key. Sign in via Settings.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const config = buildAgentConfig(
    { model, wiki, provider, apiKey, ollamaBaseUrl } as ChatConfig,
    async () => {
      throw new Error("D1 not configured");
    },
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamOrigen(messages, undefined, config, apiKey)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const errorEvent: StreamEvent = {
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}