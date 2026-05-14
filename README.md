# Origen Chat

AI agent powered by [@moikapy/origen](https://npmjs.com/package/@moikapy/origen) with Warm Editorial design.

## Features

- **Streaming chat** — SSE events mapped to rich UI
- **Multi-provider auth** — OpenRouter and Ollama Cloud API keys
- **Wikipedia tool** — Agent can look up encyclopedic knowledge
- **Sovereign Memory** — D1-backed wiki (global/community/personal scopes)
- **Tiptap editor** — Rich text input with markdown shortcuts
- **Warm Editorial theme** — Dark mode by default, light mode toggle

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Stack

- [Origen](https://npmjs.com/package/@moikapy/origen) — Agent engine
- [Warm Editorial](https://npmjs.com/package/@0xkobold/warm-editorial) — Design system
- [Tiptap](https://tiptap.dev) — Rich text editor
- [Next.js](https://nextjs.org) + [OpenNext](https://opennext.js.org) — Cloudflare Workers

## API

`POST /api/chat` accepts:

```json
{
  "messages": [{"role": "user", "content": "What is quantum entanglement?"}],
  "model": "openrouter/free",
  "wiki": true,
  "provider": "openrouter",
  "apiKey": "sk-or-..."
}
```

Returns SSE events matching Origen's `StreamEvent` type.