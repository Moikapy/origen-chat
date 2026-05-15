import { MODELS } from "./models";
import {
  RateLimiter,
  ensureTable,
  ensureIndex,
  validateUrl as cfValidateUrl,
  type SSRFResult,
  type RateLimitResult as CfRateLimitResult,
} from "@moikapy/cf-helpers";

// ── Constants ──────────────────────────────────────────────────────────
export const MAX_MESSAGES = 100;
export const MAX_CONTENT_LENGTH = 10_000; // 10KB per message
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 20; // per IP per minute for anonymous
export const RATE_LIMIT_MAX_REQUESTS_AUTHED = 60; // per IP per minute for authed

/** Server-side model whitelist — only these models are accepted */
export const MODEL_WHITELIST = new Set(Object.keys(MODELS));

// ── Chat Request Validation ────────────────────────────────────────────

interface ChatRequestInput {
  messages: Array<{ role: string; content: string }>;
  model: string;
  wiki: boolean;
  ollamaBaseUrl?: string;
  ollamaApiKey?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateChatRequest(input: ChatRequestInput): ValidationResult {
  const { messages, model, ollamaBaseUrl, ollamaApiKey } = input;

  // Validate messages exist
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "Messages must be a non-empty array" };
  }

  // Cap message count
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, error: `Too many messages (max ${MAX_MESSAGES})` };
  }

  // Validate each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Validate role
    if (msg.role !== "user" && msg.role !== "assistant") {
      return { ok: false, error: `Invalid role at index ${i}: must be "user" or "assistant"` };
    }

    // Validate content type
    if (typeof msg.content !== "string") {
      return { ok: false, error: `Invalid content at index ${i}: must be a string` };
    }

    // Cap content length
    if (msg.content.length > MAX_CONTENT_LENGTH) {
      return { ok: false, error: `Message ${i} is too long (max ${MAX_CONTENT_LENGTH / 1000}KB)` };
    }
  }

  // Validate model against whitelist
  if (!MODEL_WHITELIST.has(model)) {
    return { ok: false, error: `Invalid model: ${model}` };
  }

  // Validate ollamaBaseUrl if present — delegate to cf-helpers SSRF guard
  if (ollamaBaseUrl) {
    const urlResult = sanitizeOllamaUrl(ollamaBaseUrl);
    if (!urlResult.ok) {
      return { ok: false, error: `Invalid Ollama URL: ${urlResult.error}` };
    }
  }

  // Validate ollamaApiKey — must be a non-empty string if provided
  if (ollamaApiKey !== undefined && (typeof ollamaApiKey !== "string" || ollamaApiKey.length === 0)) {
    return { ok: false, error: "Invalid Ollama API key" };
  }

  // Cap ollamaApiKey length to prevent abuse
  if (ollamaApiKey && ollamaApiKey.length > 200) {
    return { ok: false, error: "Ollama API key too long" };
  }

  return { ok: true };
}

// ── SSRF Protection (delegates to @moikapy/cf-helpers/ssrf) ──────────────

/** Re-export SSRF validation from cf-helpers */
export { validateUrl } from "@moikapy/cf-helpers/ssrf";

/** Check if an IPv4 address is private/reserved */
export function isPrivateIP(ip: string): boolean {
  // Must look like an IPv4 address first
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return true;
  const result = cfValidateUrl(`http://${ip}/`);
  return !result.ok;
}

/** Validate and sanitize an Ollama base URL */
export function sanitizeOllamaUrl(
  rawUrl: string,
  options: { allowLocalhost?: boolean } = {},
): SSRFResult {
  return cfValidateUrl(rawUrl, options);
}

// ── Rate Limiting (delegates to @moikapy/cf-helpers/rate-limit) ────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix ms
}

// Singleton rate limiter per D1 instance
const limiters = new WeakMap<object, RateLimiter>();

function getLimiter(d1: any): RateLimiter {
  if (!limiters.has(d1)) {
    limiters.set(d1, new RateLimiter(d1, {
      anonymousLimit: RATE_LIMIT_MAX_REQUESTS,
      authenticatedLimit: RATE_LIMIT_MAX_REQUESTS_AUTHED,
      windowMs: RATE_LIMIT_WINDOW_MS,
    }));
  }
  return limiters.get(d1)!;
}

/**
 * Per-user/IP rate limiter using D1.
 * Delegates to @moikapy/cf-helpers RateLimiter class.
 */
export async function checkRateLimit(
  d1: any,
  ip: string,
  authenticated: boolean,
  userId?: string | null,
): Promise<RateLimitResult> {
  const limiter = getLimiter(d1);
  return limiter.check(ip, authenticated, userId);
}

/** Create the rate_limits table if it doesn't exist */
export async function ensureRateLimitTable(d1: any): Promise<void> {
  // Delegates to @moikapy/cf-helpers d1-helpers — never d1.exec()
  await ensureTable(d1, "rate_limits", "ip TEXT NOT NULL, user_id TEXT, window_start INTEGER NOT NULL");
  await ensureIndex(d1, "idx_rate_limits_ip", "rate_limits(ip, window_start)");
  await ensureIndex(d1, "idx_rate_limits_user", "rate_limits(user_id, window_start)");
}