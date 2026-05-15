# Chat Page Improvements Plan

**Date:** 2026-05-15
**Goal:** Extract chat logic into hooks, add stop button, collapsible reasoning, auto-titles, and usage display.

## Task Order (each has TDD checkpoint)

### Task 1: Extract `useChat` hook
- [ ] Create `lib/use-chat.ts` with `useChat()` hook
- [ ] Move: streaming state, sendMessage, handleRegenerate, SSE parsing, abort controller
- [ ] Move: stream timer (streamElapsed, streamStartTime)
- [ ] `page.tsx` imports `useChat()` — becomes pure layout
- [ ] Tests: unit test `useChat` logic (can't test hook directly, test pure functions)
- [ ] Verify: 108+ tests still pass, E2E still passes

### Task 2: Stop button with spinner
- [ ] Replace "Stop" text with spinner SVG + "Stop generating"
- [ ] Add `animate-spin` on the spinner icon
- [ ] Verify: visual check during streaming

### Task 3: Collapsible reasoning/thinking blocks
- [ ] `ChatMessage` renders `message.reasoning` in `<details>` tag
- [ ] During streaming: show "Thinking..." preamble (auto-expanded)
- [ ] After streaming: auto-collapse with summary "Reasoned for Xs"
- [ ] Verify: reasoning content visible during stream, collapsed after

### Task 4: Auto-title generation
- [ ] After first assistant response finalizes, call `rename(sessionId, title)`
- [ ] Title = first user message truncated to 50 chars (already partially done)
- [ ] Only auto-title if session title is still "New chat"
- [ ] Verify: session sidebar shows "What happened today?" instead of "New chat"

### Task 5: Token/cost display
- [ ] Show usage after last assistant message: "1,234 tokens · $0.002"
- [ ] Only show if `message.usage` exists
- [ ] Verify: usage appears below final assistant message

### Task 6: Scroll-to-bottom FAB
- [ ] Floating button appears when user scrolls up >150px from bottom
- [ ] Click scrolls to bottom smoothly
- [ ] Hidden when already at bottom
- [ ] Verify: button appears/disappears based on scroll position

### Task 7: Export chat
- [ ] "Export" button in chat header or message menu
- [ ] Downloads as markdown (.md) file
- [ ] Format: `# Title\n\n**User:** msg\n\n**Assistant:** msg\n`
- [ ] Verify: download triggers with correct content

## Commit points
- After Task 1: "refactor: extract useChat hook from page.tsx"
- After Task 2: "feat: stop button with spinner animation"
- After Task 3: "feat: collapsible reasoning/thinking blocks"
- After Task 4: "feat: auto-title generation from first user message"
- After Task 5: "feat: token usage display per message"
- After Task 6: "feat: scroll-to-bottom floating button"
- After Task 7: "feat: export chat as markdown"