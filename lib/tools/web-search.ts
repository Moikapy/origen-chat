import type { OrigenTool } from "@moikapy/origen";

/**
 * Web search tool for Origen agents.
 * Searches the web and returns summarized results.
 *
 * Uses DuckDuckGo's HTML search (no API key needed, works from Workers).
 * Falls back to extracting key content from top results.
 */
export function createWebSearchTool(): OrigenTool {
  const USER_AGENT =
    "Mozilla/5.0 (compatible; OrigenChat/1.0; +https://origen-chat.moikapy.workers.dev)";

  return {
    name: "web_search",
    description:
      "Search the web for current information. Use this when you need up-to-date facts, news, prices, or information that may have changed after your training cutoff. Returns top results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query (e.g., 'current price of Bitcoin', 'latest news on AI regulation')",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default 5, max 8)",
        },
      },
      required: ["query"],
    },
    execute: async (
      args: Record<string, unknown>,
      _getD1: () => Promise<unknown>,
    ): Promise<string> => {
      const query = args.query as string;
      const maxResults = Math.min((args.max_results as number) ?? 5, 8);

      try {
        // DuckDuckGo HTML search — no API key needed, works from Workers
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);

        const res = await fetch(searchUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html",
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          return `Web search failed: ${res.status} ${res.statusText}`;
        }

        const html = await res.text();

        // Parse DuckDuckGo HTML results
        // Result links are in <a class="result__a"> elements
        // Snippets are in <a class="result__snippet">
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const seenUrls = new Set<string>();

        // Extract result blocks using regex (DDG HTML structure)
        const resultRegex =
          /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snippetRegex =
          /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        const urlRegex =
          /uddg=([^&"']+)/i;

        // Find all result links
        let match: RegExpExecArray | null;
        const titles: Array<{ url: string; title: string }> = [];

        while ((match = resultRegex.exec(html)) !== null && titles.length < maxResults) {
          let rawUrl = match[1];
          const title = match[2
            ].replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .trim();

          // DDG wraps actual URLs in uddg= parameter
          const urlMatch = rawUrl.match(urlRegex);
          if (urlMatch) {
            rawUrl = decodeURIComponent(urlMatch[1]);
          }

          // Skip DDG internal redirects and ad links
          if (
            rawUrl.startsWith("/") ||
            rawUrl.includes("duckduckgo.com") ||
            rawUrl.includes("yandex.ru") ||
            seenUrls.has(rawUrl)
          ) {
            continue;
          }

          seenUrls.add(rawUrl);
          titles.push({ url: rawUrl, title });
        }

        // Extract snippets
        const snippets: string[] = [];
        while ((match = snippetRegex.exec(html)) !== null) {
          snippets.push(
            match[1]
              .replace(/<[^>]+>/g, "")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .trim(),
          );
        }

        // Combine titles + snippets
        for (let i = 0; i < titles.length; i++) {
          results.push({
            title: titles[i].title,
            url: titles[i].url,
            snippet: snippets[i] || "",
          });
        }

        if (results.length === 0) {
          return `No web search results found for "${query}". Try a different search term.`;
        }

        // Format results
        const formatted = results
          .map(
            (r, i) =>
              `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`,
          )
          .join("\n\n");

        return [
          `Web search results for "${query}":`,
          "",
          formatted,
          "",
          `Retrieved ${new Date().toISOString().split("T")[0]}. Results may not be comprehensive.`,
        ].join("\n");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return `Web search timed out for "${query}". Try again later.`;
        }
        return `Web search failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    },
  };
}