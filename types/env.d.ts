/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  DB: D1Database;
  SEB: SendEmail; // Cloudflare Email Sending binding
  RESEND_API_KEY: string;
  OPENROUTER_ENCRYPT_KEY: string;
  OPENROUTER_ENCRYPT_KEY_PREVIOUS?: string;
  APP_URL?: string;
}