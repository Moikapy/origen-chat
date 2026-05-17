import { getSessionId, getEnv } from "@/lib/api-utils";
import { requireOrigin } from "@/lib/origin-guard";
import { sanitizeError } from "@/lib/sanitize-error";

/** GET /api/sessions — list all sessions for authenticated user */
export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  try {
    const db = auth.env.DB;
    const results = await db
      .prepare("SELECT id, title, model, system_prompt, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC")
      .bind(auth.userId)
      .all();

    return Response.json({ sessions: results.results });
  } catch (err) {
    const { message, status } = sanitizeError(err, "sessions/list");
    return Response.json({ error: message }, { status });
  }
}

/** POST /api/sessions — upsert a session for authenticated user */
export async function POST(request: Request) {
  try {
    // Require valid origin for mutations
    const originError = requireOrigin(request);
    if (originError) return originError;

    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const body = await request.json() as {
      id?: string;
      title?: string;
      model?: string;
      systemPrompt?: string;
      messages?: unknown[];
      updatedAt?: number;
    };

    if (!body.id || !body.model) {
      return Response.json({ error: "id and model are required" }, { status: 400 });
    }

    const db = auth.env.DB;

    // Upsert: insert or replace
    await db
      .prepare(
        `INSERT OR REPLACE INTO chat_sessions (id, user_id, title, model, system_prompt, messages, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        body.id,
        auth.userId,
        body.title || "New chat",
        body.model,
        body.systemPrompt || null,
        JSON.stringify(body.messages || []),
        body.updatedAt ? Math.floor(body.updatedAt / 1000) : Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000)
      )
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    const { message, status } = sanitizeError(err, "sessions/upsert");
    return Response.json({ error: message }, { status });
  }
}

/** DELETE /api/sessions?id=xxx — delete a session */
export async function DELETE(request: Request) {
  try {
    // Require valid origin for mutations
    const originError = requireOrigin(request);
    if (originError) return originError;

    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const db = auth.env.DB;
    await db
      .prepare("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?")
      .bind(id, auth.userId)
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    const { message, status } = sanitizeError(err, "sessions/delete");
    return Response.json({ error: message }, { status });
  }
}

// ── Auth helpers ────────────────────────────────────────

async function authenticate(request: Request): Promise<{ userId: string; env: any } | null> {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;

  const env = await getEnv();
  if (!env.DB) return null;

  // Verify session is valid
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