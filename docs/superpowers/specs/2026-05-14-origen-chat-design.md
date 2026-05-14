# Origen Chat — Design Spec

> Minimal MVP web app for using the Origen agent engine. Cloudflare Workers + D1 + Next.js.

## Architecture

```
Browser                          Cloudflare Workers
────────                         ──────────────────
Chat UI ──POST /api/chat──→  route.ts ──→ streamOrigen()
  │         SSE events ←──     │                │
  │                           getD1() ←── D1   │
  │                           getApiKey()  ←── ┘
  │                                │
  │                           CloudWikiProvider
  │                           (global/community/personal)
  │
  └── Tiptap input, model selector, wiki toggle, provider settings
```

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Cloudflare Workers | Edge-native, Origen already supports it |
| Framework | Next.js 16 + OpenNext | SSE works, D1 binding, known stack |
| Wiki | CloudWikiProvider + D1 | Already built, 3-scope isolation |
| Auth | API key input (OpenRouter + Ollama Cloud) | MVP — no OAuth, just key storage |
| UI | React + Tailwind + Tiptap | Rich input, fast to build |
| Streaming | SSE → ReadableStream | Direct mapping from StreamEvent |
| Tools | Wikipedia lookup | Real value, no D1 needed, public API |

## MVP Features (v0.1)

1. **Chat interface** — Tiptap rich editor with markdown shortcuts, send/abort
2. **Model selector** — Dropdown populated from `MODELS` + dynamic Ollama discovery
3. **Wiki toggle** — Enable/disable Sovereign Memory per conversation
4. **Provider settings** — API key input for OpenRouter or Ollama Cloud (stored in localStorage)
5. **Streaming** — SSE events mapped to UI: reasoning → animation, tool_call → collapsible, text → markdown, done → citations
6. **Wikipedia tool** — `wikipedia_lookup` searches Wikipedia and returns summaries

### NOT in MVP (v0.2+)

- Conversation history persistence
- Sidebar with past conversations
- Wiki management UI (browse/edit pages)
- User accounts / multi-tenant
- OpenRouter OAuth PKCE
- Dark mode / themes
- Tiptap /commands wiki, model, clear

## API Contract

```
POST /api/chat
Content-Type: application/json

{
  "messages": [{"role": "user", "content": "What is quantum entanglement?"}],
  "model": "openrouter/free",
  "wiki": true,
  "provider": "openrouter",
  "apiKey": "sk-or-..."
}

Response: text/event-stream
data: {"type":"reasoning","content":"Looking this up..."}
data: {"type":"tool_call","name":"wikipedia_lookup","args":{"query":"quantum entanglement"}}
data: {"type":"tool_result","name":"wikipedia_lookup","result":"Quantum entanglement is..."}
data: {"type":"text","content":"Based on Wikipedia..."}
data: {"type":"done","message":"...","citations":[],"usage":{"promptTokens":120,"completionTokens":340}}
data: {"type":"error","message":"..."}
```

## File Structure

```
origen-chat/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       └── chat/
│           └── route.ts
├── components/
│   ├── chat-input.tsx          # Tiptap editor + send/abort
│   ├── chat-message.tsx        # Message bubble (text/reasoning/tool)
│   ├── model-selector.tsx      # Model dropdown
│   ├── provider-settings.tsx   # API key + provider config
│   └── wiki-toggle.tsx         # Sovereign Memory toggle
├── lib/
│   ├── config.ts               # AgentConfig builder
│   ├── auth.ts                 # Key storage + checkAuth
│   ├── tools/
│   │   └── wikipedia.ts        # Wikipedia lookup tool
│   └── tiptap.tsx               # Tiptap extensions config
├── wrangler.toml
├── open-next.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Component Details

### chat-input.tsx (Tiptap)

- Tiptap editor with StarterKit (bold, italic, code, headings, lists)
- Placeholder extension: "Ask anything..."
- Enter to submit (Shift+Enter for newline)
- Markdown output via `editor.storage.markdown.getMarkdown()`
- Abort button cancels the stream via AbortController

### chat-message.tsx

Three rendering modes:
- `text`: Rendered as markdown via `react-markdown`
- `reasoning`: Collapsible with "Thinking..." header, muted style
- `tool_call` / `tool_result`: Collapsible with tool name badge

### model-selector.tsx

- Dropdown populated from `MODELS` static list
- Groups: Free tier (openrouter/free, etc), OpenRouter, Ollama (if connected)
- Stores selection in localStorage

### provider-settings.tsx

- Two provider options: OpenRouter, Ollama Cloud
- API key field (password input, show/hide toggle)
- Ollama Cloud gets an endpoint field (default: `https://api.ollama.com/v1`)
- "Test Connection" button that calls `checkAuth()`
- Keys stored in localStorage

### wiki-toggle.tsx

- Toggle switch to enable/disable Sovereign Memory
- When enabled, `AgentConfig.wiki` is set to `{type: 'cloud'}`
- Anonymous users get community scope only; userId added later (v0.2)

## Wikipedia Tool

```typescript
const wikipediaTool: OrigenTool = {
  name: 'wikipedia_lookup',
  description: 'Search Wikipedia and return article summaries. Use this when the user asks about topics, people, places, events, or concepts that warrant encyclopedic knowledge.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term' },
      sentences: { type: 'number', description: 'Max sentences (default 5)' },
    },
    required: ['query'],
  },
  execute: async ({ query, sentences = 5 }) => {
    // 1. Search: GET https://en.wikipedia.org/w/api.php?action=opensearch&search={query}&limit=5
    // 2. Pick best match (first result)
    // 3. Summary: GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}
    // 4. Return extract, truncated to `sentences`
  },
}
```

No D1 dependency. Works with public Wikipedia APIs. Rate-limited to avoid abuse.

## Auth Flow

1. User opens Provider Settings
2. Selects OpenRouter or Ollama Cloud
3. Enters API key
4. Clicks "Test Connection" → `checkAuth(getApiKey)` validates
5. Key stored in localStorage under `origen_chat_auth`
6. Key sent in request body to `/api/chat` (not in headers — simpler for MVP)
7. `route.ts` passes key to `streamOrigen()` via `apiKey` param

## Deployment

- `wrangler.toml` with D1 binding for CloudWikiProvider
- `open-next.config.ts` with incrementalCache: "dummy" (Workers)
- Deploy: `npx wrangler deploy`
- Preview: `npx wrangler dev`
## Theming — Warm Editorial

Every component uses `@0xkobold/warm-editorial`:
- `ThemeProvider` wraps the app with `defaultTheme="dark"`
- All colors reference CSS custom properties (`var(--background)`, `var(--foreground)`, etc.)
- Tiptap editor uses `--card`, `--input`, `--border` tokens
- Reasoning blocks use `--muted` background with `--muted-foreground` text
- Tool call badges use `<Badge variant="default">` (emerald)
- Error messages use `<Badge variant="destructive">`
- Model selector uses `<Badge variant="outline">` for model tags

Default mode: **dark** (warm near-black #141311, matching Origen's terminal vibe).

### Dependencies

```json
{
  "@moikapy/origen": "^0.5.1",
  "@0xkobold/warm-editorial": "^0.1.0",
  "@tiptap/react": "^0.x",
  "@tiptap/starter-kit": "^0.x",
  "@tiptap/extension-placeholder": "^0.x",
  "@tiptap/pm": "^0.x",
  "next": "16.x",
  "react": "^19",
  "react-dom": "^19",
  "react-markdown": "^9.x"
}
```
