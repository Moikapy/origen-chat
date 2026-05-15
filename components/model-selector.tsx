"use client";

import { useModels } from "@/lib/use-models";

export function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const { models, loading } = useModels();

  // Fall back to static list if API hasn't loaded yet
  const freeModels = models.filter((m) => m.free);
  const premiumModels = models.filter((m) => !m.free);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 max-w-[220px] truncate"
    >
      {loading ? (
        <option>Loading models…</option>
      ) : (
        <>
          {freeModels.length > 0 && (
            <optgroup label="Free">
              {freeModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ✓
                </option>
              ))}
            </optgroup>
          )}
          {premiumModels.length > 0 && (
            <optgroup label="Premium">
              {premiumModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.pricing ? `· ${m.pricing.prompt}` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </>
      )}
    </select>
  );
}