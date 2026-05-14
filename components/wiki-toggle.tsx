"use client";

export function WikiToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="accent-emerald-500"
      />
      <span className="text-muted-foreground">Wiki</span>
    </label>
  );
}