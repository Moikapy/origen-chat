import { MODELS } from "./models";

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

  // Validate ollamaBaseUrl if present
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

// ── SSRF Protection ────────────────────────────────────────────────────

/** Check if an IPv4 address is private/reserved */
export function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true; // treat malformed as private

  const [a, b] = parts;

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local / AWS metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 224.0.0.0/4 (multicast + reserved)
  if (a >= 224) return true;

  return false;
}

interface OllamaUrlResult {
  ok: boolean;
  error?: string;
  url?: string;
}

/** Validate and sanitize an Ollama base URL */
export function sanitizeOllamaUrl(
  rawUrl: string,
  options: { allowLocalhost?: boolean } = {},
): OllamaUrlResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }

  // Only allow http: and https: protocols
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only HTTPS and HTTP protocols are allowed" };
  }

  const hostname = url.hostname;

  // Block localhost unless explicitly allowed (for development)
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    if (!options.allowLocalhost) {
      return { ok: false, error: "Private/local addresses are not allowed" };
    }
  }

  // Block private IPs
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      return { ok: false, error: "Private IP addresses are not allowed" };
    }
  }

  // Block .local, .internal, .localhost TLDs
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) {
    return { ok: false, error: "Private hostnames are not allowed" };
  }

  // Remove trailing slash for consistency
  const sanitized = url.toString().replace(/\/+$/, "");
  return { ok: true, url: sanitized };
}

// ── Rate Limiting ───────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix ms
}

/**
 * Per-user/IP rate limiter using D1.
 * Authenticated users: rate limited by user_id (higher limit).
 * Anonymous users: rate limited by IP (lower limit).
 */
export async function checkRateLimit(
  d1: any,
  ip: string,
  authenticated: boolean,
  userId?: string | null,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const maxRequests = authenticated ? RATE_LIMIT_MAX_REQUESTS_AUTHED : RATE_LIMIT_MAX_REQUESTS;

  // Clean up old entries
  await d1.prepare(
    "DELETE FROM rate_limits WHERE window_start < ?1"
  ).bind(windowStart).run();

  // Count: prefer user_id for authenticated users, else fall back to IP
  const count = userId
    ? await d1.prepare(
        "SELECT COUNT(*) as cnt FROM rate_limits WHERE user_id = ?1 AND window_start > ?2"
      ).bind(userId, windowStart).first()
    : await d1.prepare(
        "SELECT COUNT(*) as cnt FROM rate_limits WHERE ip = ?1 AND window_start > ?2"
      ).bind(ip, windowStart).first();

  const currentCount = (count as any)?.cnt ?? 0;

  if (currentCount >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  // Record this request with both ip and user_id
  await d1.prepare(
    "INSERT INTO rate_limits (ip, user_id, window_start) VALUES (?1, ?2, ?3)"
  ).bind(ip, userId || null, now).run();

  return {
    allowed: true,
    remaining: maxRequests - currentCount - 1,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };
}

/** Create the rate_limits table if it doesn't exist */
export async function ensureRateLimitTable(d1: any): Promise<void> {
  // Use prepare().run() instead of exec() — exec() fails with multi-line SQL
  // and has unpredictable behavior in production D1.
  // See ADR-001: Use d1.prepare() over d1.exec() for all D1 operations.
  try {
    await d1.prepare("CREATE TABLE IF NOT EXISTS rate_limits (ip TEXT NOT NULL, user_id TEXT, window_start INTEGER NOT NULL)").run();
  } catch { /* table already exists */ }
  try {
    await d1.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip, window_start)").run();
  } catch { /* index already exists */ }
  try {
    await d1.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limits_user ON rate_limits(user_id, window_start)").run();
  } catch { /* index already exists */ }
}