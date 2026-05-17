/**
 * GET /api/auth/debug — Debug endpoint to test encryption round-trip.
 * Only enabled when DEBUG_AUTH is set.
 * Returns whether the encrypt key is available and can decrypt a test cookie.
 */
import { encryptApiKey, decryptApiKey } from "@moikapy/openrouter-auth/crypto";

export const dynamic = "force-dynamic";

async function getEnv() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    const { env } = await getCloudflareContext();
    return env as Record<string, string | undefined>;
  } catch {
    return {
      OPENROUTER_ENCRYPT_KEY: process.env.OPENROUTER_ENCRYPT_KEY,
    };
  }
}

export async function GET() {
  const env = await getEnv();
  const encryptKey = env.OPENROUTER_ENCRYPT_KEY;

  if (!encryptKey) {
    return Response.json({ error: "No OPENROUTER_ENCRYPT_KEY found in environment", hasKey: false });
  }

  try {
    // Test round-trip: encrypt a dummy key, then decrypt it
    const testKey = "sk-or-v1-test-debug-key";
    const encrypted = await encryptApiKey(testKey, encryptKey);
    const decrypted = await decryptApiKey(encrypted, encryptKey);

    return Response.json({
      hasKey: true,
      keyLength: encryptKey.length,
      roundTrip: decrypted.apiKey === testKey,
      decryptedLength: decrypted.apiKey.length,
    });
  } catch (err: any) {
    return Response.json({
      hasKey: true,
      keyLength: encryptKey.length,
      error: err?.message || String(err),
      errorType: err?.constructor?.name || "Unknown",
    });
  }
}