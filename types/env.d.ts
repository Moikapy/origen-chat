/// <reference types="@cloudflare/workers-types" />

/// Cloudflare Workers environment bindings
interface CloudflareEnv {
  DB: D1Database;
  RESEND_API_KEY: string;
  OPENROUTER_ENCRYPT_KEY: string;
  OPENROUTER_ENCRYPT_KEY_PREVIOUS?: string;
  APP_URL?: string;
}