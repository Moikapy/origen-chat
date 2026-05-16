/**
 * LLM-Based Memory Consolidation
 *
 * After each conversation, extracts key facts about the user
 * using a lightweight LLM call, validates them, and saves to memory.
 *
 * This is the "closed learning loop" — the agent gets smarter
 * about each user over time without manual intervention.
 *
 * Design doc: docs/superpowers/specs/2026-05-16-llm-consolidation-design.md
 */

import type { MemoryProvider, MemoryFact } from "@moikapy/origen";
import {
  CONSOLIDATION_SYSTEM_PROMPT,
  extractFacts,
  validateFact,
} from "./memory-store";

/** Rate limit: max 1 consolidation per user per minute */
const CONSOLIDATION_COOLDOWN_MS = 60_000;
const consolidationTimestamps = new Map<string, number>();

/** Max messages to send to the consolidation LLM */
const MAX_MESSAGES = 10;

/**
 * Consolidate a conversation into memory facts.
 *
 * Fire-and-forget: call this after the chat response completes.
 * If it fails, silently skip — memory is additive, not critical-path.
 *
 * @param messages Recent conversation messages (last 10 recommended)
 * @param memory MemoryProvider for the authenticated user
 * @param apiKey OpenRouter API key to use for the consolidation call
 * @param userId User ID for rate limiting
 * @param model Model to use (defaults to free router for cost)
 */
export async function consolidateConversation(
  messages: Array<{ role: string; content: string }>,
  memory: MemoryProvider,
  apiKey: string,
  userId: string,
  model: string = "openrouter/free",
): Promise<{ facts: MemoryFact[]; skipped: boolean }> {
  // Rate limit check
  const lastRun = consolidationTimestamps.get(userId) ?? 0;
  if (Date.now() - lastRun < CONSOLIDATION_COOLDOWN_MS) {
    return { facts: [], skipped: true };
  }
  consolidationTimestamps.set(userId, Date.now());

  // Only consolidate if there are user messages
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) {
    return { facts: [], skipped: false };
  }

  try {
    // Build the consolidation prompt
    const recent = messages.slice(-MAX_MESSAGES);
    const userPrompt = recent
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    // Call the LLM for fact extraction
    const llmOutput = await callConsolidationLLM(userPrompt, apiKey, model);

    if (!llmOutput.trim()) {
      return { facts: [], skipped: false };
    }

    // Extract facts from LLM output
    const rawFacts = extractFacts(llmOutput);

    // Validate each fact
    const validFacts = rawFacts.filter(validateFact);

    if (validFacts.length === 0) {
      return { facts: [], skipped: false };
    }

    // Save facts directly via MemoryProvider
    // D1 INSERT OR REPLACE handles deduplication by (user_id, key) PK
    const now = Date.now();
    for (const f of validFacts) {
      await memory.saveFact(f.key, f.value);
    }

    const newFacts: MemoryFact[] = validFacts.map((f) => ({
      key: f.key,
      value: f.value,
      userId,
      createdAt: now,
      updatedAt: now,
    }));

    return { facts: newFacts, skipped: false };
  } catch {
    // Best-effort — silently skip on any error
    return { facts: [], skipped: false };
  }
}

/**
 * Call the LLM for fact extraction.
 * Uses the OpenRouter chat completions API with a small, cheap model.
 */
async function callConsolidationLLM(
  conversationText: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: CONSOLIDATION_SYSTEM_PROMPT },
          { role: "user", content: `Conversation:\n${conversationText}\n\nExtract key facts about this user:` },
        ],
        max_tokens: 200,
        temperature: 0.1, // Low temperature for structured extraction
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return ""; // Best-effort
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? "";
  } catch {
    return ""; // Best-effort
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build a simple MemoryProvider from save/load functions.
 * Used by the chat route to wire D1 storage into the agent.
 */
export function createD1MemoryProvider(
  db: D1Database,
  userId: string,
): MemoryProvider {
  return {
    getFacts: async () => {
      try {
        return await getMemoryFromD1(db, userId);
      } catch {
        return [];
      }
    },
    saveFact: async (key, value) => {
      await db
        .prepare(
          "INSERT OR REPLACE INTO user_memory (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(userId, key, value, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000))
        .run();
    },
    deleteFact: async (key) => {
      await db
        .prepare("DELETE FROM user_memory WHERE user_id = ? AND key = ?")
        .bind(userId, key)
        .run();
    },
    searchFacts: async (query) => {
      try {
        const results = await db
          .prepare(
            "SELECT key, value, created_at, updated_at FROM user_memory WHERE user_id = ? AND (key LIKE ? OR value LIKE ?) ORDER BY updated_at DESC",
          )
          .bind(userId, `%${query}%`, `%${query}%`)
          .all();
        return (results.results as any[]).map((r) => ({
          key: r.key,
          value: r.value,
          userId,
          createdAt: r.created_at * 1000,
          updatedAt: r.updated_at * 1000,
        }));
      } catch {
        return [];
      }
    },
  };
}

/** Re-export getMemoryFromD1 for the provider */
async function getMemoryFromD1(
  db: D1Database,
  userId: string,
): Promise<MemoryFact[]> {
  const results = await db
    .prepare(
      "SELECT key, value, created_at, updated_at FROM user_memory WHERE user_id = ? ORDER BY updated_at DESC",
    )
    .bind(userId)
    .all();

  return (results.results as any[]).map((r) => ({
    key: r.key,
    value: r.value,
    userId,
    createdAt: r.created_at * 1000,
    updatedAt: r.updated_at * 1000,
  }));
}