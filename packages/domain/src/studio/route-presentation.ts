import { Schema } from "effect";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));

export const STUDIO_ROUTE_SERVICE_MODES = [
  "local",
  "local_limited",
  "limited_stop",
  "sbs",
  "express",
  "rush",
  "school_local",
  "school_limited",
] as const;

export const STUDIO_CURRENT_BUS_ROUTE_TYPES = [
  "Express",
  "Limited",
  "Local",
  "SBS",
  "School",
] as const;
export const STUDIO_CURRENT_BUS_TRIP_TYPES = [
  1,
  10,
  11,
  12,
  13,
  14,
  "1",
  "10",
  "11",
  "12",
  "13",
  "14",
] as const;

export const StudioRouteServiceModeSchema = Schema.Literals(STUDIO_ROUTE_SERVICE_MODES);
export const StudioCurrentBusRouteTypeSchema = Schema.Literals(STUDIO_CURRENT_BUS_ROUTE_TYPES);
export const StudioCurrentBusTripTypeSchema = Schema.Literals(STUDIO_CURRENT_BUS_TRIP_TYPES);

export const StudioRouteIdentityPresentationSchema = Schema.Struct({
  routeId: NonEmptyStringSchema,
  routeFamilyId: NonEmptyStringSchema,
  displayLabel: NonEmptyStringSchema,
  officialLongName: Schema.NullOr(Schema.String),
  designationLiterals: Schema.Array(NonEmptyStringSchema),
  serviceModes: Schema.Array(StudioRouteServiceModeSchema),
  routeTypes: Schema.Array(StudioCurrentBusRouteTypeSchema),
  tripTypes: Schema.Array(StudioCurrentBusTripTypeSchema),
});

export type StudioRouteServiceMode = typeof StudioRouteServiceModeSchema.Type;
export type StudioCurrentBusRouteType = typeof StudioCurrentBusRouteTypeSchema.Type;
export function routeIdToStudioSlug(routeId: string): string {
  return routeId
    .toLowerCase()
    .replace(/\+/gu, "-sbs")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function assertInjectiveStudioRouteIdentityUniverse(
  routes: readonly { readonly routeId: string; readonly slug?: string | undefined }[],
  label = "Studio route universe",
): void {
  const routeIds = new Set<string>();
  const slugs = new Map<string, string>();
  for (const route of routes) {
    if (route.routeId.length === 0 || route.routeId !== route.routeId.trim()) {
      throw new Error(`${label} contains an invalid exact route ID`);
    }
    if (routeIds.has(route.routeId)) {
      throw new Error(`${label} contains duplicate exact route ID ${route.routeId}`);
    }
    const canonicalSlug = routeIdToStudioSlug(route.routeId);
    if (canonicalSlug.length === 0) {
      throw new Error(`${label} route ${route.routeId} has an empty canonical slug`);
    }
    if (route.slug !== undefined && route.slug !== canonicalSlug) {
      throw new Error(
        `${label} route ${route.routeId} must use canonical slug ${canonicalSlug}, received ${route.slug}`,
      );
    }
    const conflictingRouteId = slugs.get(canonicalSlug);
    if (conflictingRouteId !== undefined) {
      throw new Error(
        `${label} has non-injective slug ${canonicalSlug} for ${conflictingRouteId} and ${route.routeId}`,
      );
    }
    routeIds.add(route.routeId);
    slugs.set(canonicalSlug, route.routeId);
  }
}

export type StudioCurrentBusTripType = typeof StudioCurrentBusTripTypeSchema.Type;
export type StudioRouteIdentityPresentation = typeof StudioRouteIdentityPresentationSchema.Type;

export function studioRouteHasSbsMode(
  presentation: Pick<StudioRouteIdentityPresentation, "serviceModes">,
): boolean {
  return presentation.serviceModes.includes("sbs");
}

const OFFICIAL_ROUTE_TYPE_TO_MODE = {
  Express: "express",
  Limited: "limited_stop",
  Local: "local",
  SBS: "sbs",
} as const satisfies Record<Exclude<StudioCurrentBusRouteType, "School">, StudioRouteServiceMode>;

function currentBusTripTypeMode(value: string | number): StudioRouteServiceMode {
  switch (value) {
    case 1:
    case "1":
      return "local";
    case 10:
    case "10":
      return "school_limited";
    case 11:
    case "11":
      return "school_local";
    case 12:
    case "12":
      return "limited_stop";
    case 13:
    case "13":
      return "express";
    case 14:
    case "14":
      return "sbs";
    default:
      throw new Error(`Unsupported official trip_type literal: ${String(value)}`);
  }
}

function sameModes(
  left: ReadonlySet<StudioRouteServiceMode>,
  right: ReadonlySet<StudioRouteServiceMode>,
): boolean {
  return left.size === right.size && [...left].every((mode) => right.has(mode));
}

export function studioRouteServiceModesForOfficialTypes(
  routeTypes: readonly string[],
  tripTypes: readonly (string | number)[],
): StudioRouteServiceMode[] {
  const tripModes = new Set(tripTypes.map(currentBusTripTypeMode));
  const routeModes = new Set<StudioRouteServiceMode>();
  for (const routeType of routeTypes) {
    if (routeType === "School") {
      const schoolModes = [...tripModes].filter(
        (mode) => mode === "school_limited" || mode === "school_local",
      );
      if (schoolModes.length === 0) {
        throw new Error("Official route_type School requires trip_type 10 and/or 11");
      }
      for (const mode of schoolModes) routeModes.add(mode);
      continue;
    }
    const mode = OFFICIAL_ROUTE_TYPE_TO_MODE[routeType as keyof typeof OFFICIAL_ROUTE_TYPE_TO_MODE];
    if (mode === undefined) {
      throw new Error(`Unsupported official route_type literal: ${routeType}`);
    }
    routeModes.add(mode);
  }
  if (!sameModes(routeModes, tripModes)) {
    throw new Error(
      `Official route_type/trip_type disagreement: route modes ${[...routeModes]
        .toSorted()
        .join(",")} != trip modes ${[...tripModes].toSorted().join(",")}`,
    );
  }
  return [...tripModes].toSorted();
}

const LEGACY_TRACKER_ROUTE_TYPE_TO_MODE = {
  ...OFFICIAL_ROUTE_TYPE_TO_MODE,
  "Select Bus Service": "sbs",
} as const satisfies Record<string, StudioRouteServiceMode>;

export function studioRouteServiceModesForLegacyTrackerTypes(
  routeTypes: readonly string[],
): StudioRouteServiceMode[] {
  const modes = new Set<StudioRouteServiceMode>();
  for (const routeType of routeTypes) {
    const mode =
      LEGACY_TRACKER_ROUTE_TYPE_TO_MODE[
        routeType as keyof typeof LEGACY_TRACKER_ROUTE_TYPE_TO_MODE
      ];
    if (mode === undefined) {
      throw new Error(`Unsupported legacy Tracker route_type literal: ${routeType}`);
    }
    modes.add(mode);
  }
  return [...modes].toSorted();
}
function assertSortedUniqueStrings(value: unknown, label: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  const canonical = [...new Set(value)].toSorted();
  if (
    canonical.length !== value.length ||
    canonical.some((entry, index) => entry !== value[index])
  ) {
    throw new Error(`${label} must be sorted and unique`);
  }
}

function assertSortedUniqueTripTypes(value: unknown): asserts value is StudioCurrentBusTripType[] {
  if (!Array.isArray(value)) throw new Error("tripTypes must be an array");
  const literals = value.map((entry) => String(entry));
  const canonical = [...new Set(literals)].toSorted((left, right) => left.localeCompare(right));
  if (
    canonical.length !== literals.length ||
    canonical.some((entry, index) => entry !== literals[index])
  ) {
    throw new Error("tripTypes must be sorted and unique");
  }
}

type StudioRouteIdentityPresentationInput = Readonly<Record<string, unknown>> & {
  readonly designationLiterals?: unknown;
  readonly displayLabel?: unknown;
  readonly label?: unknown;
  readonly routeFamilyId?: unknown;
  readonly routeId?: unknown;
  readonly routeTypes?: unknown;
  readonly sbs?: unknown;
  readonly serviceModes?: unknown;
  readonly slug?: unknown;
  readonly tripTypes?: unknown;
};

export function assertStudioRouteIdentityPresentation(
  route: StudioRouteIdentityPresentationInput,
): void {
  const routeId = route.routeId;
  const routeFamilyId = route.routeFamilyId;
  const displayLabel = route.displayLabel;
  if (
    typeof routeId !== "string" ||
    routeId.length === 0 ||
    typeof routeFamilyId !== "string" ||
    routeFamilyId.length === 0 ||
    typeof displayLabel !== "string" ||
    displayLabel.length === 0
  ) {
    throw new Error("Studio route exact identity and display label must be non-empty");
  }
  const expectedFamily = routeId.endsWith("+") ? routeId.slice(0, -1) : routeId;
  if (routeFamilyId !== expectedFamily) {
    throw new Error("Studio route routeFamilyId disagrees with exact routeId");
  }
  if (route.slug !== routeIdToStudioSlug(routeId)) {
    throw new Error("Studio route slug disagrees with exact routeId");
  }
  if (route.label !== displayLabel) {
    throw new Error("Studio route label must equal official displayLabel");
  }
  assertSortedUniqueStrings(route.designationLiterals, "designationLiterals");
  assertSortedUniqueStrings(route.serviceModes, "serviceModes");
  assertSortedUniqueStrings(route.routeTypes, "routeTypes");
  assertSortedUniqueTripTypes(route.tripTypes);
  const tripTypes = route.tripTypes;
  const routeTypes = route.routeTypes;
  const expectedDesignations = [
    ...new Set([
      ...routeTypes.map((value) => `route_type:${value}`),
      ...tripTypes.map((value) => `trip_type:${String(value)}`),
    ]),
  ].toSorted();
  if (JSON.stringify(expectedDesignations) !== JSON.stringify(route.designationLiterals)) {
    throw new Error("Studio route designation literals disagree with official types");
  }
  const expectedModes = studioRouteServiceModesForOfficialTypes(routeTypes, tripTypes);
  if (JSON.stringify(expectedModes) !== JSON.stringify(route.serviceModes)) {
    throw new Error("Studio route service modes disagree with official types");
  }
  if (Object.hasOwn(route, "sbs") && route.sbs !== expectedModes.includes("sbs")) {
    throw new Error("Studio route sbs flag disagrees with exact service modes");
  }
}
