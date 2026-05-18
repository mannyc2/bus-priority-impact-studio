type RouteBadgeSize = "sm" | "md" | "lg" | "xl";

const badgeSizes = {
  sm: { h: 18, fs: 10.5, gap: 3, r: 3, w: [24, 32, 40, 50], sbsW: 32 },
  md: { h: 22, fs: 12.5, gap: 4, r: 3, w: [30, 40, 50, 62], sbsW: 40 },
  lg: { h: 28, fs: 15, gap: 5, r: 3, w: [38, 51, 64, 79], sbsW: 51 },
  xl: { h: 36, fs: 19, gap: 6, r: 4, w: [48, 65, 81, 100], sbsW: 65 },
} as const;

function badgeWidth(widths: readonly [number, number, number, number], charCount: number): number {
  if (charCount <= 2) return widths[0];
  if (charCount === 3) return widths[1];
  if (charCount === 4) return widths[2];
  return widths[3];
}

function routeColor(route: string, express: boolean): string {
  if (express) return "var(--bp-route-express)";
  const prefix = route.match(/^(BxM|BM|QM|Bx|SI|M|B|Q|S|X)/)?.[1] ?? "M";
  if (prefix === "Bx") return "var(--bp-route-bronx)";
  if (prefix === "B") return "var(--bp-route-brooklyn)";
  if (prefix === "Q") return "var(--bp-route-queens)";
  if (prefix === "SI" || prefix === "S") return "var(--bp-route-si)";
  if (prefix === "X" || prefix === "BM" || prefix === "BxM" || prefix === "QM") {
    return "var(--bp-route-express)";
  }
  return "var(--bp-route-manhattan)";
}

export function RouteBadge({
  route,
  size = "md",
  sbs = false,
  express = false,
}: {
  route: string;
  size?: RouteBadgeSize;
  sbs?: boolean;
  express?: boolean;
}) {
  const badge = badgeSizes[size];
  const background = routeColor(route, express);
  const baseClass =
    "inline-flex items-center justify-center font-sans font-bold leading-none tracking-[0.01em] tabular-nums";
  const baseStyle = {
    borderRadius: badge.r,
    boxSizing: "border-box" as const,
    fontSize: badge.fs,
    height: badge.h,
  };

  return (
    <span className="inline-flex items-center align-middle" style={{ gap: badge.gap }}>
      <span
        className={baseClass}
        style={{
          ...baseStyle,
          background,
          color: "white",
          width: badgeWidth(badge.w, route.length),
        }}
      >
        {route}
      </span>
      {sbs ? (
        <span
          className={baseClass}
          style={{
            ...baseStyle,
            background: "white",
            border: `1.5px solid ${background}`,
            color: background,
            letterSpacing: "0.06em",
            width: badge.sbsW,
          }}
        >
          SBS
        </span>
      ) : null}
    </span>
  );
}
