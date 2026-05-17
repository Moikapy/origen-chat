/**
 * Error sanitization utilities.
 *
 * Prevents internal error messages from leaking to clients.
 * In production, returns generic messages; in dev, preserves details.
 */

/** Check if we're in a development environment */
function isDev(): boolean {
  // Local dev won't have a D1 binding, and NODE_ENV may be undefined in Workers
  return !process.env.OPENROUTER_ENCRYPT_KEY && !process.env.CF_PAGES;
}

/**
 * Sanitize an error for client response.
 * - In production: returns a generic message
 * - In development: preserves the original message for debugging
 *
 * Always logs the real error server-side.
 */
export function sanitizeError(err: unknown, context?: string): { message: string; status: number } {
  const originalMessage = err instanceof Error ? err.message : String(err);

  // Always log the real error server-side
  if (context) {
    console.error(`[${context}] Error:`, originalMessage);
  }

  // Known error patterns that are safe to expose
  const safePatterns: Array<{ pattern: RegExp; message: string; status: number }> = [
    { pattern: /rate limit/i, message: "Rate limit reached. Please try again later.", status: 429 },
    { pattern: /invalid model/i, message: "Invalid model specified.", status: 400 },
    { pattern: /messages must be/i, message: "Invalid request format.", status: 400 },
    { pattern: /too many messages/i, message: "Too many messages in request.", status: 400 },
    { pattern: /too long/i, message: "Request payload too large.", status: 400 },
    { pattern: /no api key/i, message: "Authentication required.", status: 401 },
    { pattern: /invalid.*key/i, message: "Invalid API key format.", status: 400 },
    { pattern: /email required/i, message: "Email is required.", status: 400 },
    { pattern: /missing authorization code/i, message: "Missing authorization code.", status: 400 },
    { pattern: /server not configured/i, message: "Service temporarily unavailable.", status: 503 },
    { pattern: /forbidden/i, message: "Forbidden.", status: 403 },
    { pattern: /unauthorized/i, message: "Authentication required.", status: 401 },
  ];

  for (const { pattern, message, status } of safePatterns) {
    if (pattern.test(originalMessage)) {
      return { message, status };
    }
  }

  // In development, preserve error details for debugging
  if (isDev()) {
    return { message: originalMessage, status: 500 };
  }

  // In production, return generic error
  return { message: "An internal error occurred. Please try again.", status: 500 };
}