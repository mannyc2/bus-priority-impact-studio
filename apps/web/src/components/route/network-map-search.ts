export const NETWORK_MAP_LENSES = ["speed", "delay-exposure", "change"] as const;
export type NetworkMapLens = (typeof NETWORK_MAP_LENSES)[number];

export const NETWORK_MAP_PERIODS = ["all", "am", "pm"] as const;
export type NetworkMapPeriod = (typeof NETWORK_MAP_PERIODS)[number];

export const NETWORK_MAP_BOROUGHS = [
  "Bronx",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Staten Island",
] as const;
export type NetworkMapBorough = (typeof NETWORK_MAP_BOROUGHS)[number];

/** Canonical, shareable state for the network map. Defaults are omitted. */
export type NetworkMapSearch = {
  lens?: NetworkMapLens;
  period?: NetworkMapPeriod;
  borough?: NetworkMapBorough;
  route?: string;
  segment?: string;
  lanes?: true;
  /** Approved "Vs all day" mode. Meaningful only for AM/PM speed. */
  compare?: true;
};

const ROUTE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SEARCH_TOKEN_MAX_LENGTH = 256;

function isMember<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isRouteSlug(value: unknown): value is string {
  return typeof value === "string" && ROUTE_SLUG_PATTERN.test(value);
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function isSegmentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SEARCH_TOKEN_MAX_LENGTH &&
    value.trim() === value &&
    !hasControlCharacter(value)
  );
}

/**
 * Router-stage validation. This intentionally knows nothing about loaded map
 * evidence; it only accepts bounded values and structurally valid combinations.
 */
export function validateNetworkMapSearch(search: Record<string, unknown>): NetworkMapSearch {
  const {
    lens: rawLens,
    period: rawPeriod,
    borough: rawBorough,
    route: rawRoute,
    segment: rawSegment,
    lanes: rawLanes,
    compare: rawCompare,
  } = search;
  const lens = isMember(NETWORK_MAP_LENSES, rawLens) ? rawLens : "speed";
  const period = lens === "speed" && isMember(NETWORK_MAP_PERIODS, rawPeriod) ? rawPeriod : "all";
  const borough = isMember(NETWORK_MAP_BOROUGHS, rawBorough) ? rawBorough : undefined;
  const route = isRouteSlug(rawRoute) ? rawRoute : undefined;
  const segment = route !== undefined && isSegmentId(rawSegment) ? rawSegment : undefined;

  return {
    ...(lens === "speed" ? {} : { lens }),
    ...(period === "all" ? {} : { period }),
    ...(borough === undefined ? {} : { borough }),
    ...(route === undefined ? {} : { route }),
    ...(segment === undefined ? {} : { segment }),
    ...(rawLanes === true ? { lanes: true as const } : {}),
    ...(rawCompare === true && lens === "speed" && period !== "all"
      ? { compare: true as const }
      : {}),
  };
}

export type NetworkMapRouteIdentity = {
  routeId: string;
  slug: string;
  servedBoroughs: readonly string[];
};

export type NetworkMapIdentityIndex = {
  routeIdBySlug: ReadonlyMap<string, string>;
  slugByRouteId: ReadonlyMap<string, string>;
  routeBySlug: ReadonlyMap<string, NetworkMapRouteIdentity>;
};

/**
 * Build the exact plan-079 identity join. Ambiguous IDs/slugs are excluded
 * instead of silently allowing a last-write-wins URL or feature-state lookup.
 */
export function buildNetworkMapIdentityIndex(
  routes: readonly NetworkMapRouteIdentity[],
): NetworkMapIdentityIndex {
  const routeIdBySlug = new Map<string, string>();
  const slugByRouteId = new Map<string, string>();
  const routeBySlug = new Map<string, NetworkMapRouteIdentity>();
  const ambiguousSlugs = new Set<string>();
  const ambiguousRouteIds = new Set<string>();

  for (const route of routes) {
    const existingRouteId = routeIdBySlug.get(route.slug);
    if (existingRouteId !== undefined && existingRouteId !== route.routeId) {
      ambiguousSlugs.add(route.slug);
    } else if (!ambiguousSlugs.has(route.slug)) {
      routeIdBySlug.set(route.slug, route.routeId);
      routeBySlug.set(route.slug, route);
    }

    const existingSlug = slugByRouteId.get(route.routeId);
    if (existingSlug !== undefined && existingSlug !== route.slug) {
      ambiguousRouteIds.add(route.routeId);
    } else if (!ambiguousRouteIds.has(route.routeId)) {
      slugByRouteId.set(route.routeId, route.slug);
    }
  }

  for (const slug of ambiguousSlugs) {
    routeIdBySlug.delete(slug);
    routeBySlug.delete(slug);
  }
  for (const routeId of ambiguousRouteIds) slugByRouteId.delete(routeId);

  // A pair is usable only when both directions agree exactly.
  for (const [slug, routeId] of routeIdBySlug) {
    if (slugByRouteId.get(routeId) !== slug) {
      routeIdBySlug.delete(slug);
      routeBySlug.delete(slug);
    }
  }
  for (const [routeId, slug] of slugByRouteId) {
    if (routeIdBySlug.get(slug) !== routeId) slugByRouteId.delete(routeId);
  }

  return { routeIdBySlug, slugByRouteId, routeBySlug };
}

export type NetworkMapEligibility = {
  delayExposure: boolean;
  change: boolean;
  am: boolean;
  pm: boolean;
  lanes: boolean;
};

/** Detail evidence is route-scoped so a late response cannot clear a new pin. */
export type SegmentValidation =
  | { status: "pending"; routeSlug: string }
  | { status: "ready"; routeSlug: string; spineIds: readonly (string | null)[] }
  | { status: "unavailable"; routeSlug: string };

export type NetworkMapCanonicalizationNotice =
  | "unsupported_lens"
  | "unsupported_period"
  | "unknown_route"
  | "route_outside_borough"
  | "segment_invalid"
  | "lanes_unavailable";

export type NetworkMapSegmentState = "none" | "pending" | "valid" | "invalid" | "unavailable";

export type NetworkMapCanonicalization = {
  search: NetworkMapSearch;
  routeId: string | null;
  segmentState: NetworkMapSegmentState;
  notices: readonly NetworkMapCanonicalizationNotice[];
};

/**
 * Evidence-stage canonicalization. Pending and unavailable segment evidence
 * preserve shared links; only a ready response can prove a segment invalid.
 */
export function canonicalizeNetworkMapSearch(
  incoming: NetworkMapSearch,
  evidence: {
    routes: readonly NetworkMapRouteIdentity[];
    eligibility: NetworkMapEligibility;
    segmentValidation?: SegmentValidation;
  },
): NetworkMapCanonicalization {
  const search = validateNetworkMapSearch({ ...incoming });
  const notices: NetworkMapCanonicalizationNotice[] = [];

  if (
    (search.lens === "delay-exposure" && !evidence.eligibility.delayExposure) ||
    (search.lens === "change" && !evidence.eligibility.change)
  ) {
    delete search.lens;
    notices.push("unsupported_lens");
  }

  if (
    (search.period === "am" && !evidence.eligibility.am) ||
    (search.period === "pm" && !evidence.eligibility.pm)
  ) {
    delete search.period;
    delete search.compare;
    notices.push("unsupported_period");
  }

  if (search.lanes === true && !evidence.eligibility.lanes) {
    delete search.lanes;
    notices.push("lanes_unavailable");
  }

  const identity = buildNetworkMapIdentityIndex(evidence.routes);
  const route = search.route === undefined ? undefined : identity.routeBySlug.get(search.route);
  if (search.route !== undefined && route === undefined) {
    delete search.route;
    delete search.segment;
    notices.push("unknown_route");
    return { search, routeId: null, segmentState: "none", notices };
  }
  if (
    route !== undefined &&
    search.borough !== undefined &&
    !route.servedBoroughs.includes(search.borough)
  ) {
    delete search.route;
    delete search.segment;
    notices.push("route_outside_borough");
    return { search, routeId: null, segmentState: "none", notices };
  }

  if (route === undefined || search.segment === undefined) {
    return { search, routeId: route?.routeId ?? null, segmentState: "none", notices };
  }

  const validation = evidence.segmentValidation;
  if (validation === undefined || validation.routeSlug !== route.slug) {
    return { search, routeId: route.routeId, segmentState: "pending", notices };
  }
  if (validation.status === "pending") {
    return { search, routeId: route.routeId, segmentState: "pending", notices };
  }
  if (validation.status === "unavailable") {
    return { search, routeId: route.routeId, segmentState: "unavailable", notices };
  }

  const matchCount = validation.spineIds.filter((spineId) => spineId === search.segment).length;
  if (matchCount === 1) {
    return { search, routeId: route.routeId, segmentState: "valid", notices };
  }

  delete search.segment;
  notices.push("segment_invalid");
  return { search, routeId: route.routeId, segmentState: "invalid", notices };
}
