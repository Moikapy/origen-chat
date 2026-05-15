/** Error type determines styling */
export type ErrorKind = "rate_limit" | "network" | "auth" | "general";

export function classifyError(message: string): ErrorKind {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("free-models-per-min")) return "rate_limit";
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection") || lower.includes("interrupted") || lower.includes("body stream already read")) return "network";
  if (lower.includes("no api key") || lower.includes("sign in") || lower.includes("unauthorized") || lower.includes("401")) return "auth";
  return "general";
}