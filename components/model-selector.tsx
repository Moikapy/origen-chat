"use client";

import { useModels } from "@/lib/use-models";
import { getProviderBadge } from "@/lib/models";
import { Skeleton } from "@/components/skeleton";

export function ModelSelector({
  value,
  onChange,
  freeOnly = false,
}: {
  value: string;
  onChange: (model: string) => void;
  freeOnly?: boolean;
}) {
  const { models, loading } = useModels();

  const freeModels = models.filter((m) => m.free);
  const premiumModels = models.filter((m) => !m.free);

  return loading ? (
    <Skeleton className="h-9 w-full rounded-md" />
  ) : (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 w-full truncate"
    >
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
      {!freeOnly && premiumModels.length > 0 && (
        <optgroup label="Premium">
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
    </select>
  );
}