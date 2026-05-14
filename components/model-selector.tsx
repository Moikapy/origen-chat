"use client";

import { MODELS, type ModelId } from "@moikapy/origen";

const modelGroups = [
  {
    label: "Free",
    models: Object.entries(MODELS)
      .filter(([, m]) => m.free)
      .map(([id, m]) => ({ id, name: m.name, desc: m.description })),
  },
  {
    label: "Premium",
    models: Object.entries(MODELS)
      .filter(([, m]) => !m.free)
      .map(([id, m]) => ({ id, name: m.name, desc: m.description })),
  },
];

export function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: ModelId) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ModelId)}
      className="text-sm bg-secondary text-secondary-foreground border border-border rounded-md px-2 py-1"
    >
      {modelGroups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}