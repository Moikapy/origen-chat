"use client";

import React from "react";
import { classifyError, type ErrorKind } from "@/lib/error-classifier";

export { classifyError, type ErrorKind } from "@/lib/error-classifier";

const STYLES: Record<ErrorKind, { border: string; bg: string; icon: string; title: string }> = {
  rate_limit: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    icon: "⏳",
    title: "Rate limit reached",
  },
  network: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    icon: "🔌",
    title: "Connection error",
  },
  auth: {
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    icon: "🔑",
    title: "Authentication required",
  },
  general: {
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/10",
    icon: "⚠️",
    title: "Error",
  },
};

export function ChatError({ message }: { message: string }) {
  const kind = classifyError(message);
  const style = STYLES[kind];

  // Strip "Error: " or "⚠️ Error: " prefix if present
  const cleanMessage = message.replace(/^⚠️\s*Error:\s*/i, "").replace(/^Error:\s*/i, "");

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-4 my-2`}>
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0">{style.icon}</span>
        <div className="min-w-0">
          <p className="font-medium text-foreground text-sm">{style.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{cleanMessage}</p>
          {kind === "rate_limit" && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Tip: Wait 60 seconds, or sign in with OpenRouter for higher limits.
            </p>
          )}
          {kind === "auth" && (
            <a href="/auth/login" className="text-xs text-primary hover:underline mt-1.5 inline-block">
              Sign in for premium models
            </a>
          )}
        </div>
      </div>
    </div>
  );
}