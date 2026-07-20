import type { DocumentTreatmentType } from "@bp/domain/documents/candidates";
import type { StudioRouteIdentityPresentation } from "@bp/domain/studio";

export const CANONICAL_TREATMENT_KINDS = [
  "bus_lane",
  "busway",
  "transit_signal_priority",
  "queue_jump",
  "stop_consolidation",
  "stop_relocation",
  "bus_bulb",
  "neckdown",
  "red_paint",
  "off_board_fare_collection",
  "all_door_boarding",
  "automated_bus_lane_enforcement",
  "route_redesign",
  "pedestrian_improvement",
  "signal_retiming",
  "select_bus_service",
  "stop_change",
  "capital_project_milestone",
  "frequency_change",
  "turn_restriction",
  "other_documented",
] as const;

export const TREATMENT_PRESENTATION_FAMILIES = [
  "bus_priority_lane",
  "signal_priority",
  "stop_change",
  "street_design",
  "boarding_and_fare",
  "enforcement",
  "service_change",
  "service_package",
  "capital",
  "other",
] as const;

export type CanonicalTreatmentKind = (typeof CANONICAL_TREATMENT_KINDS)[number];
export type TreatmentPresentationFamily = (typeof TREATMENT_PRESENTATION_FAMILIES)[number];

export type MappedTreatmentDisposition = {
  disposition: "mapped";
  treatmentKind: Exclude<CanonicalTreatmentKind, "other_documented">;
  treatmentFamily: Exclude<TreatmentPresentationFamily, "other">;
};

export type OtherDocumentedTreatmentDisposition = {
  disposition: "other_documented";
  treatmentKind: "other_documented";
  treatmentFamily: "other";
  reviewedLabel: string;
};

export type UnmappedTreatmentDisposition = {
  disposition: "unmapped_review_required";
  rawValue: string;
  reason: "empty_raw_value" | "unreviewed_open_value" | "bare_custom_treatment";
};

export type TreatmentCrosswalkDisposition =
  | MappedTreatmentDisposition
  | OtherDocumentedTreatmentDisposition
  | UnmappedTreatmentDisposition;

export const DOCUMENT_TREATMENT_DISPOSITIONS = {
  bus_lane: mapped("bus_lane", "bus_priority_lane"),
  busway: mapped("busway", "bus_priority_lane"),
  transit_signal_priority: mapped("transit_signal_priority", "signal_priority"),
  queue_jump: mapped("queue_jump", "signal_priority"),
  stop_consolidation: mapped("stop_consolidation", "stop_change"),
  stop_relocation: mapped("stop_relocation", "stop_change"),
  bus_bulb: mapped("bus_bulb", "street_design"),
  neckdown: mapped("neckdown", "street_design"),
  red_paint: mapped("red_paint", "bus_priority_lane"),
  off_board_fare_collection: mapped("off_board_fare_collection", "boarding_and_fare"),
  all_door_boarding: mapped("all_door_boarding", "boarding_and_fare"),
  ace: mapped("automated_bus_lane_enforcement", "enforcement"),
  able: mapped("automated_bus_lane_enforcement", "enforcement"),
  reroute: mapped("route_redesign", "service_change"),
  pedestrian_improvement: mapped("pedestrian_improvement", "street_design"),
  signal_retiming: mapped("signal_retiming", "signal_priority"),
} as const satisfies Record<DocumentTreatmentType, MappedTreatmentDisposition>;

export const LEGACY_ROUTE_TREATMENT_DISPOSITIONS = {
  bus_lane: mapped("bus_lane", "bus_priority_lane"),
  busway: mapped("busway", "bus_priority_lane"),
  automated_bus_lane_enforcement: mapped("automated_bus_lane_enforcement", "enforcement"),
  transit_signal_priority: mapped("transit_signal_priority", "signal_priority"),
  select_bus_service: mapped("select_bus_service", "service_package"),
  queue_jump: mapped("queue_jump", "signal_priority"),
  stop_change: mapped("stop_change", "stop_change"),
  route_redesign: mapped("route_redesign", "service_change"),
  all_door_boarding: mapped("all_door_boarding", "boarding_and_fare"),
  off_board_fare_collection: mapped("off_board_fare_collection", "boarding_and_fare"),
  capital_project_milestone: mapped("capital_project_milestone", "capital"),
} as const;

export type ReviewedOpenTreatmentDispositionV1 =
  | ({ rawValue: string } & MappedTreatmentDisposition)
  | ({ rawValue: string } & OtherDocumentedTreatmentDisposition);

export const REVIEWED_OPEN_TREATMENT_DISPOSITIONS_VERSION = 1 as const;

/**
 * Binding seed decisions only. The export gate compares this table with the
 * complete vocabulary collected from its pinned inputs; it must report any
 * additional literal for review rather than guessing a disposition here.
 */
export const REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1 = [
  reviewedMapped("busway", "busway", "bus_priority_lane"),
  reviewedMapped("busway_pilot", "busway", "bus_priority_lane"),
  reviewedMapped("center-running protected bus lane", "bus_lane", "bus_priority_lane"),
  reviewedMapped("double_bus_lanes", "bus_lane", "bus_priority_lane"),
  reviewedMapped(
    "bus_lane_enforcement_improvement",
    "automated_bus_lane_enforcement",
    "enforcement",
  ),
  reviewedMapped("bus_boarding_islands", "bus_bulb", "street_design"),
  reviewedMapped("expanded median bus stops", "bus_bulb", "street_design"),
  reviewedMapped("frequency_increase", "frequency_change", "service_change"),
  reviewedMapped("select_bus_service_conversion", "select_bus_service", "service_package"),
  reviewedMapped("turn_ban", "turn_restriction", "street_design"),
] as const satisfies readonly ReviewedOpenTreatmentDispositionV1[];

export const OPEN_TREATMENT_VOCABULARY_SOURCES = [
  "reviewed_corpus_custom",
  "wiki_route_evidence",
  "wiki_operational_occurrence",
  "local_registry",
] as const;

export type OpenTreatmentVocabularySource = (typeof OPEN_TREATMENT_VOCABULARY_SOURCES)[number];

export type OpenTreatmentVocabularyInput = {
  reviewedCorpusCustomTreatments?: readonly string[];
  wikiRouteEvidenceLiterals?: readonly string[];
  wikiOperationalOccurrenceLiterals?: readonly string[];
  localRegistryRawInterventionTypes?: readonly string[];
};

export type OpenTreatmentVocabularyEntry = {
  rawValue: string;
  sourceCounts: Record<OpenTreatmentVocabularySource, number>;
  totalCount: number;
};

export type ReviewedOpenTreatmentVocabularyDiff = {
  schemaVersion: typeof REVIEWED_OPEN_TREATMENT_DISPOSITIONS_VERSION;
  exact: boolean;
  collected: OpenTreatmentVocabularyEntry[];
  dispositions: ReviewedOpenTreatmentDispositionV1[];
  missing: OpenTreatmentVocabularyEntry[];
  extra: ReviewedOpenTreatmentDispositionV1[];
};

export type ExactRouteReconciliationReason =
  | "empty_route_id"
  | "exact_route_not_found"
  | "duplicate_exact_route_identity";

export type ExactRouteReconciliationRow = {
  sourceNamespace: string;
  sourceVocabulary: string;
  rawRouteId: string;
  reason: ExactRouteReconciliationReason;
};

export type ExactRouteIdResolution =
  | {
      resolution: "resolved";
      rawRouteId: string;
      routeId: string;
    }
  | {
      resolution: "unresolved";
      reconciliation: ExactRouteReconciliationRow;
    };

export type ExactRouteIdentityResolution =
  | {
      resolution: "resolved";
      rawRouteId: string;
      route: StudioRouteIdentityPresentation;
    }
  | {
      resolution: "unresolved";
      reconciliation: ExactRouteReconciliationRow;
    };

function mapped<
  TKind extends Exclude<CanonicalTreatmentKind, "other_documented">,
  TFamily extends Exclude<TreatmentPresentationFamily, "other">,
>(treatmentKind: TKind, treatmentFamily: TFamily): MappedTreatmentDisposition {
  return { disposition: "mapped", treatmentKind, treatmentFamily };
}

function reviewedMapped(
  rawValue: string,
  treatmentKind: Exclude<CanonicalTreatmentKind, "other_documented">,
  treatmentFamily: Exclude<TreatmentPresentationFamily, "other">,
): ReviewedOpenTreatmentDispositionV1 {
  return { rawValue, ...mapped(treatmentKind, treatmentFamily) };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function emptySourceCounts(): Record<OpenTreatmentVocabularySource, number> {
  return {
    reviewed_corpus_custom: 0,
    wiki_route_evidence: 0,
    wiki_operational_occurrence: 0,
    local_registry: 0,
  };
}

function sourceLiteralGroups(
  input: OpenTreatmentVocabularyInput,
): ReadonlyArray<readonly [OpenTreatmentVocabularySource, readonly string[]]> {
  return [
    ["reviewed_corpus_custom", input.reviewedCorpusCustomTreatments ?? []],
    ["wiki_route_evidence", input.wikiRouteEvidenceLiterals ?? []],
    ["wiki_operational_occurrence", input.wikiOperationalOccurrenceLiterals ?? []],
    ["local_registry", input.localRegistryRawInterventionTypes ?? []],
  ];
}

function reviewedDispositionIndex(
  table: readonly ReviewedOpenTreatmentDispositionV1[],
): ReadonlyMap<string, ReviewedOpenTreatmentDispositionV1> {
  const index = new Map<string, ReviewedOpenTreatmentDispositionV1>();
  for (const row of table) {
    if (row.rawValue.length === 0) {
      throw new Error("Reviewed open treatment disposition contains an empty raw value");
    }
    if (index.has(row.rawValue)) {
      throw new Error(`Duplicate reviewed open treatment disposition for ${row.rawValue}`);
    }
    if (row.disposition === "other_documented" && row.reviewedLabel.length === 0) {
      throw new Error(`Reviewed other_documented treatment ${row.rawValue} has an empty label`);
    }
    index.set(row.rawValue, row);
  }
  return index;
}

export function documentTreatmentDisposition(
  value: DocumentTreatmentType,
): MappedTreatmentDisposition {
  return DOCUMENT_TREATMENT_DISPOSITIONS[value];
}

export function reviewedOpenTreatmentDisposition(
  rawValue: string,
  table: readonly ReviewedOpenTreatmentDispositionV1[] = REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1,
): TreatmentCrosswalkDisposition {
  if (rawValue.length === 0) {
    return { disposition: "unmapped_review_required", rawValue, reason: "empty_raw_value" };
  }
  return (
    reviewedDispositionIndex(table).get(rawValue) ?? {
      disposition: "unmapped_review_required",
      rawValue,
      reason: "unreviewed_open_value",
    }
  );
}

export function legacyRouteTreatmentDisposition(input: {
  treatmentType: keyof typeof LEGACY_ROUTE_TREATMENT_DISPOSITIONS | "custom_treatment";
  rawLabel?: string | null;
  reviewedOpenDispositions?: readonly ReviewedOpenTreatmentDispositionV1[];
}): TreatmentCrosswalkDisposition {
  if (input.treatmentType !== "custom_treatment") {
    return LEGACY_ROUTE_TREATMENT_DISPOSITIONS[input.treatmentType];
  }
  if (input.rawLabel === undefined || input.rawLabel === null || input.rawLabel.length === 0) {
    return {
      disposition: "unmapped_review_required",
      rawValue: input.rawLabel ?? "",
      reason: "bare_custom_treatment",
    };
  }
  return reviewedOpenTreatmentDisposition(input.rawLabel, input.reviewedOpenDispositions);
}

export function collectOpenTreatmentVocabulary(
  input: OpenTreatmentVocabularyInput,
): OpenTreatmentVocabularyEntry[] {
  const entries = new Map<string, OpenTreatmentVocabularyEntry>();
  for (const [source, literals] of sourceLiteralGroups(input)) {
    for (const rawValue of literals) {
      if (rawValue.length === 0) continue;
      const entry = entries.get(rawValue) ?? {
        rawValue,
        sourceCounts: emptySourceCounts(),
        totalCount: 0,
      };
      entry.sourceCounts[source] += 1;
      entry.totalCount += 1;
      entries.set(rawValue, entry);
    }
  }
  return [...entries.values()].sort((left, right) => compareText(left.rawValue, right.rawValue));
}

export function diffReviewedOpenTreatmentVocabulary(
  input: OpenTreatmentVocabularyInput,
  table: readonly ReviewedOpenTreatmentDispositionV1[] = REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1,
): ReviewedOpenTreatmentVocabularyDiff {
  const collected = collectOpenTreatmentVocabulary(input);
  const dispositionIndex = reviewedDispositionIndex(table);
  const collectedValues = new Set(collected.map((entry) => entry.rawValue));
  const dispositions = [...table].sort((left, right) => compareText(left.rawValue, right.rawValue));
  const missing = collected.filter((entry) => !dispositionIndex.has(entry.rawValue));
  const extra = dispositions.filter((entry) => !collectedValues.has(entry.rawValue));
  return {
    schemaVersion: REVIEWED_OPEN_TREATMENT_DISPOSITIONS_VERSION,
    exact: missing.length === 0 && extra.length === 0,
    collected,
    dispositions,
    missing,
    extra,
  };
}

export function assertReviewedOpenTreatmentVocabularyExact(
  input: OpenTreatmentVocabularyInput,
  table: readonly ReviewedOpenTreatmentDispositionV1[] = REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1,
): ReviewedOpenTreatmentVocabularyDiff {
  const diff = diffReviewedOpenTreatmentVocabulary(input, table);
  if (!diff.exact) {
    throw new Error(
      `Reviewed open treatment vocabulary mismatch: missing=[${diff.missing
        .map((entry) => entry.rawValue)
        .join(", ")}], extra=[${diff.extra.map((entry) => entry.rawValue).join(", ")}]`,
    );
  }
  return diff;
}

export function resolveExactRouteId(input: {
  rawRouteId: string;
  routeIds: readonly string[];
  sourceNamespace: string;
  sourceVocabulary: string;
}): ExactRouteIdResolution {
  const matches = input.routeIds.filter((routeId) => routeId === input.rawRouteId);
  if (input.rawRouteId.length === 0) {
    return unresolvedRoute(input, "empty_route_id");
  }
  if (matches.length === 0) {
    return unresolvedRoute(input, "exact_route_not_found");
  }
  if (matches.length > 1) {
    return unresolvedRoute(input, "duplicate_exact_route_identity");
  }
  return { resolution: "resolved", rawRouteId: input.rawRouteId, routeId: matches[0] as string };
}

export function resolveExactRouteIdentity(input: {
  rawRouteId: string;
  routes: readonly StudioRouteIdentityPresentation[];
  sourceNamespace: string;
  sourceVocabulary: string;
}): ExactRouteIdentityResolution {
  const resolution = resolveExactRouteId({
    rawRouteId: input.rawRouteId,
    routeIds: input.routes.map((route) => route.routeId),
    sourceNamespace: input.sourceNamespace,
    sourceVocabulary: input.sourceVocabulary,
  });
  if (resolution.resolution === "unresolved") return resolution;
  const route = input.routes.find((candidate) => candidate.routeId === resolution.routeId);
  if (route === undefined) {
    return unresolvedRoute(input, "exact_route_not_found");
  }
  return { resolution: "resolved", rawRouteId: input.rawRouteId, route };
}

function unresolvedRoute(
  input: {
    rawRouteId: string;
    sourceNamespace: string;
    sourceVocabulary: string;
  },
  reason: ExactRouteReconciliationReason,
): ExactRouteIdResolution & ExactRouteIdentityResolution {
  return {
    resolution: "unresolved",
    reconciliation: {
      sourceNamespace: input.sourceNamespace,
      sourceVocabulary: input.sourceVocabulary,
      rawRouteId: input.rawRouteId,
      reason,
    },
  };
}
