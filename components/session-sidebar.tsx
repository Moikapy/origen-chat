"use client";

import { useState } from "react";
import type { Session } from "@/lib/session-store";

interface SessionSidebarProps {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
  open: boolean;
  onClose: () => void;
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

  if (editing) {
    return (
      <div className="px-2 py-1.5">
        <input
          className="w-full bg-border text-foreground text-sm rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring"
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
      className={`group flex items-start gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{session.title}</div>
        <div className="text-xs opacity-60 mt-0.5">
          {session.messages.length} msg{session.messages.length !== 1 ? "s" : ""} · {relativeTime(session.updatedAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all text-xs p-0.5"
        title="Delete"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onNew,
  open,
  onClose,
}: SessionSidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative top-0 left-0 h-full z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-semibold">Chats</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onNew}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              New
            </button>
            <button
              onClick={onClose}
              className="lg:hidden text-muted-foreground hover:text-foreground p-0.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No conversations yet
            </p>
          )}
          {sessions.map((session) => (
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
      </aside>
    </>
  );
}