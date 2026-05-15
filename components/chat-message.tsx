"use client";

import ReactMarkdown from "react-markdown";
import { Badge } from "@0xkobold/warm-editorial";
import type { SessionMessage } from "@/lib/session-store";

/**
 * Renders a chat message as separate visual blocks (TUI-style).
 *
 * Instead of nesting reasoning, tool calls, and text into one bubble,
 * each element gets its own row:
 *
 *   ┌──────────────────────────────┐
 *   │ ⏳ Thinking... (373 chars)   │  ← collapsible reasoning
 *   └──────────────────────────────┘
 *   ◆ wikipedia_lookup             │  ← tool call (compact status line)
 *     { query: "grace" }           │
 *   ◆ ✓ Result: Grace is...        │  ← tool result
 *   ┌──────────────────────────────┐
 *   │ Grace is unmerited favor...  │  ← actual response (own bubble)
 *   └──────────────────────────────┘
 *   8→42 tokens · $0.001           │  ← usage footer
 */

export function ChatMessage({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";

  // User messages stay as simple bubbles
  if (isUser) {
    return (
      <div className="ml-auto max-w-[80%]">
        <div className="rounded-lg p-3 bg-foreground text-background">
          <div className="prose-sm">{message.content}</div>
        </div>
      </div>
    );
  }

  // Assistant messages render as stacked blocks
  return (
    <div className="mr-auto max-w-[100%] space-y-2">
      {/* Reasoning block */}
      {message.reasoning && (
        <details className="group">
          <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 px-2 rounded hover:bg-muted/50 transition-colors">
            <span className="text-muted-foreground/60">⏳</span>
            <span>Thinking…</span>
            <span className="text-muted-foreground/50">({message.reasoning.length} chars)</span>
          </summary>
          <div className="mt-1 p-2 rounded bg-muted/30 border border-border/50 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
            {message.reasoning}
          </div>
        </details>
      )}

      {/* Tool calls — each as a compact status line */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="space-y-1.5 py-1">
          {message.toolCalls.map((tc, i) => (
            <details key={i} className="group">
              <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 px-2 rounded hover:bg-muted/50 transition-colors">
                <span className="text-muted-foreground/60">◆</span>
                <span className="font-mono font-medium text-foreground/80">{tc.name}</span>
                {tc.result && (
                  <span className="text-muted-foreground/50">✓</span>
                )}
                {!tc.result && message.streaming && (
                  <span className="animate-pulse text-primary">●</span>
                )}
              </summary>
              <div className="ml-4 mt-1 space-y-1.5">
                {/* Args */}
                <div className="text-xs text-muted-foreground font-mono bg-muted/30 rounded p-2 border border-border/50">
                  {Object.entries(tc.args).map(([key, val]) => (
                    <div key={key}>
                      <span className="text-muted-foreground/60">{key}:</span>{" "}
                      <span className="text-foreground/70">
                        {typeof val === "string" ? val : JSON.stringify(val)}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Result */}
                {tc.result && (
                  <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2 border border-border/50 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {tc.result}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Main text response — its own bubble */}
      {message.content && (
        <div className="rounded-lg p-3 bg-card border border-border">
          <div className="prose-sm prose-invert">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Citations */}
      {message.citations && message.citations.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {message.citations.map((c, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {c.book} {c.chapter}:{c.verse}
            </Badge>
          ))}
        </div>
      )}

      {/* Usage — minimal footer */}
      {message.usage && !message.streaming && (
        <div className="text-[11px] text-muted-foreground/50 px-1">
          {message.usage.promptTokens}→{message.usage.completionTokens} tokens
          {message.usage.totalCost != null && message.usage.totalCost > 0 && ` · $${message.usage.totalCost.toFixed(4)}`}
        </div>
      )}
    </div>
  );
}