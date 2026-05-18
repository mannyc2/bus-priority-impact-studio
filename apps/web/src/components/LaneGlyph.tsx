export type LaneState = "yes" | "partial" | "minimal" | "none";

export function LaneGlyph({ state, label = "LANE" }: { state: LaneState; label?: string }) {
  const count = state === "yes" ? 3 : state === "partial" ? 2 : state === "minimal" ? 1 : 0;
  const color =
    state === "yes"
      ? "var(--bp-color-good)"
      : state === "partial" || state === "minimal"
        ? "var(--bp-color-warn)"
        : "var(--bp-color-ink-20)";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-2.5 gap-[1.5px]">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-2.5 w-[5px] rounded-[1px]"
            style={{
              background: index < count ? color : "transparent",
              boxShadow: index < count ? "none" : "inset 0 0 0 1px var(--bp-color-ink-20)",
            }}
          />
        ))}
      </div>
      <div className="text-[8.5px] font-bold tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
    </div>
  );
}
