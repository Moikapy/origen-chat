import { streamOrigen, type StreamEvent } from "@moikapy/origen";
import { buildAgentConfig, type ChatConfig } from "@/lib/config";
import { isFreeModel as checkIsFreeModel, stripOpenrouterPrefix } from "@/lib/models";
import { getApiKeyFromCookie } from "@moikapy/openrouter-auth/next";
import { validateChatRequest, checkRateLimit, ensureRateLimitTable } from "@/lib/security";

// No edge runtime — Cloudflare Workers with nodejs_compat handles Node.js APIs
export const maxDuration = 60;

interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model: string;
  wiki: boolean;
  ollamaBaseUrl?: string;
  ollamaApiKey?: string;
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
  try {
    return await handleChatRequest(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleChatRequest(request: Request): Promise<Response> {
  const body: ChatRequest = await request.json();

  // ── Input validation ──
  const validation = validateChatRequest(body);
  if (!validation.ok) {
    return new Response(
      JSON.stringify({ error: validation.error }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const env = await getEnv();

  // ── Rate limiting (per-IP via D1) ──
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const d1 = (env as Record<string, unknown>).DB as any;
  if (d1) {
    await ensureRateLimitTable(d1);
    let hasAuthKey = !!(body.ollamaApiKey);
    let userId: string | null = null;
    try {
      if (env.OPENROUTER_ENCRYPT_KEY) {
        const ck = await getApiKeyFromCookie({
          encryptKey: env.OPENROUTER_ENCRYPT_KEY,
          previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS?.split(","),
        });
        hasAuthKey = !!(ck || body.ollamaApiKey);
        // Use API key prefix as user identifier (unique per OAuth session)
        if (ck) userId = "u-" + ck.substring(0, 8);
      }
    } catch { /* cookies() unavailable, treat as unauthenticated */ }
    const rateResult = await checkRateLimit(d1, ip, hasAuthKey, userId);
    if (!rateResult.allowed) {
      const retryAfterSec = Math.ceil((rateResult.resetAt - Date.now()) / 1000);
      return new Response(
        JSON.stringify({
          error: `Rate limit reached. ${hasAuthKey ? "" : "Sign in for higher limits. "}Try again in ${retryAfterSec}s.`,
          retryAfter: retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSec),
          },
        },
      );
    }
  }

  // Strip openrouter/ prefix for API calls
  const { messages, model, wiki, ollamaBaseUrl, ollamaApiKey } = body;
  const apiModel = stripOpenrouterPrefix(model);

  // 1. Try user's own key (OpenRouter OAuth cookie)
  let cookieApiKey: string | null = null;
  try {
    if (env.OPENROUTER_ENCRYPT_KEY) {
      cookieApiKey = await getApiKeyFromCookie({
        encryptKey: env.OPENROUTER_ENCRYPT_KEY,
        previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS?.split(","),
      });
    }
  } catch {
    // Cookie decryption failed or cookies() unavailable — treat as no user key
  }

  // 2. Try client-passed Ollama key
  const userKey = cookieApiKey || ollamaApiKey || "";

  // 3. Determine final API key
  const freeModel = checkIsFreeModel(model);
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
    { model: apiModel, wiki, provider, apiKey, ollamaBaseUrl } as ChatConfig,
    async () => {
      // D1 binding from Cloudflare Workers env
      const d1 = (env as Record<string, unknown>).DB as any;
      if (!d1) throw new Error("D1 database not available");
      return d1 as any;
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
        const errorMsg = err instanceof Error ? err.message : String(err);
        
        // Detect rate limit errors (both direct 429s and stream-read errors caused by rate limiting)
        const is429 = errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Rate limit') || errorMsg.includes('free-models-per-min');
        const isStreamError = errorMsg.includes('body stream already read') || errorMsg.includes('Failed to fetch');
        
        const userMessage = is429
          ? 'Rate limit reached. Free models allow ~20 requests/min. Sign in with OpenRouter for higher limits, or wait 60 seconds.'
          : isStreamError
          ? 'Connection interrupted — this usually means a rate limit was hit. Wait a moment and try again, or sign in for higher limits.'
          : `Error: ${errorMsg}`;
        
        const errorEvent: StreamEvent = {
          type: "error",
          message: userMessage,
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