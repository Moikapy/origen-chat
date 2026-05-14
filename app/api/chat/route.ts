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

export async function POST(request: Request): Promise<Response> {
  const body: ChatRequest = await request.json();
  const { messages, model, wiki, ollamaBaseUrl, ollamaApiKey } = body;

  // Get API key from encrypted cookie (OpenRouter OAuth) or fall back to client-passed
  const cookieApiKey = await getApiKeyFromCookie({
    encryptKey: process.env.OPENROUTER_ENCRYPT_KEY!,
    previousKeys: process.env.OPENROUTER_ENCRYPT_KEY_PREVIOUS?.split(","),
  });

  const apiKey = cookieApiKey || ollamaApiKey || "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "No API key. Sign in via Settings or provide an Ollama key." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provider = ollamaBaseUrl ? "ollama" : "openrouter";
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