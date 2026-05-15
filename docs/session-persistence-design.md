# Session Persistence — Design Spec

**Date:** 2026-05-15  
**Status:** Approved

## Problem

Chat history is in-memory only (`useState<Message[]>`). Page refresh, tab close, or navigation wipes everything. No way to revisit past conversations or switch between them.

## Solution

IndexedDB-backed session persistence with a sidebar for switching conversations and a dedicated history page. Each session is a separate conversation thread with its own messages, model, and metadata.

## Data Model

```typescript
interface Session {
  id: string;           // crypto.randomUUID()
  title: string;        // auto-generated from first user message (first 50 chars)
  model: string;        // model ID used (e.g. "openrouter/free")
  messages: Message[];  // full message history
  createdAt: number;    // Date.now()
  updatedAt: number;    // Date.now(), updated on each message
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  citations?: Citation[];
  usage?: Usage;
  streaming?: boolean;  // false once complete
}
```

## Architecture

### `lib/session-store.ts` — IndexedDB wrapper

- `openDB()` — opens/creates `origen-sessions` DB with `sessions` object store keyed by `id`, index on `updatedAt`
- `createSession(model)` — creates new session, returns it
- `getSession(id)` — returns session or null
- `updateSession(id, partial)` — merges partial into session, saves to IndexedDB
- `appendMessage(sessionId, message)` — pushes message, updates title if first user message, updates `updatedAt`
- `updateLastMessage(sessionId, partial)` — updates last message (for streaming), updates `updatedAt`
- `listSessions()` — returns all sessions sorted by `updatedAt` desc
- `deleteSession(id)` — removes session
- `renameSession(id, title)` — updates title

### `lib/use-sessions.ts` — React hook

- `useSessions()` — returns `{ sessions, activeId, active, createNew, switchTo, deleteSession, renameSession }`
- Loads sessions list from IndexedDB on mount
- Auto-saves on each message append/update
- Auto-generates title from first user message

### UI Changes

**Chat page (`/chat`):**
- Left sidebar (260px, collapsible) showing session list
- Each session: title, model badge, relative timestamp, delete button on hover
- "New chat" button at top
- Active session highlighted
- Click to switch sessions (loads messages into state)
- On mobile: sidebar is a slide-in drawer triggered by hamburger icon

**History page (`/history`):**
- Grid/card view of all sessions
- Search/filter by title or model
- Delete multiple sessions
- Click to resume a session in `/chat`

### Session Flow

1. User opens `/chat` → no active session → shows welcome screen
2. User sends first message → `createSession(model)` → auto-title from first 50 chars
3. Each assistant message chunk → `updateLastMessage(id, partial)` → debounced IndexedDB write
4. Message complete → `updateLastMessage(id, { streaming: false })` → immediate write
5. User clicks "New" → `createNew()` → saves current, starts fresh
6. User clicks session in sidebar → `switchTo(id)` → loads messages from IndexedDB
7. User closes tab → next visit, sessions list loads from IndexedDB

### Editing / Re-sending

- User edits a past user message → replaces that message and all messages after it
- Simpler than branching: no tree structure, just truncate and re-append

## Decisions

- **IndexedDB over localStorage** — no 5MB limit, structured data, indexed queries
- **No server-side sync** — Phase 1 is client-only. Server sync (D1) is a future Phase
- **Replace-after branching** — simpler than tree-branching, matches ChatGPT paradigm
- **Auto-title** — first user message truncated to 50 chars, users can rename
- **Debounced writes** — streaming updates batched every 500ms to avoid IndexedDB thrashing

## Scope

- In scope: create, list, switch, delete, rename, auto-save, auto-title
- Out of scope: search within messages, export, server sync, shared sessions