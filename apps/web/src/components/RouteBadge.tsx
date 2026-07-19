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
  const prefix = route.toUpperCase().match(/^(BXM|BM|QM|BX|SI|M|B|Q|S|X)/)?.[1] ?? "M";
  if (prefix === "BX") return "var(--bp-route-bronx)";
  if (prefix === "B") return "var(--bp-route-brooklyn)";
  if (prefix === "Q") return "var(--bp-route-queens)";
  if (prefix === "SI" || prefix === "S") return "var(--bp-route-si)";
  if (prefix === "X" || prefix === "BM" || prefix === "BXM" || prefix === "QM") {
    return "var(--bp-route-express)";
  }
  return "var(--bp-route-manhattan)";
}

export function RouteBadge({
  route,
  size = "md",
  sbs = false,
  express = false,
  displayLabel,
}: {
  route: string;
  size?: RouteBadgeSize;
  sbs?: boolean;
  express?: boolean;
  displayLabel?: string | undefined;
}) {
  const badge = badgeSizes[size];
  // `sbs` is presentation metadata only. Route text comes from the selected
  // source-backed display label (or the supplied route literal for legacy rows);
  // never manufacture a suffix from a boolean service classification.
  const display = displayLabel ?? route;
  const usesLabelWidth = displayLabel !== undefined || sbs || display.length > 4;
  const background = routeColor(route, express);

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
        // Bare identifiers keep their fixed-width roundel; longer official labels grow with padding.
        ...(usesLabelWidth
          ? { minWidth: badgeWidth(badge.w, display.length), paddingInline: badge.pad }
          : { width: badgeWidth(badge.w, display.length) }),
      }}
    >
      {display}
    </span>
  );
}
