/**
 * Get D1 database binding from Cloudflare Workers context.
 * This works at runtime on Workers. During local dev, returns null.
 */
export async function getD1(): Promise<D1Database | null> {
  try {
    // Dynamic import so it's not bundled during Next.js build
    const mod = await import(/* webpackIgnore: true */ "@opennextjs/cloudflare");
    if (typeof mod.getCloudflareContext === "function") {
      const ctx = await mod.getCloudflareContext();
      return ctx.env.DB;
    }
  } catch {
    // Not running on Cloudflare Workers
  }
  return null;
}

/**
 * Get Cloudflare env bindings at runtime.
 */
export async function getEnv(): Promise<Record<string, string | undefined>> {
  try {
    const mod = await import(/* webpackIgnore: true */ "@opennextjs/cloudflare");
    if (typeof mod.getCloudflareContext === "function") {
      const ctx = await mod.getCloudflareContext();
      return {
        RESEND_API_KEY: ctx.env.RESEND_API_KEY,
        OPENROUTER_ENCRYPT_KEY: ctx.env.OPENROUTER_ENCRYPT_KEY,
        APP_URL: ctx.env.APP_URL,
      };
    }
  } catch {}
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    OPENROUTER_ENCRYPT_KEY: process.env.OPENROUTER_ENCRYPT_KEY,
    APP_URL: process.env.APP_URL,
  };
}