export function BeforeAfter({
  before,
  after,
  max = Math.max(before, after),
}: {
  before: number;
  after: number;
  max?: number;
}) {
  const width = 140;
  const safeMax = max || 1;
  const rows = [
    {
      label: "before",
      value: before,
      color: "var(--bp-color-ink-40)",
      weight: 400,
    },
    {
      label: "after",
      value: after,
      color: after > before ? "var(--bp-color-good)" : "var(--bp-color-bad)",
      weight: 600,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <div className="w-9 text-[10px] text-[var(--bp-color-ink-55)]">{row.label}</div>
          <div
            className="h-2"
            style={{ width: (row.value / safeMax) * width, background: row.color }}
          />
          <div
            className="font-mono text-[11px] text-[var(--bp-color-ink-70)]"
            style={{ fontWeight: row.weight }}
          >
            {row.value.toFixed(1)}
          </div>
        </div>
      ))}
    </div>
  );
}
