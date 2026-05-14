"use client";

import { MODEL_GROUPS, type ModelId } from "@/lib/models";

export function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: ModelId | string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ModelId)}
      className="text-sm bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 max-w-[220px] truncate"
    >
      {MODEL_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.free ? "✓" : m.pricing ? `· ${m.pricing.prompt}` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}