"use client";

import ReactMarkdown from "react-markdown";
import { Badge, Separator } from "@0xkobold/warm-editorial";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: string }>;
  citations?: Array<{ book: string; chapter: number; verse: number }>;
  usage?: { promptTokens?: number; completionTokens?: number; totalCost?: number };
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`${isUser ? "ml-auto max-w-[80%]" : "mr-auto max-w-[100%]"}`}>
      <div
        className={`rounded-lg p-3 ${
          isUser
            ? "bg-foreground text-background"
            : "bg-card border border-border"
        }`}
      >
        {/* Reasoning block */}
        {message.reasoning && (
          <details className="mb-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Thinking... ({message.reasoning.length} chars)
            </summary>
            <div className="reasoning-block mt-1 whitespace-pre-wrap">
              {message.reasoning}
            </div>
          </details>
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1 mb-2">
            {message.toolCalls.map((tc, i) => (
              <details key={i} className="tool-call-block">
                <summary className="cursor-pointer font-medium">
                  <Badge variant="default">{tc.name}</Badge>
                </summary>
                <div className="mt-1 text-xs text-muted-foreground">
                  <div className="font-mono whitespace-pre-wrap">
                    {JSON.stringify(tc.args, null, 2)}
                  </div>
                  {tc.result && (
                    <>
                      <Separator />
                      <div className="mt-1 whitespace-pre-wrap">{tc.result}</div>
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* Main content */}
        {message.content && (
          <div className={`prose-sm ${isUser ? "" : "prose-invert"}`}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.citations.map((c, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {c.book} {c.chapter}:{c.verse}
              </Badge>
            ))}
          </div>
        )}

        {/* Usage */}
        {message.usage && (
          <div className="mt-2 text-xs text-muted-foreground">
            {message.usage.promptTokens}→{message.usage.completionTokens} tokens
            {message.usage.totalCost && ` · $${message.usage.totalCost.toFixed(4)}`}
          </div>
        )}
      </div>
    </div>
  );
}