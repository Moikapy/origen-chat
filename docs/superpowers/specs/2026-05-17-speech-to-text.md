# Speech-to-Text — Spec

> Voice input for Origen Chat. Users speak, text lands in the Tiptap editor. Zero new infrastructure — routes through the existing OpenRouter key.

## Problem

Users on mobile or in quick-interaction scenarios want to speak instead of type. Origen Chat currently only accepts typed input via the Tiptap editor. Adding speech-to-text (STT) makes the chat accessible for voice-first workflows and lowers the friction for casual use.

## Constraints

1. **No new billing accounts** — STT must use the OpenRouter key the user already has configured (or fall back to browser-native). No separate Cloudflare AI bindings or third-party API keys.
2. **Same auth model** — Authenticated users use their OpenRouter OAuth key. Unauthenticated/free-tier users get browser-native fallback only.
3. **Works on Cloudflare Workers** — All server-side code runs within the existing Next.js + OpenNext stack. The 128 MB memory limit and 10 MB compressed bundle limit apply.
4. **Tiptap integration** — Transcribed text inserts into the existing editor, not a separate input. The user can edit the transcription before sending.
5. **Privacy options** — Ollama users who chose local AI should have a local STT option too.

## Architecture

```
Browser                                    Cloudflare Workers
──────                                    ──────────────────

🎤 MediaRecorder
  │ records audio (webm/opus)
  │
  ├─ Has OpenRouter key? ──── YES ──────→ POST /api/transcribe
  │                                        │ forwards to
  │                                        │ OpenRouter /api/v1/audio/transcriptions
  │                                        │ model: openai/whisper-1
  │                                        │ ← { text: "..." }
  │                                        │
  │                                   editor.commands.insertContent(text)
  │
  └─ No key? ──── Browser Speech API ───→ webkitSpeechRecognition
                                             │ real-time interim results
                                             │
                                        editor.commands.insertContent(transcript)
```

### Three Tiers (matching the dual-provider philosophy)

| Tier | Method | Users | Cost | Quality | Latency |
|---|---|---|---|---|---|
| 1. Browser API | `webkitSpeechRecognition` | No OpenRouter key, Chrome/Edge/Safari | Free | Good (Google backend) | Real-time streaming |
| 2. OpenRouter STT | `/api/v1/audio/transcriptions` with `openai/whisper-1` | Authenticated users | ~$0.006/min | Whisper-quality, multilingual | 2-5s per clip |
| 3. Local WASM | whisper.cpp WASM in browser (future) | Ollama privacy-first users | Free, ~31 MB download | Whisper-quality | 5-30s on device |

**Ship Tier 1 + 2 now. Tier 3 is deferred.**

## API Design

### New Route: `POST /api/transcribe`

Proxy endpoint that forwards audio to OpenRouter's STT API. Uses the same auth/cookie patterns as `/api/chat`.

**Request:**
```json
{
  "audio": "<base64-encoded-audio-bytes>",
  "format": "webm",
  "language": "en"
}
```

**Response (success):**
```json
{
  "text": "What is quantum entanglement?",
  "usage": {
    "durationSeconds": 3.2
  }
}
```

**Response (error):**
```json
{
  "error": "No API key. Sign in or add an OpenRouter key in Settings."
}
```

**Auth flow (mirrors `/api/chat`):**
1. Try encrypted cookie via `getApiKeyFromCookie()` (OpenRouter OAuth users)
2. Fall back to client-passed `apiKey` field
3. Fall back to `OPENROUTER_FREE_KEY` server key (if configured)
4. If no key → 401 error

**Rate limiting:** Same per-IP D1 rate limit as chat. Audio transcription is lightweight but should still be throttled to prevent abuse.

**Worker implementation:**
```typescript
// app/api/transcribe/route.ts
export async function POST(request: Request): Promise<Response> {
  const originError = requireOrigin(request);
  if (originError) return originError;

  const body = await request.json();
  const { audio, format, language, apiKey: clientKey } = body;

  // Validate audio payload
  if (!audio || !format) {
    return json({ error: "Missing audio or format" }, 400);
  }

  // Resolve API key (same logic as /api/chat)
  const apiKey = await resolveKey(request, clientKey);
  if (!apiKey) {
    return json({ error: "No API key..." }, 401);
  }

  // Forward to OpenRouter
  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/whisper-1",
      input_audio: { data: audio, format },
      language: language || undefined,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return json({ error: `Transcription failed: ${response.status}` }, response.status);
  }

  const result = await response.json();
  return json(result);
}
```

## UI Design

### Voice Input Button

Place a microphone button in the footer bar, between the Tiptap editor and the Send button:

```
┌─────────────────────────────────────────────────┐
│ [Tiptap editor.................] [🎤] [Send/Stop] │
└─────────────────────────────────────────────────┘
```

**States:**

| State | Button | Visual |
|---|---|---|
| Idle | 🎤 (mic icon) | Muted foreground color |
| Recording | 🎤 pulsing red | Red ring animation, recording indicator |
| Processing | 🎤 spinning | Small spinner, "Transcribing..." tooltip |
| Error | 🎤 with ⚠️ | Brief red flash, tooltip with error message |

**Keyboard shortcut:** `Ctrl+Shift+M` to toggle recording (mirrors `Ctrl+Shift+N` for new chat).

### Recording Flow

1. User clicks 🎤 → browser requests mic permission (first time only)
2. `MediaRecorder` captures audio in `webm/opus` format
3. Button pulses red, status bar shows "Recording... 0:03" (elapsed timer)
4. User clicks 🎤 again (or presses `Ctrl+Shift+M` again) → recording stops
5. Audio is base64-encoded and sent to `/api/transcribe` (or processed by browser Speech API)
6. Transcribed text is inserted at the cursor position in the Tiptap editor via `editor.commands.insertContent()`
7. User can edit the transcription, then hit Send

### Real-time Browser Speech API Mode

When no OpenRouter key is available, fall back to `webkitSpeechRecognition`:

- `continuous: true` — keeps listening until manually stopped
- `interimResults: true` — shows partial transcripts as the user speaks
- Interim results appear as gray italic text in the editor
- Final results replace interim text with solid black text
- Language follows the user's browser locale

### Settings Integration

Add a "Voice Input" section to `/settings`:

```
Voice Input
─────────────────────────
Provider: [Auto ▼]
  • Auto — Uses OpenRouter if key available, browser fallback otherwise
  • OpenRouter Whisper — Always use cloud transcription (requires key)
  • Browser — Always use browser speech recognition (Chrome/Edge/Safari only)

Language: [Auto-detect ▼]
  • Auto-detect
  • English, Spanish, Japanese, etc.
```

Stored in `localStorage` as `{ voiceProvider: "auto" | "openrouter" | "browser", voiceLanguage: string }`.

## Client Hook: `useVoiceInput`

```typescript
// lib/use-voice-input.ts

interface VoiceInputConfig {
  editor: Editor | null;           // Tiptap editor instance
  provider: "auto" | "openrouter" | "browser";
  language?: string;
  apiKey?: string;
}

interface VoiceInputState {
  recording: boolean;
  processing: boolean;
  error: string | null;
  elapsed: number;                 // seconds recorded
}

function useVoiceInput(config: VoiceInputConfig) {
  const [state, setState] = useState<VoiceInputState>({ ... });

  const start = useCallback(() => { ... }, []);
  const stop = useCallback(() => { ... }, []);
  const toggle = useCallback(() => { ... }, []);

  return { ...state, start, stop, toggle };
}
```

**Auto provider logic:**
1. If `provider === "openrouter"` or ( `provider === "auto"` and OpenRouter key exists ) → use MediaRecorder + `/api/transcribe`
2. If `provider === "browser"` or ( `provider === "auto"` and no key ) → use `webkitSpeechRecognition`
3. If browser doesn't support either → show error toast "Voice input not supported in this browser"

## File Changes

### New Files
| File | Purpose |
|---|---|
| `app/api/transcribe/route.ts` | Server proxy for OpenRouter STT |
| `lib/use-voice-input.ts` | Client hook for mic recording + transcription |
| `components/voice-button.tsx` | Mic button component with states |
| `lib/use-voice-settings.ts` | Voice settings (provider, language) from localStorage |

### Modified Files
| File | Change |
|---|---|
| `app/chat/page.tsx` | Import `useVoiceInput`, add `<VoiceButton>` to footer bar, add `Ctrl+Shift+M` shortcut |
| `app/settings/page.tsx` | Add "Voice Input" section with provider/language selectors |
| `components/session-sidebar.tsx` | (no change needed — settings accessible from header) |

## Error Handling

| Scenario | Behavior |
|---|---|
| Mic permission denied | Toast: "Microphone access denied. Enable it in browser settings." |
| No OpenRouter key + browser API unsupported (Firefox) | Toast: "Voice input requires Chrome/Edge or an OpenRouter key." |
| Transcription returns empty text | Toast: "No speech detected. Try again." |
| OpenRouter API error (429, 500, etc.) | Toast: "Transcription failed. Try again or use browser speech in Settings." |
| Audio too long (>60s) | Auto-stop at 60s, warn: "Max recording length is 60 seconds." |
| Network error during upload | Toast: "Network error. Check your connection." |

## Security Considerations

- **Auth parity**: `/api/transcribe` uses the exact same key resolution and CSRF protection as `/api/chat` (`requireOrigin`, encrypted cookies, free key fallback).
- **Payload size limit**: Cap audio at ~5 MB (base64 encoded ≈ 3.75 MB raw). Reject larger with 413.
- **No audio storage**: Audio is never written to D1, KV, or R2. It passes through the Worker directly to OpenRouter and is discarded.
- **Rate limiting**: Reuse the existing D1 rate limiter. Transcription requests count toward the same per-IP/per-user limits as chat.

## Cost Analysis

| Scenario | OpenRouter Whisper | Browser API |
|---|---|---|
| 1 min of audio | $0.006 | Free |
| 10 min/day casual use | $0.06/day | Free |
| 100 min/day power user | $0.60/day | Free |
| 1000 min/day across all users | $6.00/day | Free |

For context: a typical voice chat message is 5-15 seconds. That's $0.0005-$0.0015 per message. Negligible for individual users, manageable at scale.

## Out of Scope (Deferred)

- **Tier 3: Local whisper WASM** — Requires ~31 MB model download, complex integration, only benefits a niche of Ollama users. Revisit if demand surfaces.
- **Text-to-Speech (TTS)** — OpenRouter also has a `/api/v1/audio/speech` endpoint. Could add a "Read aloud" button on assistant messages. Separate spec.
- **Real-time streaming transcription** — OpenRouter's endpoint is batch (send full clip, get text back). Real-time streaming would require a different architecture (WebSocket + streaming STT). Not yet available through OpenRouter.
- **Voice activity detection (VAD)** — Auto-stop recording when user stops talking. Requires client-side VAD library. Nice-to-have, not MVP.
- **Custom wake word** — "Hey Origen" activation. Far future.

## Testing Strategy

### Unit Tests (Vitest)
- `lib/use-voice-input.ts` — Provider selection logic, state transitions
- `lib/use-voice-settings.ts` — localStorage read/write, defaults

### API Tests (Vitest)
- `app/api/transcribe/route.ts` — Key resolution, payload validation, error responses
- Mock OpenRouter API responses for success/failure/timeout

### E2E Tests (Playwright)
- Mic button visibility and clickability
- Recording start/stop UI states
- Settings page voice provider selection

### Manual Test Checklist
- [ ] Chrome: mic permission prompt appears on first click
- [ ] Chrome: recording works, transcription inserts into editor
- [ ] Firefox: fallback to browser API if no key (or error message)
- [ ] Safari: browser API works
- [ ] Mobile Chrome: mic works on phone
- [ ] No OpenRouter key: auto-falls back to browser API
- [ ] With OpenRouter key: audio uploads and transcribes
- [ ] 60s auto-stop works
- [ ] Edit transcription before sending works
- [ ] Ctrl+Shift+M shortcut toggles recording

## Implementation Order

1. `lib/use-voice-settings.ts` — Settings hook (5 min)
2. `app/api/transcribe/route.ts` — Server route (30 min)
3. `lib/use-voice-input.ts` — Core hook with both providers (1 hr)
4. `components/voice-button.tsx` — Button with visual states (30 min)
5. `app/chat/page.tsx` — Wire into footer bar + shortcuts (20 min)
6. `app/settings/page.tsx` — Voice settings section (20 min)
7. Tests — Unit + API (45 min)
8. Manual QA — Browser checklist (30 min)

**Estimated total: ~4 hours**