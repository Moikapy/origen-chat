import type { OrigenTool } from "@moikapy/origen";

/**
 * Wikipedia lookup tool for Origen agents.
 * Searches Wikipedia and returns article summaries.
 *
 * Uses the MediaWiki action API with proper User-Agent header,
 * which works from server-side (Cloudflare Workers) environments.
 * The REST API (/api/rest_v1/) blocks server-side requests.
 */
export function createWikipediaTool(): OrigenTool {
  const USER_AGENT = "OrigenChat/1.0 (https://origen-chat.moikapy.workers.dev)";

  return {
    name: "wikipedia_lookup",
    description:
      "Search Wikipedia and return article summaries. Use this when the user asks about topics, people, places, events, or concepts that warrant encyclopedic knowledge.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search term (e.g., 'quantum entanglement', 'Marie Curie')",
        },
        sentences: {
          type: "number",
          description: "Max sentences to return (default 5)",
        },
      },
      required: ["query"],
    },
    execute: async (args: Record<string, unknown>, _getD1) => {
      const query = args.query as string;
      const sentences = (args.sentences as number) ?? 5;
      try {
        // Fetch with 10s timeout to prevent stalling the agent
        const fetchWithTimeout = async (url: string, ms = 10_000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ms);
          try {
            return await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
          } finally {
            clearTimeout(timer);
          }
        };

        // Use the MediaWiki action API with extracts — works server-side with User-Agent
        const url = new URL("https://en.wikipedia.org/w/api.php");
        url.searchParams.set("action", "query");
        url.searchParams.set("list", "search");
        url.searchParams.set("srsearch", query);
        url.searchParams.set("srlimit", "1");
        url.searchParams.set("format", "json");

        const searchRes = await fetchWithTimeout(url.toString());
        if (!searchRes.ok) return `Error searching Wikipedia: ${searchRes.status} ${searchRes.statusText}`;

        const searchData = await searchRes.json() as {
          query?: { search?: Array<{ title: string; snippet?: string }> };
        };
        const results = searchData.query?.search;
        if (!results || results.length === 0) {
          return `No Wikipedia articles found for "${query}".`;
        }

        const title = results[0].title;

        // Get the article extract using the query+extracts module
        const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
        extractUrl.searchParams.set("action", "query");
        extractUrl.searchParams.set("titles", title);
        extractUrl.searchParams.set("prop", "extracts");
        extractUrl.searchParams.set("exintro", "1");
        extractUrl.searchParams.set("explaintext", "1");
        extractUrl.searchParams.set("format", "json");
        extractUrl.searchParams.set("redirects", "1");

        const extractRes = await fetchWithTimeout(extractUrl.toString());
        if (!extractRes.ok) return `Error fetching Wikipedia article for "${title}".`;

        const extractData = await extractRes.json() as {
          query?: { pages?: Record<string, { title?: string; extract?: string }> };
        };

        const pages = extractData.query?.pages;
        if (!pages) return `Wikipedia article "${title}" has no content available.`;

        const page = Object.values(pages)[0];
        const extract = page?.extract;
        if (!extract) return `Wikipedia article "${title}" has no summary available.`;

        // Truncate to requested number of sentences
        const allSentences = extract.split(/(?<=[.!?])\s+/);
        const truncated = allSentences.slice(0, sentences).join(" ");

        return [
          `**${page?.title ?? title}**`,
          "",
          truncated,
          allSentences.length > sentences ? `... (${allSentences.length - sentences} more sentences available)` : "",
          "",
          `Source: https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        ]
          .filter(Boolean)
          .join("\n");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return `Wikipedia lookup timed out for "${query}". Try again later.`;
        }
        return `Wikipedia lookup failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    },
  };
}