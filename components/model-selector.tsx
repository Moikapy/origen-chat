"use client";

import { useModels } from "@/lib/use-models";
import { getProviderBadge, isRouterModel } from "@/lib/models";
import { Skeleton } from "@/components/skeleton";
import { useAuth } from "@/lib/auth";
import { useOllama } from "@/lib/use-ollama";

export function ModelSelector({
  value,
  onChange,
  /** If true, only show free models (guest without BYOK key) */
  freeOnly = false,
  /** If true, user has a BYOK key — premium models use their key */
  byok = false,
}: {
  value: string;
  onChange: (model: string) => void;
  freeOnly?: boolean;
  byok?: boolean;
}) {
  const { models, loading } = useModels();
  const { openrouterConnected } = useAuth();
  const { models: ollamaModels, connected: ollamaConnected } = useOllama();

  const routerModels = models.filter((m) => isRouterModel(m.id));
  const freeModels = models.filter((m) => m.free && !isRouterModel(m.id));
  const premiumModels = models.filter((m) => !m.free && !isRouterModel(m.id));

  // Guests without BYOK: only free models
  // BYOK users: all models (they pay)
  // Authenticated without BYOK: all models (credits will gate later)
  const showPremium = byok || !freeOnly || openrouterConnected;

  return loading ? (
    <Skeleton className="h-9 w-full rounded-md" />
  ) : (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 w-full truncate"
    >
      {/* Smart routers */}
      {routerModels.length > 0 && showPremium && (
        <optgroup label="Smart Routers">
          {routerModels.map((m) => {
            const badge = getProviderBadge(m.id);
            return (
              <option key={m.id} value={m.id}>
                [{badge.text}] {m.name}
              </option>
            );
          })}
        </optgroup>
      )}

      {/* Always show free models */}
      {freeModels.length > 0 && (
        <optgroup label="Free">
          {freeModels.map((m) => {
            const badge = getProviderBadge(m.id);
            return (
              <option key={m.id} value={m.id}>
                [{badge.text}] {m.name}
              </option>
            );
          })}
        </optgroup>
      )}

      {/* Premium models — only if user has BYOK or is authenticated */}
      {showPremium && premiumModels.length > 0 && (
        <optgroup label={byok || openrouterConnected ? "Premium (your key)" : "Premium"}>
          {premiumModels.map((m) => {
            const badge = getProviderBadge(m.id);
            return (
              <option key={m.id} value={m.id}>
                [{badge.text}] {m.name} {m.pricing ? `· ${m.pricing.prompt}` : ""}
              </option>
            );
          })}
        </optgroup>
      )}

      {/* Locked premium — shown when user can't access but needs to see what they're missing */}
      {!showPremium && premiumModels.length > 0 && (
        <optgroup label="Premium (sign in or BYOK)">
          {premiumModels.slice(0, 5).map((m) => {
            const badge = getProviderBadge(m.id);
            return (
              <option key={m.id} value={m.id} disabled>
                [{badge.text}] {m.name} · {m.pricing?.prompt ?? "varies"}
              </option>
            );
          })}
        </optgroup>
      )}

      {/* Ollama — connected shows models, disconnected shows setup prompt */}
      {ollamaConnected && ollamaModels.length > 0 ? (
        <optgroup label="Ollama Cloud">
          {ollamaModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.sizeLabel})
            </option>
          ))}
        </optgroup>
      ) : (
        <optgroup label="Ollama Cloud">
          <option value="__ollama_setup__" disabled>
            Add API key in Settings
          </option>
        </optgroup>
      )}
    </select>
  );
}