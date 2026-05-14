import { streamOrigen, type StreamEvent, type OrigenTool, type AgentConfig, type D1Like } from "@moikapy/origen";
import { buildAgentConfig, type ChatConfig } from "@/lib/config";

// No edge runtime — Cloudflare Workers with nodejs_compat handles Node.js APIs
export const maxDuration = 60;

interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model: string;
  wiki: boolean;
  provider: string;
  apiKey: string;
  ollamaBaseUrl?: string;
}

export async function POST(request: Request): Promise<Response> {
  const body: ChatRequest = await request.json();

  const { messages, model, wiki, provider, apiKey, ollamaBaseUrl } = body;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = buildAgentConfig(
    { model, wiki, provider, apiKey, ollamaBaseUrl } as ChatConfig,
    async () => {
      // D1 binding stub — will be replaced with real binding in wrangler.toml
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