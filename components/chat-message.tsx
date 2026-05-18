"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { SessionMessage } from "@/lib/session-store";
import { ChatError } from "@/components/chat-error";
import { WeatherCard } from "@/components/weather-card";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50"
      title="Copy"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  if (lang || code.includes("\n")) {
    return (
      <div className="relative group my-3 rounded-lg border border-border bg-[#0d1117] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30 text-xs text-muted-foreground">
          <span className="font-mono">{lang || "code"}</span>
          <CopyButton text={code} />
        </div>
        <pre className="p-3 overflow-x-auto text-sm leading-relaxed">
          <code className={className}>{children}</code>
        </pre>
      </div>
    );
  }

  return (
    <code className="px-1.5 py-0.5 rounded bg-muted/50 text-foreground font-mono text-sm">
      {children}
    </code>
  );
}

interface ChatMessageProps {
  message: SessionMessage;
  onEdit?: (index: number, newContent: string) => void;
  onRegenerate?: () => void;
  index: number;
  streaming?: boolean;
}

export function ChatMessage({ message, onEdit, onRegenerate, index, streaming }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isError = message.isError;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  if (isUser) {
    if (editing) {
      return (
        <div className="ml-auto max-w-[80%]">
          <div className="rounded-lg bg-foreground text-background p-3">
            <textarea
              className="w-full bg-transparent text-background resize-none outline-none text-sm min-h-[2rem]"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editText.trim()) {
                    onEdit?.(index, editText.trim());
                    setEditing(false);
                  }
                }
                if (e.key === "Escape") {
                  setEditText(message.content);
                  setEditing(false);
                }
              }}
              autoFocus
              rows={2}
            />
            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={() => {
                  setEditText(message.content);
                  setEditing(false);
                }}
                className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editText.trim()) {
                    onEdit?.(index, editText.trim());
                    setEditing(false);
                  }
                }}
                className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="ml-auto max-w-[80%] group relative">
        <div className="rounded-lg p-3 bg-foreground text-background cursor-pointer hover:opacity-95 transition-opacity" onDoubleClick={() => setEditing(true)}>
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        </div>
        <div className="absolute -bottom-5 right-0 flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50"
            title="Edit message"
          >
            Edit
          </button>
          <CopyButton text={message.content} />
        </div>
      </div>
    );
  }

  // Assistant messages
  return (
    <div className="mr-auto max-w-[100%] space-y-2 group/assistant relative">
      {/* Reasoning block */}
      {message.reasoning && (
        <details className="group/reason" open={streaming}>
          <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 px-2 rounded hover:bg-muted/50 transition-colors">
            <span className="inline-block w-3 h-3 border-2 border-muted-foreground/40 border-t-primary rounded-full" style={streaming ? { animation: 'spin 0.6s linear infinite' } : {}} />
            <span>{streaming ? "Thinking..." : "Reasoned"}</span>
            {!streaming && message.reasoning && (
              <span className="text-muted-foreground/50">({message.reasoning.trim().split(/\s+/).length} words)</span>
            )}
          </summary>
          <div className="mt-1 p-2 rounded bg-muted/30 border border-border/50 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
            {message.reasoning}
          </div>
        </details>
      )}

      {/* Rich tool result cards — rendered PROMINENTLY above the collapsible tools */}
      {message.toolCalls && message.toolCalls.some(tc => tc.name === "get_weather" && tc.result) && (
        <div className="space-y-2 py-1">
          {message.toolCalls
            .filter(tc => tc.name === "get_weather" && tc.result)
            .map((tc, i) => {
              try {
                const parsed = JSON.parse(tc.result!);
                if (["current", "forecast", "hourly", "alerts", "needs_location"].includes(parsed.type)) {
                  return <WeatherCard key={`wc-${i}`} data={tc.result!} />;
                }
              } catch { /* not renderable weather data */ }
              return null;
            })}
        </div>
      )}

      {/* Tool calls — collapsible details */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="space-y-1.5 py-1">
          {message.toolCalls.map((tc, i) => (
            <details key={i} className="group/tool">
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
                {tc.result && (() => {
                  // Don't re-render weather cards here — they're shown above
                  if (tc.name === "get_weather") {
                    try {
                      const parsed = JSON.parse(tc.result);
                      if (["current", "forecast", "hourly", "alerts", "needs_location"].includes(parsed.type)) {
                        return null;
                      }
                    } catch { /* fall through */ }
                  }
                  return (
                    <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2 border border-border/50 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {tc.result}
                    </div>
                  );
                })()}
              </div>
            </details>
          ))}
        </div>
      )}

            {/* Error message — styled error card */}
      {isError && message.content && (
        <ChatError message={message.content} />
      )}

      {/* Main text response — markdown rendered */}
      {message.content && !isError && (
        <div className="relative group/msg">
          <div className="rounded-lg p-3 bg-card border border-border">
            <div className={`prose prose-invert prose-sm max-w-none
              prose-p:my-2 prose-p:leading-relaxed
              prose-headings:text-foreground prose-headings:font-semibold
              prose-h1:text-lg prose-h1:mt-4 prose-h1:mb-2
              prose-h2:text-base prose-h2:mt-3 prose-h2:mb-2
              prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-strong:text-foreground
              prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-pre:border-0
              prose-li:my-0.5
              prose-table:text-sm
              prose-th:border prose-th:border-border prose-th:px-2 prose-th:py-1 prose-th:bg-muted/30
              prose-td:border prose-td:border-border prose-td:px-2 prose-td:py-1
              prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground
              prose-hr:border-border
            `}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code({ className, children, ...props }) {
                    return <CodeBlock className={className}>{children}</CodeBlock>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {streaming && (
                <span className="streaming-cursor inline-block ml-0.5 text-primary" />
              )}
            </div>
          </div>
          <div className="absolute -bottom-5 left-0 flex gap-2">
            {!streaming && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="opacity-0 group-hover/assistant:opacity-100 transition-opacity text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50"
                title="Regenerate response"
              >
                Retry
              </button>
            )}
            <CopyButton text={message.content} />
          </div>
        </div>
      )}

      {/* Citations */}
      {message.citations && message.citations.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {message.citations.map((c, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">
              {c.book} {c.chapter}:{c.verse}
            </span>
          ))}
        </div>
      )}

      {/* Usage footer */}
      {message.usage && !message.streaming && (
        <div className="text-[11px] text-muted-foreground/50 px-1">
          {(message.usage.promptTokens ?? 0).toLocaleString()} in · {(message.usage.completionTokens ?? 0).toLocaleString()} out
          {message.usage.totalCost != null && message.usage.totalCost > 0 && ` · $${message.usage.totalCost.toFixed(4)}`}
        </div>
      )}
    </div>
  );
}