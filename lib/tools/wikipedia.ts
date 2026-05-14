import type { OrigenTool } from "@moikapy/origen";

/**
 * Wikipedia lookup tool for Origen agents.
 * Searches Wikipedia and returns article summaries.
 */
export function createWikipediaTool(): OrigenTool {
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
        // Step 1: Search Wikipedia
        const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
        searchUrl.searchParams.set("action", "opensearch");
        searchUrl.searchParams.set("search", query);
        searchUrl.searchParams.set("limit", "5");
        searchUrl.searchParams.set("format", "json");
        searchUrl.searchParams.set("origin", "*");

        const searchRes = await fetch(searchUrl.toString());
        if (!searchRes.ok) return `Error searching Wikipedia: ${searchRes.statusText}`;

        const searchData = await searchRes.json() as [string, string[], string[], string[]];
        const titles = searchData[1];
        if (!titles || titles.length === 0) {
          return `No Wikipedia articles found for "${query}".`;
        }

        // Step 2: Get summary of best match
        const bestMatch = titles[0];
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestMatch)}`;
        const summaryRes = await fetch(summaryUrl);
        if (!summaryRes.ok) return `Error fetching Wikipedia summary for "${bestMatch}".`;

        const summary = await summaryRes.json() as {
          title?: string;
          extract?: string;
          description?: string;
          url?: string;
        };

        if (!summary.extract) {
          return `Wikipedia article "${bestMatch}" has no summary available.`;
        }

        // Step 3: Truncate to sentences
        const allSentences = summary.extract.split(/(?<=[.!?])\s+/);
        const truncated = allSentences.slice(0, sentences).join(" ");

        return [
          `**${summary.title ?? bestMatch}**`,
          summary.description ? `*${summary.description}*` : "",
          "",
          truncated,
          allSentences.length > sentences ? `... (${allSentences.length - sentences} more sentences)` : "",
          "",
          `Source: ${summary.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(bestMatch)}`}`,
        ]
          .filter(Boolean)
          .join("\n");
      } catch (err) {
        return `Wikipedia lookup failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    },
  };
}