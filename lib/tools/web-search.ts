import type { OrigenTool } from "@moikapy/origen";

/**
 * Web search tool for Origen agents.
 * Searches DuckDuckGo, then fetches + extracts text from top results.
 * No API key needed — works from Cloudflare Workers.
 */
export function createWebSearchTool(): OrigenTool {
  const USER_AGENT =
    "Mozilla/5.0 (compatible; OrigenChat/1.0; +https://origen-chat.moikapy.workers.dev)";

  return {
    name: "web_search",
    description:
      "Search the web for current information. Use this when you need up-to-date facts, news, weather, prices, or any information that may have changed after your training cutoff. Fetches and extracts content from the top results so you get real answers, not just links.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query (e.g., 'weather Louisville KY today', 'current price of Bitcoin')",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (default 3, max 5)",
        },
      },
      required: ["query"],
    },
    execute: async (
      args: Record<string, unknown>,
      _getD1: () => Promise<unknown>,
    ): Promise<string> => {
      const query = args.query as string;
      const maxResults = Math.min((args.max_results as number) ?? 3, 5);

      try {
        // Step 1: Search DuckDuckGo HTML
        const searchResults = await searchDuckDuckGo(query, maxResults);
        if (searchResults.length === 0) {
          return `No web search results found for "${query}". Try a different search term.`;
        }

        // Step 2: Fetch content from the top result(s)
        // Prioritize the best-matching URL for content extraction
        const contentResults = await fetchResultContent(searchResults);

        // Step 3: Format output
        const formatted = contentResults
          .map(
            (r, i) =>
              [
                `${i + 1}. **${r.title}**`,
                `   ${r.url}`,
                r.content ? `   ${r.content}` : r.snippet ? `   ${r.snippet}` : "   (no content available)",
              ].join("\n"),
          )
          .join("\n\n");

        return [
          `Web search results for "${query}":`,
          "",
          formatted,
          "",
          `Retrieved ${new Date().toISOString().split("T")[0]}.`,
        ].join("\n");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return `Web search timed out for "${query}". Try again later.`;
        }
        return `Web search failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    },
  };

  /** Search DuckDuckGo HTML and return structured results */
  async function searchDuckDuckGo(
    query: string,
    maxResults: number,
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];

    const html = await res.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const seenUrls = new Set<string>();

    const resultRegex =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex =
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const urlRegex = /uddg=([^&"']+)/i;

    // Extract titles + URLs
    let match: RegExpExecArray | null;
    const titles: Array<{ url: string; title: string }> = [];

    while ((match = resultRegex.exec(html)) !== null && titles.length < maxResults) {
      let rawUrl = match[1];
      const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, "")).trim();

      const urlMatch = rawUrl.match(urlRegex);
      if (urlMatch) rawUrl = decodeURIComponent(urlMatch[1]);

      if (
        rawUrl.startsWith("/") ||
        rawUrl.includes("duckduckgo.com") ||
        rawUrl.includes("yandex.ru") ||
        seenUrls.has(rawUrl)
      ) continue;

      seenUrls.add(rawUrl);
      titles.push({ url: rawUrl, title });
    }

    // Extract snippets
    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")).trim());
    }

    for (let i = 0; i < titles.length; i++) {
      results.push({
        title: titles[i].title,
        url: titles[i].url,
        snippet: snippets[i] || "",
      });
    }

    return results;
  }

  /** Fetch and extract text content from the top search results */
  async function fetchResultContent(
    results: Array<{ title: string; url: string; snippet: string }>,
  ): Promise<Array<{ title: string; url: string; snippet: string; content: string | null }>> {
    const enriched = results.map((r) => ({
      ...r,
      content: null as string | null,
    }));

    // Fetch content from the top result only (avoid hammering servers)
    // Use a reasonable timeout — 6 seconds per page
    const topUrl = results[0]?.url;
    if (!topUrl) return enriched;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);

      const pageRes = await fetch(topUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!pageRes.ok) return enriched;

      const html = await pageRes.text();
      const extracted = extractTextFromHtml(html);

      if (extracted.length > 100) {
        // Truncate to ~2000 chars to keep the tool response compact
        enriched[0].content =
          extracted.length > 2000 ? extracted.substring(0, 2000) + "..." : extracted;
      }
    } catch {
      // Content extraction failed — that's fine, snippets are still available
    }

    return enriched;
  }

  /** Extract readable text from HTML, stripping scripts, styles, tags */
  function extractTextFromHtml(html: string): string {
    // Remove script, style, nav, footer, header blocks
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[\s\S]*?<\/aside>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

    // Convert common block elements to newlines
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, " ");

    // Strip remaining tags
    text = text.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    text = decodeHtmlEntities(text);

    // Collapse whitespace but preserve line breaks
    text = text
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return text;
  }

  /** Decode common HTML entities */
  function decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
  }
}