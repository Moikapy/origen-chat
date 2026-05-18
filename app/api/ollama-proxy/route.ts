/**
 * Ollama Cloud Proxy — proxies requests to api.ollama.com
 *
 * The browser can't call ollama.com directly (no CORS headers).
 * This route proxies requests, adding Bearer auth from the request body.
 * Local Ollama (localhost:11434) calls go directly from the browser.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { path?: string; method?: string; apiKey?: string; body?: unknown };
    const { path, method = "POST", apiKey, body: ollamaBody } = body;

    if (!path) {
      return new Response(JSON.stringify({ error: "Missing path" }), { status: 400 });
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401 });
    }

    // Only allow specific Ollama API paths
    const allowedPaths = ["/api/chat", "/api/generate", "/api/tags", "/api/show", "/api/embeddings"];
    if (!allowedPaths.some((p) => path.startsWith(p))) {
      return new Response(JSON.stringify({ error: "Path not allowed" }), { status: 403 });
    }

    const url = `https://ollama.com${path}`;
    const reqBody = ollamaBody || body;

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const contentType = res.headers.get("Content-Type") || "application/json";
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { "Content-Type": contentType },
      });
    }

    // Streaming responses (chat, generate) — proxy the NDJSON stream
    if (path === "/api/chat" || path === "/api/generate") {
      return new Response(res.body, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
        },
      });
    }

    // JSON responses (tags, show, embeddings)
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Proxy error" }),
      { status: 500 }
    );
  }
}