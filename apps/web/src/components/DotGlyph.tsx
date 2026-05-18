type DotTone = "good" | "accent" | "warn";

const toneVar: Record<DotTone, string> = {
  good: "var(--bp-color-good)",
  accent: "var(--bp-color-accent)",
  warn: "var(--bp-color-warn)",
};

export function DotGlyph({
  label,
  on,
  tone = "good",
}: {
  label: string;
  on: boolean;
  tone?: DotTone;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-2.5 items-center">
        <div
          className="size-[9px] rounded-full"
          style={{
            background: on ? toneVar[tone] : "transparent",
            boxShadow: on ? "none" : "inset 0 0 0 1.2px var(--bp-color-ink-20)",
          }}
        />
      </div>
      <div
        className={`text-[8.5px] font-bold tracking-[0.08em] ${
          on ? "text-[var(--bp-color-ink-70)]" : "text-[var(--bp-color-ink-40)]"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
