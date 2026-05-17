import { getEnv, getSessionId } from "@/lib/api-utils";
import {
  getMemoryFromD1,
  saveMemoryToD1,
  deleteMemoryFromD1,
  clearMemoryFromD1,
  consolidateMemory,
  validateFact,
  MAX_VALUE_LENGTH,
  type MemoryFact,
} from "@/lib/memory-store";
import { requireOrigin } from "@/lib/origin-guard";
import { sanitizeError } from "@/lib/sanitize-error";

// ── Auth helper ────────────────────────────────────────────────

async function authenticate(request: Request): Promise<{ userId: string; env: any } | null> {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;

  const env = await getEnv();
  if (!env.DB) return null;

  const { getSession } = await import("@moikapy/magic-link");
  const result = await getSession(sessionId, {
    db: env.DB,
    encryptKey: env.OPENROUTER_ENCRYPT_KEY,
  });

  if (!result?.user?.id) return null;
  return { userId: result.user.id, env };
}

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// ── GET /api/memory — list all facts for user ──────────────────

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  const facts = await getMemoryFromD1(auth.env.DB, auth.userId);
  return Response.json({ facts });
}

// ── PUT /api/memory — upsert a fact ─────────────────────────────

export async function PUT(request: Request) {
  try {
    // Require valid origin for mutations
    const originError = requireOrigin(request);
    if (originError) return originError;

    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const body = (await request.json()) as { key?: string; value?: string };
    if (!body.key || !body.value) {
      return Response.json({ error: "key and value are required" }, { status: 400 });
    }

    // Enforce strict key format: lowercase snake_case only
    if (!/^[a-z][a-z0-9_-]{0,98}[a-z0-9]$/.test(body.key)) {
      return Response.json({ error: "Key must be lowercase snake_case (letters, numbers, underscores, hyphens)" }, { status: 400 });
    }

    // Enforce value length limit
    if (body.value.length > MAX_VALUE_LENGTH) {
      return Response.json({ error: `Value too long (max ${MAX_VALUE_LENGTH} chars)` }, { status: 400 });
    }

    if (!validateFact({ key: body.key, value: body.value })) {
      return Response.json({ error: "Invalid fact — rejected by validation" }, { status: 400 });
    }

    const now = Date.now();
    const fact: MemoryFact = {
      userId: auth.userId,
      key: body.key,
      value: body.value,
      createdAt: now,
      updatedAt: now,
    };

    await saveMemoryToD1(auth.env.DB, [fact]);
    return Response.json({ ok: true, fact });
  } catch (err) {
    const { message, status } = sanitizeError(err, "memory/put");
    return Response.json({ error: message }, { status });
  }
}

// ── DELETE /api/memory — delete a fact by key ────────────────────

export async function DELETE(request: Request) {
  try {
    // Require valid origin for mutations
    const originError = requireOrigin(request);
    if (originError) return originError;

    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (key) {
      await deleteMemoryFromD1(auth.env.DB, auth.userId, key);
      return Response.json({ ok: true });
    }

    // Delete all memory for user
    await clearMemoryFromD1(auth.env.DB, auth.userId);
    return Response.json({ ok: true });
  } catch (err) {
    const { message, status } = sanitizeError(err, "memory/delete");
    return Response.json({ error: message }, { status });
  }
}

// ── POST /api/memory/consolidate — extract facts from conversation ──

export async function POST(request: Request) {
  try {
    // Require valid origin for mutations
    const originError = requireOrigin(request);
    if (originError) return originError;

    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const body = (await request.json()) as { messages?: Array<{ role: string; content: string }> };
    if (!body.messages || body.messages.length === 0) {
      return Response.json({ error: "messages are required" }, { status: 400 });
    }

    // Get existing facts
    const existing = await getMemoryFromD1(auth.env.DB, auth.userId);

    // For now, we do a simple heuristic extraction.
    // In production, this would call an LLM to extract facts.
    // The consolidation prompt is defined in memory-store.ts for future use.
    const facts = extractFactsFromConversation(body.messages);
    const validFacts = facts
      .filter(validateFact)
      .map(
        (f) =>
          ({
            userId: auth.userId,
            key: f.key,
            value: f.value,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }) as MemoryFact,
      );

    if (validFacts.length === 0) {
      return Response.json({ ok: true, facts: [], message: "No new facts extracted" });
    }

    const merged = consolidateMemory(
      validFacts.map((f) => `${f.key}=${f.value}`).join("\n"),
      existing,
      auth.userId,
    );

    // Save all merged facts
    await saveMemoryToD1(auth.env.DB, merged);
    return Response.json({ ok: true, facts: merged });
  } catch (err) {
    const { message, status } = sanitizeError(err, "memory/consolidate");
    return Response.json({ error: message }, { status });
  }
}

/**
 * Simple heuristic fact extraction from conversation.
 * Extracts stated preferences, names, and project contexts.
 * In production, this would be replaced with an LLM call
 * using CONSOLIDATION_SYSTEM_PROMPT from memory-store.ts.
 */
function extractFactsFromConversation(
  messages: Array<{ role: string; content: string }>,
): Array<{ key: string; value: string }> {
  const facts: Array<{ key: string; value: string }> = [];
  const userMessages = messages.filter((m) => m.role === "user");

  // Extract name if user introduces themselves
  for (const msg of userMessages) {
    const nameMatch = msg.content.match(
      /(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+)/i,
    );
    if (nameMatch && !facts.find((f) => f.key === "name")) {
      facts.push({ key: "name", value: nameMatch[1] });
    }
  }

  // Extract project context from recent conversation
  for (const msg of userMessages) {
    const projectMatch = msg.content.match(
      /(?:working on|building|developing|my project is)\s+([^.!?\n]{3,50})/i,
    );
    if (projectMatch && !facts.find((f) => f.key === "project")) {
      facts.push({ key: "project", value: projectMatch[1].trim() });
    }
  }

  return facts.slice(0, 5); // Max 5 facts per consolidation
}