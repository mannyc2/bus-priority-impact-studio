type RouteBadgeSize = "sm" | "md" | "lg" | "xl";

const badgeSizes = {
  sm: { h: 18, fs: 10.5, pad: 5, r: 3, w: [24, 32, 40, 50] },
  md: { h: 22, fs: 12.5, pad: 6, r: 3, w: [30, 40, 50, 62] },
  lg: { h: 28, fs: 15, pad: 7, r: 3, w: [38, 51, 64, 79] },
  xl: { h: 36, fs: 19, pad: 9, r: 4, w: [48, 65, 81, 100] },
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
  // SBS arrives inconsistently across data sources: sometimes only via the `sbs`
  // flag, sometimes baked into the name ("Q44 SBS" / "Q44-SBS"). Normalize to the
  // bare route number, then render the MTA-style "Q44-SBS" as a single roundel -
  // no separate SBS pill, and never doubled.
  const base = route.replace(/[\s-]?SBS$/i, "").trim();
  const isSbs = sbs || base !== route;
  const display = isSbs ? `${base}-SBS` : base;
  const background = routeColor(base, express);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center whitespace-nowrap align-middle font-sans font-bold leading-none tracking-[0.01em] tabular-nums"
      style={{
        borderRadius: badge.r,
        boxSizing: "border-box",
        fontSize: badge.fs,
        height: badge.h,
        background,
        color: "white",
        // Bare numbers keep their fixed-width roundel; SBS names grow with padding.
        ...(isSbs
          ? { minWidth: badgeWidth(badge.w, base.length), paddingInline: badge.pad }
          : { width: badgeWidth(badge.w, base.length) }),
      }}
    >
      {display}
    </span>
  );
}
