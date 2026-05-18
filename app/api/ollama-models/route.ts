import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for Ollama model listing.
 *
 * The browser can't call ollama.com directly (no CORS headers).
 * Cloud Ollama model requests route through here to /v1/models.
 * Local Ollama requests also route through here to avoid
 * OLLAMA_ORIGINS configuration on the user's machine.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { baseUrl?: string; apiKey?: string };
    const { baseUrl, apiKey } = body;

    if (!baseUrl) {
      return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });
    }

    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const url = `${baseUrl.replace(/\/+$/, "")}/models`;

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: `Ollama returned ${res.status}`, details: data },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}