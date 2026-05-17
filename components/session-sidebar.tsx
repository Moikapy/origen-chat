"use client";

import { useState, useRef } from "react";
import type { Session } from "@/lib/session-store";
import { ModelSelector } from "@/components/model-selector";
import { SkeletonChatItem } from "@/components/skeleton";
import { useAuth } from "@/lib/auth";
import { useMemory } from "@/lib/use-memory";

interface SessionSidebarProps {
  sessions: Session[];
  activeId: string | null;
  activeModel: string;
  systemPrompt?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
  onModelChange: (model: string) => void;
  onSystemPromptChange: (prompt: string) => void;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
}

function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Group sessions by time period */
function groupSessions(sessions: Session[]): { label: string; sessions: Session[] }[] {
  const now = Date.now();
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;

  const groups: { label: string; sessions: Session[] }[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "This Week", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const s of sessions) {
    if (s.updatedAt >= today) groups[0].sessions.push(s);
    else if (s.updatedAt >= yesterday) groups[1].sessions.push(s);
    else if (s.updatedAt >= week) groups[2].sessions.push(s);
    else groups[3].sessions.push(s);
  }

  return groups.filter((g) => g.sessions.length > 0);
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  const handleDelete = () => {
    if (confirmDelete) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      onDelete();
    } else {
      setConfirmDelete(true);
      confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  if (editing) {
    return (
      <div className="px-2 py-1">
        <input
          className="w-full bg-input text-foreground text-sm rounded px-2 py-1 outline-none ring-1 ring-ring"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(editTitle);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => {
            onRename(editTitle);
            setEditing(false);
          }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
    >
      {/* Chat bubble icon */}
      <div className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs ${
        isActive ? "text-primary" : "text-muted-foreground/60"
      }`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate leading-tight">{session.title}</div>
        <div className="text-[11px] text-muted-foreground/60 mt-0.5">
          {relativeTime(session.updatedAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
        className={`flex-shrink-0 ${confirmDelete ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${confirmDelete ? "text-destructive" : "text-muted-foreground/40 hover:text-destructive"} transition-all p-0.5 rounded`}
        title={confirmDelete ? "Click again to delete" : "Delete"}
      >
        {confirmDelete ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Memory section for sidebar — shows what the agent remembers about the user */
function MemorySection() {
  const { facts, loading, deleteFact, refresh } = useMemory();
  const [expanded, setExpanded] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  if (loading) return null;

  // Show collapsed if no facts and not expanded
  if (facts.length === 0 && !expanded) {
    return (
      <div className="border-t border-border p-3">
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        >
          Memory (empty)
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Memory ({facts.length})</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {facts.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50">No facts stored yet. Chat to build memory.</p>
          )}
          {facts.map((fact) => (
            <div key={fact.key} className="group flex items-start gap-1 text-[11px]">
              <span className="text-muted-foreground shrink-0">{fact.key}:</span>
              <span className="text-foreground/80 truncate flex-1">{fact.value}</span>
              <button
                onClick={async () => {
                  if (deletingKey === fact.key) {
                    await deleteFact(fact.key);
                    setDeletingKey(null);
                  } else {
                    setDeletingKey(fact.key);
                    setTimeout(() => setDeletingKey(null), 3000);
                  }
                }}
                className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                  deletingKey === fact.key
                    ? "text-destructive"
                    : "text-muted-foreground hover:text-destructive"
                }`}
                title={deletingKey === fact.key ? "Click again to delete" : "Delete"}
              >
                {deletingKey === fact.key ? "x" : "\u00d7"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionSidebar({
  sessions,
  activeId,
  activeModel,
  onSelect,
  onDelete,
  onRename,
  onNew,
  onModelChange,
  systemPrompt,
  onSystemPromptChange,
  open,
  onClose,
  collapsed,
  loading,
}: SessionSidebarProps) {
  const { user, openrouterConnected, openrouterInfo, connectOpenRouter, disconnectOpenRouter } = useAuth();
  const grouped = groupSessions(sessions);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-dvh z-50 w-72 bg-card border-r border-border flex flex-col transition-all duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${
          collapsed ? "lg:hidden" : "lg:relative lg:h-full lg:translate-x-0"
        }`}
      >
        {/* Header: Brand + New */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold tracking-wide">Origen Chat</span>
            <div className="flex items-center gap-1">
              <button
                onClick={onNew}
                className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
                title="New chat (Ctrl+Shift+N)"
              >
                + New
              </button>
              <button
                onClick={onClose}
                className="lg:hidden text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Model selector */}
          <ModelSelector
            value={activeModel}
            onChange={onModelChange}
            freeOnly={!user && !openrouterConnected}
            byok={openrouterConnected}
          />
          {!user && !openrouterConnected && (
            <p className="text-[11px] text-muted-foreground mt-1.5 px-0.5">
              <a href="/auth/login" className="text-primary hover:underline">Sign in</a> to use premium models
            </p>
          )}
          {openrouterConnected && !user && (
            <p className="text-[11px] text-emerald-400 mt-1.5 px-0.5">
              BYOK connected{openrouterInfo ? ` · $${openrouterInfo.balance.toFixed(2)}` : ''}
            </p>
          )}

          {/* System prompt */}
          <details className="mt-2">
            <summary className="text-[11px] text-muted-foreground/70 cursor-pointer hover:text-foreground transition-colors select-none">
              System prompt
            </summary>
            <textarea
              value={systemPrompt || ""}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="Custom instructions for the AI..."
              className="mt-1 w-full bg-input/50 border border-border rounded p-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
            />
          </details>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonChatItem key={i} />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="text-muted-foreground/40 mb-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Send a message to start</p>
            </div>
          ) : grouped.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                {group.label}
              </div>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeId}
                  onSelect={() => onSelect(session.id)}
                  onDelete={() => onDelete(session.id)}
                  onRename={(title) => onRename(session.id, title)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Memory section */}
        <MemorySection />

        {/* Footer: auth/status */}
        <div className="border-t border-border p-3">
          {user ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                <a href="/settings" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Settings
                </a>
              </div>
              {openrouterConnected ? (
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  OpenRouter connected
                </p>
              ) : (
                <button
                  onClick={connectOpenRouter}
                  className="text-[10px] text-primary hover:underline"
                >
                  Connect OpenRouter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <a href="/auth/login" className="text-xs text-primary hover:underline block">
                Sign in for premium models &rarr;
              </a>
              {!openrouterConnected && (
                <button
                  onClick={connectOpenRouter}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors block"
                >
                  or connect OpenRouter (BYOK)
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}