# Origen Chat: Three-Tiered Memory System

**Date:** 2026-05-15
**Status:** Approved — Phase 1 implementation

## Problem

Every conversation with Origen starts blank. The AI doesn't remember what you told it last session. This is the #1 usability gap vs. ChatGPT, Claude, and every major chat product.

## Design

### Tier 1: Core Memory (Phase 1 — implementing now)

Always-in-context facts about the user, extracted from conversations and injected into every system prompt.

```
┌──────────────────────────────────────────────┐
│  D1: user_memory                              │
│  ┌──────────────────────────────────────────┐ │
│  │ user_id  │ key        │ value    │ updated│ │
│  │ abc123   │ name       │ Moikapy  │ ...    │ │
│  │ abc123   │ preference │ dark mode│ ...    │ │
│  │ abc123   │ project    │ origen    │ ...   │ │
│  └──────────────────────────────────────────┘ │
│                                               │
│  Guest: localStorage only                    │
│  Authenticated: D1 (cross-device)             │
└──────────────────────────────────────────────┘
```

**Flow:**
1. User sends message → chat API includes memory in system prompt
2. Assistant responds → after response completes, consolidation runs
3. Consolidation: LLM extracts facts → deduplicates against existing → writes to D1
4. Next conversation starts → memory loaded into system prompt

### Tier 2: Recall Search (future)

- D1 FTS5 full-text search across all past sessions
- `/api/search` endpoint
- Search bar in sidebar for finding past conversations

### Tier 3: External Knowledge (future)

- Pluggable `KnowledgeProvider` interface
- Wikipedia (done), web search, uploaded documents
- Only queried when Tier 1+2 insufficient

### Memory Consolidation (Phase 1)

After each assistant response completes, a lightweight extraction runs:

```
Prompt: "Given this conversation, extract 1-3 key facts worth remembering 
about this user. Format as key:value pairs. Only extract facts that are 
explicitly stated or strongly implied. Ignore temporary context."

Input: conversation history (last 10 messages)
Output: key=value pairs
Validation: deduplicate against existing memory, reject prompt injections
Write: INSERT OR REPLACE into user_memory
```

**Security:**
- No credential extraction (blocks passwords, API keys, tokens)
- No prompt injection in facts (scans for instruction-like patterns)
- Deduplication: merge existing keys rather than duplicate
- Rate limit: 1 consolidation per conversation, max 100 facts per user

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/memory` | GET | Get all memory facts for authenticated user |
| `/api/memory` | PUT | Update/insert a memory fact |
| `/api/memory` | DELETE | Delete a memory fact by key |

### System Prompt Injection

Memory facts folded into the system prompt:

```
[User Context]
- name: Moikapy
- preference: prefers concise responses
- project: working on origen-chat, a Cloudflare Workers chat app
- framework: uses Next.js with OpenNext for deployment
```

### D1 Migration

```sql
CREATE TABLE IF NOT EXISTS user_memory (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_updated ON user_memory(user_id, updated_at DESC);
```

### Guest Users

Guests get memory in localStorage only — no D1 sync. Key: `origen_memory`.
Same shape as D1: array of `{key, value, updatedAt}`.
Capped at 50 facts for guests.

## Out of Scope (Future)

- Tier 2: Session search (FTS5 + search endpoint)
- Tier 3: External knowledge providers
- Memory sharing between users
- Memory export/import
- Memory categories/tags