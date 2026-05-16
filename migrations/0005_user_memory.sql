-- Migration: User memory table for three-tiered memory system
-- Stores per-user facts extracted from conversations
-- Phase 1 of the Hermes-inspired memory architecture
-- Applied: 2026-05-15

CREATE TABLE IF NOT EXISTS user_memory (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_updated ON user_memory(user_id, updated_at DESC);