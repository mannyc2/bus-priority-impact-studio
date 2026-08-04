import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import type { NetworkMapFeature } from "@/studio/api-client";

/**
 * Attention scale (080 comp round 3, approved): routes at or above typical
 * draw in one neutral ink; color marks only the slow/heavy side in graded
 * steps. Thresholds are fixed for the release and never renormalize under
 * filters or period changes.
 */
export type NetworkLens = "speed" | "delay";
export type NetworkEncoding = "speed" | "delay" | "delta";

export type MapPeriod = "all" | "am" | "pm";

export const NETWORK_BOROUGHS = [
  "Bronx",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Staten Island",
] as const;

export type NetworkBorough = (typeof NETWORK_BOROUGHS)[number];

/**
 * Borough membership comes from the verified network artifact, never the
 * route-prefix family label. An empty membership is an explicit evidence gap:
 * keep it in the citywide view, but do not guess a borough for filtering.
 */
export function filterNetworkFeaturesByBorough(
  features: readonly NetworkMapFeature[],
  borough: NetworkBorough | undefined,
): NetworkMapFeature[] {
  return borough === undefined
    ? [...features]
    : features.filter((feature) => feature.properties.servedBoroughs.includes(borough));
}

export function unverifiedBoroughFeatureCount(features: readonly NetworkMapFeature[]): number {
  return features.filter((feature) => feature.properties.servedBoroughs.length === 0).length;
}

/** Only exact matched joins can participate in a durable shared segment URL. */
export function routeSegmentSpineIds(
  collection: MapRouteSegmentFeatureCollection,
): Array<string | null> {
  return collection.features.map((feature) =>
    feature.properties.spineJoinStatus === "matched" ? feature.properties.spineSegmentId : null,
  );
}

/** Keyboard focus wins without allowing pointer leave to erase it (and vice versa). */
export function resolvePreviewRouteId(
  focusedRouteId: string | null,
  pointerRouteId: string | null,
): string | null {
  return focusedRouteId ?? pointerRouteId;
}

export const PERIOD_HOURS: Record<MapPeriod, number[] | null> = {
  all: null, // use currentMph
  am: [7, 8, 9], // AM peak
  pm: [16, 17, 18, 19], // PM peak
};

export function periodSpeed(
  feature: NetworkMapFeature,
  period: MapPeriod,
): { value: number | null; observedHours: number; expectedHours: number } {
  const hours = PERIOD_HOURS[period];
  if (hours === null) {
    return { value: feature.properties.currentMph, observedHours: 1, expectedHours: 1 };
  }
  const observed = hours.flatMap((hour) => {
    const speed = feature.properties.hourlySpeedMph[hour];
    const traversals = feature.properties.hourlyTraversalCount[hour] ?? 0;
    return speed === null || speed === undefined || traversals <= 0 ? [] : [{ speed, traversals }];
  });
  const minimumHours = period === "am" ? 2 : 3;
  if (observed.length < minimumHours) {
    return { value: null, observedHours: observed.length, expectedHours: hours.length };
  }
  const traversals = observed.reduce((sum, row) => sum + row.traversals, 0);
  return {
    value: observed.reduce((sum, row) => sum + row.speed * row.traversals, 0) / traversals,
    observedHours: observed.length,
    expectedHours: hours.length,
  };
}

/** A shareable peak period is enabled only when the mapped universe is complete. */
export function periodEligible(
  features: readonly NetworkMapFeature[],
  period: Exclude<MapPeriod, "all">,
): boolean {
  return (
    features.length > 0 && features.every((feature) => periodSpeed(feature, period).value !== null)
  );
}

export type NetworkView = {
  lens: NetworkLens;
  period: MapPeriod;
  /** "vs all day" compare mode; meaningful only for speed at AM/PM. */
  compare: boolean;
};

export function viewEncoding(view: NetworkView): NetworkEncoding {
  if (view.lens === "speed" && view.compare && view.period !== "all") return "delta";
  return view.lens;
}

export const SPEED_CLASS_COLORS = ["#9e2b21", "#c96f2f", "#9aa2ab"] as const;
export const DELAY_CLASS_COLORS = ["#9aa2ab", "#9a7ec7", "#65369f", "#38106e"] as const;
export const DELTA_CLASS_COLORS = ["#5b2d8f", "#9b7fc4", "#9aa2ab", "#2f8f83"] as const;
export const NO_DATA_COLOR = "rgba(16, 20, 24, 0.28)";
export const BUS_LANE_COLOR = "#1f7a4d";

export function speedClass(value: number | null): number | null {
  if (value === null) return null;
  return value < 7 ? 0 : value < 8 ? 1 : 2;
}

export function delayClass(value: number | null): number | null {
  if (value === null) return null;
  return value < 8_000 ? 0 : value < 15_000 ? 1 : value < 40_000 ? 2 : 3;
}

export function deltaClass(value: number | null): number | null {
  if (value === null) return null;
  return value <= -1.5 ? 0 : value <= -0.75 ? 1 : value < 0.75 ? 2 : 3;
}

export function featureValue(feature: NetworkMapFeature, view: NetworkView): number | null {
  const encoding = viewEncoding(view);
  if (encoding === "delay") return feature.properties.riderHoursLost;
  const period = periodSpeed(feature, view.period).value;
  if (encoding === "delta") {
    const allDay = feature.properties.currentMph;
    if (period === null || allDay === null) return null;
    return Math.round((period - allDay) * 10) / 10;
  }
  return period;
}

export function featureClass(feature: NetworkMapFeature, view: NetworkView): number | null {
  const value = featureValue(feature, view);
  const encoding = viewEncoding(view);
  if (encoding === "delay") return delayClass(value);
  if (encoding === "delta") return deltaClass(value);
  return speedClass(value);
}

export type FeatureStyle = { color: string; sortKey: number; noData: boolean };

/** Color + paint order for one feature. Higher sortKey paints on top. */
export function featureStyle(feature: NetworkMapFeature, view: NetworkView): FeatureStyle {
  const cls = featureClass(feature, view);
  if (cls === null) return { color: NO_DATA_COLOR, sortKey: -1, noData: true };
  const encoding = viewEncoding(view);
  if (encoding === "delay") {
    return { color: DELAY_CLASS_COLORS[cls] ?? NO_DATA_COLOR, sortKey: cls, noData: false };
  }
  if (encoding === "delta") {
    const order = [3, 2, 0, 1];
    return {
      color: DELTA_CLASS_COLORS[cls] ?? NO_DATA_COLOR,
      sortKey: order[cls] ?? 0,
      noData: false,
    };
  }
  return { color: SPEED_CLASS_COLORS[cls] ?? NO_DATA_COLOR, sortKey: 2 - cls, noData: false };
}

const SPEED_BAND_TERMS = ["slowest band", "slow band", null] as const;

export function speedBandTerm(value: number | null): string | null {
  const cls = speedClass(value);
  return cls === null ? null : (SPEED_BAND_TERMS[cls] ?? null);
}

export function compactNumber(value: number | null): string {
  if (value === null) return "No data";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function formatViewValue(feature: NetworkMapFeature, view: NetworkView): string {
  const value = featureValue(feature, view);
  if (value === null) return "No data";
  const encoding = viewEncoding(view);
  if (encoding === "delay") return compactNumber(value);
  if (encoding === "delta") return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
  return value.toFixed(1);
}

export function delayLensEligible(
  features: readonly NetworkMapFeature[],
  coverage: string | null,
): boolean {
  return (
    coverage !== null &&
    features.length > 0 &&
    features.every((feature) => feature.properties.riderHoursLost !== null)
  );
}

/** Slowest-first for speed, heaviest-first for delay, worst slowdown first for delta. */
export function sortFeaturesForView(
  features: readonly NetworkMapFeature[],
  view: NetworkView,
): NetworkMapFeature[] {
  const encoding = viewEncoding(view);
  return features
    .map((feature) => ({ feature, value: featureValue(feature, view) }))
    .sort((left, right) => {
      if (left.value === null && right.value === null) {
        return left.feature.properties.routeId.localeCompare(right.feature.properties.routeId);
      }
      if (left.value === null) return 1;
      if (right.value === null) return -1;
      const valueOrder = encoding === "delay" ? right.value - left.value : left.value - right.value;
      return (
        valueOrder ||
        left.feature.properties.routeId.localeCompare(right.feature.properties.routeId)
      );
    })
    .map((row) => row.feature);
}

export function badgeFeatures(
  features: readonly NetworkMapFeature[],
  view: NetworkView,
  count = 10,
): NetworkMapFeature[] {
  return sortFeaturesForView(features, view)
    .filter((feature) => featureValue(feature, view) !== null)
    .slice(0, count);
}

/** Midpoint of the feature's longest line, for badges and rail-driven popups. */
export function featureAnchor(feature: NetworkMapFeature): readonly [number, number] | null {
  let longest: readonly (readonly [number, number])[] | null = null;
  for (const line of feature.geometry.coordinates) {
    if (longest === null || line.length > longest.length) longest = line;
  }
  const mid = longest?.[Math.floor(longest.length / 2)];
  return mid === undefined ? null : mid;
}

export type LegendBand = {
  key: string;
  label: string;
  color: string;
  /** Dark ink text keeps contrast on the pale bands. */
  darkText: boolean;
  count: number;
};

export type LegendModel = {
  title: string;
  subtitle: string;
  bands: LegendBand[];
  noDataCount: number;
};

export function periodLabel(period: MapPeriod): string {
  if (period === "am") return "AM peak";
  if (period === "pm") return "PM peak";
  return "all day";
}

/**
 * The legend, or nothing at all.
 *
 * A legend whose every band reads `(0)` asserts nothing — it says the colours
 * exist, not that any route is in them — so when no feature classifies, the
 * legend does not render. It returns as soon as facts do.
 */
export function legendModel(
  features: readonly NetworkMapFeature[],
  view: NetworkView,
  coverage: string,
): LegendModel | null {
  const encoding = viewEncoding(view);
  const classes = features.map((feature) => featureClass(feature, view));
  const noDataCount = classes.filter((cls) => cls === null).length;
  const countOf = (cls: number) => classes.filter((value) => value === cls).length;
  if (classes.every((cls) => cls === null)) return null;
  if (encoding === "delay") {
    const labels = ["under 8k", "8 to 15k", "15 to 40k", "40k or more"];
    return {
      title: "Rider-hours of delay",
      subtitle: coverage,
      bands: [3, 2, 1, 0].map((cls) => ({
        key: `delay-${cls}`,
        label: labels[cls] ?? "",
        color: DELAY_CLASS_COLORS[cls] ?? NO_DATA_COLOR,
        darkText: cls === 0,
        count: countOf(cls),
      })),
      noDataCount,
    };
  }
  if (encoding === "delta") {
    const labels = ["1.5+ slower", "0.75 to 1.5 slower", "steady", "faster"];
    return {
      title: `${view.period === "am" ? "AM" : "PM"} peak vs all day, mph`,
      subtitle: "",
      bands: [0, 1, 2, 3].map((cls) => ({
        key: `delta-${cls}`,
        label: labels[cls] ?? "",
        color: DELTA_CLASS_COLORS[cls] ?? NO_DATA_COLOR,
        darkText: cls === 2,
        count: countOf(cls),
      })),
      noDataCount,
    };
  }
  const labels = ["under 7", "7 to 8", "8+ typical or faster"];
  return {
    title: "Average speed, mph",
    subtitle: periodLabel(view.period),
    bands: [0, 1, 2].map((cls) => ({
      key: `speed-${cls}`,
      label: labels[cls] ?? "",
      color: SPEED_CLASS_COLORS[cls] ?? NO_DATA_COLOR,
      darkText: cls === 2,
      count: countOf(cls),
    })),
    noDataCount,
  };
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export type InsightModel = {
  lead: string;
  rest: string;
  /** One standing interaction tip per encoding. Promise only what exists. */
  hint: string;
};

const INSIGHT_HINTS = {
  speed: "Click a route for its numbers; pin it to compare.",
  delay: "Click a route to see its delay exposure.",
  delta: "Click a route to compare peak against all day.",
} as const;

export function insightModel(
  features: readonly NetworkMapFeature[],
  view: NetworkView,
  coverage: string,
): InsightModel {
  const encoding = viewEncoding(view);
  if (encoding === "delay") {
    const ranked = sortFeaturesForView(features, view);
    const top = ranked.find((feature) => featureValue(feature, view) !== null);
    if (top === undefined)
      return { lead: "Rider delay is unavailable.", rest: "", hint: INSIGHT_HINTS.delay };
    const byBorough = new Map<string, number>();
    for (const feature of features) {
      const delay = feature.properties.riderHoursLost;
      const borough = feature.properties.borough;
      if (delay === null || borough === null) continue;
      byBorough.set(borough, (byBorough.get(borough) ?? 0) + delay);
    }
    const boroughs = [...byBorough.entries()].sort((left, right) => right[1] - left[1]);
    const speed = top.properties.currentMph;
    return {
      lead: `${top.properties.label} leads the city:`,
      rest: `${compactNumber(top.properties.riderHoursLost)} rider-hours of delay in ${coverage}${
        speed === null ? "" : ` at ${speed.toFixed(1)} mph`
      }. The heaviest corridors are ${boroughs[0]?.[0] ?? "unavailable"} and ${boroughs[1]?.[0] ?? "unavailable"} locals.`,
      hint: INSIGHT_HINTS.delay,
    };
  }
  if (encoding === "delta") {
    const values = features
      .map((feature) => featureValue(feature, view))
      .filter((value): value is number => value !== null);
    const slower = values.filter((value) => value <= -0.75).length;
    const faster = values.filter((value) => value >= 0.75).length;
    const label = view.period === "am" ? "AM" : "PM";
    return {
      lead: `${slower} routes`,
      rest: `run at least 0.75 mph slower at ${label} peak than their all-day average; ${faster} run faster. The rest hold steady.`,
      hint: INSIGHT_HINTS.delta,
    };
  }
  const classAt = (period: MapPeriod, cls: number) =>
    features.filter(
      (feature) => featureClass(feature, { lens: "speed", period, compare: false }) === cls,
    ).length;
  if (view.period === "all") {
    const boroughMedian = (borough: string) =>
      medianOf(
        features
          .filter((feature) => feature.properties.borough === borough)
          .map((feature) => feature.properties.currentMph)
          .filter((value): value is number => value !== null),
      );
    const manhattan = boroughMedian("Manhattan");
    const statenIsland = boroughMedian("Staten Island");
    const medians =
      manhattan === null || statenIsland === null
        ? ""
        : ` Manhattan's median is ${manhattan.toFixed(1)} mph; Staten Island's is ${statenIsland.toFixed(1)}.`;
    return {
      lead: "Color marks slow routes.",
      rest: `${classAt("all", 0)} run under 7 mph and ${classAt("all", 1)} more under 8; the other ${classAt("all", 2)} ride neutral ink.${medians}`,
      hint: INSIGHT_HINTS.speed,
    };
  }
  const changed = features.filter((feature) => {
    const allBand = featureClass(feature, { lens: "speed", period: "all", compare: false });
    const periodBand = featureClass(feature, view);
    return allBand !== null && periodBand !== null && allBand !== periodBand;
  }).length;
  const label = view.period === "am" ? "AM" : "PM";
  return {
    lead: `${label} peak: ${classAt(view.period, 0)} routes under 7 mph`,
    rest: `up from ${classAt("all", 0)} all day; ${changed} change band.`,
    hint: INSIGHT_HINTS.speed,
  };
}

export type PercentileLine = { pre: string; strong: string; post: string };

/** One sentence of context that makes the hero number mean something. */
export function percentileLine(
  feature: NetworkMapFeature,
  features: readonly NetworkMapFeature[],
  view: NetworkView,
): PercentileLine | null {
  const value = featureValue(feature, view);
  if (value === null) return null;
  const encoding = viewEncoding(view);
  if (encoding === "delta") return null;
  const values = features
    .map((candidate) => featureValue(candidate, view))
    .filter((candidate): candidate is number => candidate !== null);
  if (values.length < 2) return null;
  if (encoding === "delay") {
    const below = values.filter((candidate) => candidate < value).length;
    if (below === values.length - 1) {
      return { pre: "", strong: "the most rider delay citywide", post: "" };
    }
    const pct = Math.min(99, Math.floor((100 * below) / values.length));
    return pct >= 50
      ? { pre: "more delay than ", strong: `${pct}%`, post: " of routes" }
      : {
          pre: "less delay than ",
          strong: `${Math.min(99, 100 - pct)}%`,
          post: " of routes",
        };
  }
  const faster = values.filter((candidate) => candidate > value).length;
  if (faster === values.length - 1) {
    return { pre: "", strong: "the slowest route citywide", post: "" };
  }
  if (faster === 0) return { pre: "", strong: "the fastest route citywide", post: "" };
  const pct = Math.min(99, Math.floor((100 * faster) / values.length));
  return pct >= 50
    ? { pre: "slower than ", strong: `${pct}%`, post: " of routes" }
    : { pre: "faster than ", strong: `${Math.min(99, 100 - pct)}%`, post: " of routes" };
}

export type SlowestWindow = { label: string; worstMph: number };

export function hourLabel(hour: number): string {
  const clamped = ((hour % 24) + 24) % 24;
  if (clamped === 0) return "12 AM";
  if (clamped < 12) return `${clamped} AM`;
  if (clamped === 12) return "12 PM";
  return `${clamped - 12} PM`;
}

/** Contiguous stretch around the slowest observed hour (within 0.4 mph of it). */
export function slowestWindow(hourlySpeedMph: readonly (number | null)[]): SlowestWindow | null {
  let worst: number | null = null;
  let worstHour = -1;
  hourlySpeedMph.forEach((value, hour) => {
    if (value !== null && (worst === null || value < worst)) {
      worst = value;
      worstHour = hour;
    }
  });
  if (worst === null || worstHour < 0) return null;
  const near = (value: number | null) => value !== null && value <= (worst as number) + 0.4;
  let start = worstHour;
  let end = worstHour;
  while (start > 0 && near(hourlySpeedMph[start - 1] ?? null)) start -= 1;
  while (end < 23 && near(hourlySpeedMph[end + 1] ?? null)) end += 1;
  return { label: `${hourLabel(start)}–${hourLabel(end + 1)}`, worstMph: worst };
}

/**
 * Pointer-hover intent for the network canvas.
 *
 * Hover only ever lights the route under the cursor. It deliberately does not
 * dim the other 347: with this many lines on screen at once, a network-wide
 * dim on hover reads as the map being replaced rather than as one route being
 * pointed at, and sweeping the pointer across midtown strobes the entire
 * canvas. Dimming is reserved for the two states the reader asked for — a
 * pinned route and a keyboard/list focus — where losing the surroundings is
 * the point.
 *
 * Hysteresis: the hovered route keeps hover while it is still anywhere under
 * the cursor, even when another line is painted above it.
 */
export type HoverIntent = {
  /** Pointer is over these route IDs, topmost first. */
  move: (candidates: readonly string[]) => void;
  leave: () => void;
  hovered: () => string | null;
  dispose: () => void;
};

export function createHoverIntent(host: {
  applyActive: (previous: string | null, next: string | null) => void;
}): HoverIntent {
  let hovered: string | null = null;
  return {
    move(candidates) {
      if (hovered !== null && candidates.includes(hovered)) return;
      const next = candidates[0] ?? null;
      if (next === null) return;
      const previous = hovered;
      hovered = next;
      host.applyActive(previous, next);
    },
    leave() {
      if (hovered === null) return;
      const previous = hovered;
      hovered = null;
      host.applyActive(previous, null);
    },
    hovered: () => hovered,
    dispose() {
      hovered = null;
    },
  };
}

/** "2026-03" -> "March 2026". Coverage-window phrasing, never release identity. */
export function coverageLabel(isoMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(isoMonth);
  if (match === null) return isoMonth;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
