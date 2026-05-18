export type Direction = "NB" | "SB" | "EB" | "WB";

export function DirIndicator({ dir, muted = false }: { dir: Direction; muted?: boolean }) {
  const arrow = { NB: "↑", SB: "↓", EB: "→", WB: "←" }[dir];
  return (
    <span
      className={`inline-flex items-baseline gap-[3px] font-mono text-[10.5px] font-bold leading-none tracking-[0.04em] ${
        muted ? "text-[var(--bp-color-ink-40)]" : "text-[var(--bp-color-ink-55)]"
      }`}
    >
      <span className="translate-y-px text-[13px] leading-none">{arrow}</span>
      <span>{dir}</span>
    </span>
  );
}
