export function StudioMark({
  size = 22,
  tone = "dark",
}: {
  size?: number;
  tone?: "dark" | "light";
}) {
  const background = tone === "dark" ? "var(--bp-color-ink)" : "var(--bp-color-paper)";
  const foreground = tone === "dark" ? "var(--bp-color-paper)" : "var(--bp-color-ink)";

  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect width="22" height="22" rx="3.5" fill={background} />
      <rect x="4" y="4.5" width="14" height="13" rx="1.8" fill={foreground} />
      <rect x="5.5" y="6.5" width="4" height="3" rx="0.6" fill={background} />
      <rect x="12.5" y="6.5" width="4" height="3" rx="0.6" fill={background} />
      <rect x="4" y="11.5" width="14" height="0.6" fill={background} opacity="0.35" />
      <rect x="4" y="14.5" width="14" height="1.6" fill="var(--bp-color-accent)" />
      <rect x="5.5" y="17.4" width="2.6" height="1.4" rx="0.5" fill={foreground} />
      <rect x="13.9" y="17.4" width="2.6" height="1.4" rx="0.5" fill={foreground} />
    </svg>
  );
}
