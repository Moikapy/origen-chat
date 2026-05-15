-- Migration: Rate limiting table
-- Stores per-IP request counts for sliding window rate limiting
-- Applied: 2026-05-15

CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip, window_start);