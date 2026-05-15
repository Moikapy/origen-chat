/**
 * IndexedDB session store for Origen Chat.
 * Stores conversation sessions with messages, model, and metadata.
 *
 * DB: origen-sessions
 * Object store: sessions (keyed by id, index on updatedAt)
 */

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: string }>;
  citations?: Array<{ book: string; chapter: number; verse: number }>;
  usage?: { promptTokens?: number; completionTokens?: number; totalCost?: number };
  streaming?: boolean;
  isError?: boolean;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  systemPrompt?: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "origen-sessions";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Create a new empty session */
export function createSession(model: string): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Get a single session by ID */
export async function getSession(id: string): Promise<Session | null> {
  return withStore("readonly", (store) => store.get(id));
}

/** Save a session (create or update) */
export async function saveSession(session: Session): Promise<void> {
  await withStore("readwrite", (store) => store.put(session));
}

/** List all sessions sorted by updatedAt descending (most recent first) */
export async function listSessions(): Promise<Session[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("updatedAt");
    const request = index.getAll();
    request.onsuccess = () => {
      const sessions = (request.result as Session[]).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      resolve(sessions);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Delete a session by ID */
export async function deleteSession(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

/** Rename a session */
export async function renameSession(id: string, title: string): Promise<void> {
  const session = await getSession(id);
  if (!session) return;
  session.title = title;
  await saveSession(session);
}

/** Auto-title from first user message (truncated to 50 chars) */
export function autoTitle(content: string): string {
  const firstLine = content.split("\n")[0] || "New chat";
  return firstLine.length > 50 ? firstLine.slice(0, 47) + "..." : firstLine;
}

/** Append a message to a session and save */
export async function appendMessage(
  sessionId: string,
  message: SessionMessage,
): Promise<Session | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  // Auto-title on first user message
  if (message.role === "user" && session.messages.length === 0) {
    session.title = autoTitle(message.content);
  }
  session.messages.push(message);
  session.updatedAt = Date.now();
  await saveSession(session);
  return session;
}

/** Update the last message in a session (for streaming updates) */
export async function updateLastMessage(
  sessionId: string,
  partial: Partial<SessionMessage>,
): Promise<Session | null> {
  const session = await getSession(sessionId);
  if (!session || session.messages.length === 0) return null;
  const last = session.messages[session.messages.length - 1];
  session.messages[session.messages.length - 1] = { ...last, ...partial };
  session.updatedAt = Date.now();
  await saveSession(session);
  return session;
}

/** Replace from a specific message index onward (for re-send / edit) */
export async function replaceMessagesFrom(
  sessionId: string,
  fromIndex: number,
  newMessages: SessionMessage[],
): Promise<Session | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  session.messages = [...session.messages.slice(0, fromIndex), ...newMessages];
  session.updatedAt = Date.now();
  await saveSession(session);
  return session;
}