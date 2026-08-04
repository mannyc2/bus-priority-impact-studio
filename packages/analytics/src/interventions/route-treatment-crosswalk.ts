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

export const MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION = 1 as const;

/**
 * Producer-reviewed v1 semantics. This vocabulary is deliberately separate
 * from the smaller Studio presentation taxonomy: bundle members must remain
 * lossless even when the public contract has not yet adopted their kind.
 */
export const MTA_WIKI_TREATMENT_SEMANTIC_KIND_FAMILIES_V1 = {
  all_door_boarding: "boarding_and_fare",
  automated_bus_lane_enforcement: "enforcement",
  bench: "street_design",
  bus_bulb: "street_design",
  bus_lane: "bus_priority_lane",
  bus_shelter: "stop_change",
  bus_stop_adjustment: "stop_change",
  busway: "bus_priority_lane",
  curb_extension: "street_design",
  curb_regulation: "curb_management",
  fare_machine_installation: "boarding_and_fare",
  high_visibility_crosswalk: "street_design",
  left_turn_bay: "street_design",
  neckdown: "street_design",
  off_board_fare_collection: "boarding_and_fare",
  pedestrian_improvement: "street_design",
  pedestrian_island: "street_design",
  planting: "street_design",
  queue_jump: "signal_priority",
  real_time_passenger_information: "customer_information",
  resurfacing: "capital",
  signal_retiming: "signal_priority",
  stop_change: "stop_change",
  stop_consolidation: "stop_change",
  stop_relocation: "stop_change",
  transit_signal_priority: "signal_priority",
  truck_loading_zone: "curb_management",
  turn_restriction: "street_design",
  wayfinding_sign: "customer_information",
} as const;

export type MtaWikiTreatmentSemanticKindV1 =
  keyof typeof MTA_WIKI_TREATMENT_SEMANTIC_KIND_FAMILIES_V1;
export type MtaWikiTreatmentSemanticFamilyV1 =
  (typeof MTA_WIKI_TREATMENT_SEMANTIC_KIND_FAMILIES_V1)[MtaWikiTreatmentSemanticKindV1];

export type MtaWikiTreatmentSemanticArtifactDispositionV1 =
  | {
      disposition: "atomic";
      raw_treatment_kind: string;
      record_ids: readonly string[];
      canonical_kind: string;
      family: string;
    }
  | {
      disposition: "bundle";
      raw_treatment_kind: string;
      record_ids: readonly string[];
      bundle_family: string | null;
      members: readonly {
        raw_treatment_kind: string;
        canonical_kind: string;
        family: string;
      }[];
    }
  | {
      disposition: "unresolved";
      raw_treatment_kind: string;
      record_ids: readonly string[];
      review_reason: string;
    };

export type MtaWikiTreatmentSemanticArtifactV1 = {
  schema_version: typeof MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION;
  dispositions: readonly MtaWikiTreatmentSemanticArtifactDispositionV1[];
};

export type MtaWikiTreatmentSemanticBundleMemberV1 = {
  rawValue: string;
  canonicalKind: MtaWikiTreatmentSemanticKindV1;
  family: MtaWikiTreatmentSemanticFamilyV1;
};

export type MtaWikiTreatmentSemanticDispositionV1 =
  | {
      disposition: "atomic";
      rawValue: string;
      recordIds: string[];
      mapping: MappedTreatmentDisposition;
    }
  | {
      disposition: "bundle";
      rawValue: string;
      recordIds: string[];
      bundleFamily: MtaWikiTreatmentSemanticFamilyV1 | null;
      members: MtaWikiTreatmentSemanticBundleMemberV1[];
    }
  | {
      disposition: "unresolved";
      rawValue: string;
      recordIds: string[];
      reviewReason: string;
    };

export type MtaWikiTreatmentSemanticContractV1 = {
  schemaVersion: typeof MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION;
  dispositions: MtaWikiTreatmentSemanticDispositionV1[];
};

export type MtaWikiTreatmentVocabularyScopeV1 = {
  rawValue: string;
  recordId: string;
};

export type MtaWikiTreatmentSemanticScopeIssueV1 = MtaWikiTreatmentVocabularyScopeV1 & {
  reason: "record_not_in_vocabulary" | "literal_mismatch";
};

export type MtaWikiTreatmentSemanticDuplicateScopeV1 = MtaWikiTreatmentVocabularyScopeV1 & {
  count: number;
};

export type MtaWikiTreatmentSemanticReconciliationV1 = {
  schemaVersion: typeof MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION;
  exact: boolean;
  publishable: boolean;
  summary: {
    vocabularyLiteralCount: number;
    vocabularyRecordScopeCount: number;
    dispositionCount: number;
    atomicDispositionCount: number;
    bundleDispositionCount: number;
    unresolvedDispositionCount: number;
    atomicRecordScopeCount: number;
    bundleRecordScopeCount: number;
    unresolvedRecordScopeCount: number;
  };
  missingLiterals: string[];
  staleLiterals: string[];
  missingScopes: MtaWikiTreatmentVocabularyScopeV1[];
  unknownScopes: MtaWikiTreatmentSemanticScopeIssueV1[];
  staleScopes: MtaWikiTreatmentSemanticScopeIssueV1[];
  duplicateDispositionScopes: MtaWikiTreatmentSemanticDuplicateScopeV1[];
  duplicateVocabularyScopes: MtaWikiTreatmentSemanticDuplicateScopeV1[];
  ambiguousVocabularyRecordIds: string[];
  blockingUnresolvedScopes: Array<MtaWikiTreatmentVocabularyScopeV1 & { reviewReason: string }>;
};

/**
 * Reviewed non-Wiki vocabulary freeze for the pinned corpus and trusted local
 * registry. Every source literal is present as a literal row: values that do
 * not have a high-confidence closed equivalent remain visibly preserved as
 * `other_documented`. An unseen value still fails closed in
 * `reviewedOpenTreatmentDisposition`.
 */
export const REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1 = [
  reviewedOther("24_hour_service", "24_hour_service"),
  reviewedOther("24_hour_service_expansion", "24_hour_service_expansion"),
  reviewedOther("ADA pedestrian ramps", "ADA pedestrian ramps"),
  reviewedOther("Priority Corridor", "Priority Corridor"),
  reviewedOther("ada_access_improvement", "ada_access_improvement"),
  reviewedOther("all_day_frequent_service", "all_day_frequent_service"),
  reviewedMapped("automated_bus_lane_enforcement", "automated_bus_lane_enforcement", "enforcement"),
  reviewedMapped(
    "automated_camera_enforcement_ace",
    "automated_bus_lane_enforcement",
    "enforcement",
  ),
  reviewedOther("avoid_narrow_streets", "avoid_narrow_streets"),
  reviewedOther("bicycle_lanes", "bicycle_lanes"),
  reviewedOther("branch_added", "branch_added"),
  reviewedOther("branch_elimination", "branch_elimination"),
  reviewedOther("branch_removal", "branch_removal"),
  reviewedOther("branch_replacement", "branch_replacement"),
  reviewedOther("bus pads", "bus pads"),
  reviewedOther("bus shelters and amenities", "bus shelters and amenities"),
  reviewedOther("bus-only tunnel", "bus-only tunnel"),
  reviewedMapped("bus_boarding_islands", "bus_bulb", "street_design"),
  reviewedOther("bus_boarding_platforms", "bus_boarding_platforms"),
  reviewedMapped(
    "bus_lane_enforcement_improvement",
    "automated_bus_lane_enforcement",
    "enforcement",
  ),
  reviewedMapped("bus_lane_infrastructure", "bus_lane", "bus_priority_lane"),
  reviewedMapped("bus_network_redesign", "route_redesign", "service_change"),
  reviewedOther("bus_plaza_reconstruction", "bus_plaza_reconstruction"),
  reviewedOther("bus_priority_corridor_identification", "bus_priority_corridor_identification"),
  reviewedOther("bus_priority_corridor_planning", "bus_priority_corridor_planning"),
  reviewedOther("bus_priority_corridor_study", "bus_priority_corridor_study"),
  reviewedOther("bus_stop_balancing", "bus_stop_balancing"),
  reviewedMapped("busway", "busway", "bus_priority_lane"),
  reviewedMapped("busway_pilot", "busway", "bus_priority_lane"),
  reviewedMapped("center-running protected bus lane", "bus_lane", "bus_priority_lane"),
  reviewedOther("crosstown", "crosstown"),
  reviewedOther("crosstown_route", "crosstown_route"),
  reviewedOther("crosstown_sbs", "crosstown_sbs"),
  reviewedOther("crosstown_service", "crosstown_service"),
  reviewedOther("curb_extensions", "curb_extensions"),
  reviewedOther("curb_regulation_changes", "curb_regulation_changes"),
  reviewedOther("customer_ambassador_program", "customer_ambassador_program"),
  reviewedOther("documented_bus_priority_intervention", "documented_bus_priority_intervention"),
  reviewedMapped("double_bus_lanes", "bus_lane", "bus_priority_lane"),
  reviewedMapped("expanded median bus stops", "bus_bulb", "street_design"),
  reviewedOther("express_route_relabeling", "express_route_relabeling"),
  reviewedOther("express_route_restructuring", "express_route_restructuring"),
  reviewedOther("fewer_route_patterns", "fewer_route_patterns"),
  reviewedMapped("frequency_adjustment", "frequency_change", "service_change"),
  reviewedMapped("frequency_change", "frequency_change", "service_change"),
  reviewedMapped("frequency_coordination", "frequency_change", "service_change"),
  reviewedMapped("frequency_decrease", "frequency_change", "service_change"),
  reviewedMapped("frequency_enhancement", "frequency_change", "service_change"),
  reviewedMapped("frequency_improvement", "frequency_change", "service_change"),
  reviewedMapped("frequency_increase", "frequency_change", "service_change"),
  reviewedMapped("frequency_reallocation", "frequency_change", "service_change"),
  reviewedMapped("frequency_reduction", "frequency_change", "service_change"),
  reviewedMapped("frequency_reduction_outbound", "frequency_change", "service_change"),
  reviewedMapped("frequency_restructuring", "frequency_change", "service_change"),
  reviewedOther("gap_fill", "gap_fill"),
  reviewedOther("indoor_waiting_area", "indoor_waiting_area"),
  reviewedOther("interborough_connection", "interborough_connection"),
  reviewedOther("interborough_connectivity", "interborough_connectivity"),
  reviewedOther("interborough_extension", "interborough_extension"),
  reviewedOther("interborough_route", "interborough_route"),
  reviewedOther("interborough_route_creation", "interborough_route_creation"),
  reviewedOther("late_night_service_extension", "late_night_service_extension"),
  reviewedOther("limited_stop_branch", "limited_stop_branch"),
  reviewedOther("limited_stop_conversion", "limited_stop_conversion"),
  reviewedOther("limited_stop_discontinuation", "limited_stop_discontinuation"),
  reviewedOther("limited_stop_rush_segments", "limited_stop_rush_segments"),
  reviewedOther("limited_stop_rush_service", "limited_stop_rush_service"),
  reviewedOther("limited_stop_service", "limited_stop_service"),
  reviewedOther("limited_to_local_conversion", "limited_to_local_conversion"),
  reviewedOther("local_stops_added", "local_stops_added"),
  reviewedOther("median landscaping", "median landscaping"),
  reviewedOther("median reconstruction and landscaping", "median reconstruction and landscaping"),
  reviewedOther("median tip expansions", "median tip expansions"),
  reviewedMapped("network_redesign", "route_redesign", "service_change"),
  reviewedOther("new_connection", "new_connection"),
  reviewedOther("new_express_route", "new_express_route"),
  reviewedOther("new_route", "new_route"),
  reviewedOther("new_route_type", "new_route_type"),
  reviewedOther("new_stop", "new_stop"),
  reviewedOther("new_stops", "new_stops"),
  reviewedOther("non_stop_section", "non_stop_section"),
  reviewedOther("nonstop_express", "nonstop_express"),
  reviewedOther("nonstop_express_segment", "nonstop_express_segment"),
  reviewedOther("nonstop_segment", "nonstop_segment"),
  reviewedOther("overnight_service", "overnight_service"),
  reviewedOther("overnight_service_changes", "overnight_service_changes"),
  reviewedOther("overnight_service_discontinuation", "overnight_service_discontinuation"),
  reviewedOther("overnight_service_expansion", "overnight_service_expansion"),
  reviewedOther("overnight_service_extension", "overnight_service_extension"),
  reviewedOther("peak_only_extension", "peak_only_extension"),
  reviewedOther("peak_only_service", "peak_only_service"),
  reviewedMapped("pedestrian_safety_improvements", "pedestrian_improvement", "street_design"),
  reviewedOther("pedestrian_space", "pedestrian_space"),
  reviewedOther("plastic_delineators", "plastic_delineators"),
  reviewedOther("priority_corridor", "priority_corridor"),
  reviewedOther("priority_corridor_designation", "priority_corridor_designation"),
  reviewedOther("public_toilet", "public_toilet"),
  reviewedMapped("queue_jump", "queue_jump", "signal_priority"),
  reviewedOther("raised crosswalks", "raised crosswalks"),
  reviewedOther("real_time_passenger_information", "real_time_passenger_information"),
  reviewedOther("renumbering", "renumbering"),
  reviewedMapped("reroute", "route_redesign", "service_change"),
  reviewedOther("roadway reconstruction", "roadway reconstruction"),
  reviewedOther("route_added", "route_added"),
  reviewedOther("route_combination", "route_combination"),
  reviewedOther("route_consolidation", "route_consolidation"),
  reviewedOther("route_discontinuation", "route_discontinuation"),
  reviewedOther("route_discontinued", "route_discontinued"),
  reviewedOther("route_extension", "route_extension"),
  reviewedOther("route_modified", "route_modified"),
  reviewedOther("route_pattern_simplification", "route_pattern_simplification"),
  reviewedOther("route_re-labeling", "route_re-labeling"),
  reviewedOther("route_realignment", "route_realignment"),
  reviewedOther("route_relabel", "route_relabel"),
  reviewedOther("route_relabeling", "route_relabeling"),
  reviewedOther("route_renaming", "route_renaming"),
  reviewedOther("route_renumbering", "route_renumbering"),
  reviewedOther("route_replacement", "route_replacement"),
  reviewedOther("route_restructure", "route_restructure"),
  reviewedOther("route_restructuring", "route_restructuring"),
  reviewedOther("route_shortening", "route_shortening"),
  reviewedOther("route_simplification", "route_simplification"),
  reviewedOther("route_split", "route_split"),
  reviewedOther("route_streamlining", "route_streamlining"),
  reviewedOther("route_truncation", "route_truncation"),
  reviewedOther("route_type_change", "route_type_change"),
  reviewedOther("route_type_restructuring", "route_type_restructuring"),
  reviewedOther("route_variant_reduction", "route_variant_reduction"),
  reviewedOther("routing_change", "routing_change"),
  reviewedOther("routing_retention", "routing_retention"),
  reviewedOther("rtpi_sign_installation", "rtpi_sign_installation"),
  reviewedOther("rush_route", "rush_route"),
  reviewedOther("rush_route_type", "rush_route_type"),
  reviewedOther("rush_service", "rush_service"),
  reviewedOther("saturday_discontinuation", "saturday_discontinuation"),
  reviewedOther("saturday_service_discontinuation", "saturday_service_discontinuation"),
  reviewedOther("sbs_extension", "sbs_extension"),
  reviewedMapped("select_bus_service", "select_bus_service", "service_package"),
  reviewedMapped("select_bus_service_conversion", "select_bus_service", "service_package"),
  reviewedOther("service_coverage_transfer", "service_coverage_transfer"),
  reviewedOther("service_discontinuation", "service_discontinuation"),
  reviewedOther("service_pattern_change", "service_pattern_change"),
  reviewedOther("service_pattern_split", "service_pattern_split"),
  reviewedOther("service_reduction", "service_reduction"),
  reviewedOther("service_reliability_improvement", "service_reliability_improvement"),
  reviewedOther("service_replaced", "service_replaced"),
  reviewedOther("service_replacement", "service_replacement"),
  reviewedOther("service_restructuring", "service_restructuring"),
  reviewedOther("service_span_change", "service_span_change"),
  reviewedOther("service_span_definition", "service_span_definition"),
  reviewedOther("service_span_reduction", "service_span_reduction"),
  reviewedOther("service_span_shortening", "service_span_shortening"),
  reviewedOther("sidewalk reconstruction", "sidewalk reconstruction"),
  reviewedOther("span_change", "span_change"),
  reviewedOther("span_changes", "span_changes"),
  reviewedOther("span_extension", "span_extension"),
  reviewedOther("span_improvement", "span_improvement"),
  reviewedOther("span_increase", "span_increase"),
  reviewedOther("span_reduction", "span_reduction"),
  reviewedOther("span_shortening", "span_shortening"),
  reviewedMapped(
    "stationary_bus_lane_camera_enforcement",
    "automated_bus_lane_enforcement",
    "enforcement",
  ),
  reviewedOther("stop_added", "stop_added"),
  reviewedMapped("stop_consolidation", "stop_consolidation", "stop_change"),
  reviewedMapped("stop_relocation", "stop_relocation", "stop_change"),
  reviewedOther("stop_removal", "stop_removal"),
  reviewedOther("stop_spacing_adjustment", "stop_spacing_adjustment"),
  reviewedOther("stop_spacing_improvement", "stop_spacing_improvement"),
  reviewedOther("stop_spacing_optimization", "stop_spacing_optimization"),
  reviewedOther("stop_spacing_widening", "stop_spacing_widening"),
  reviewedOther("street lighting and signal upgrades", "street lighting and signal upgrades"),
  reviewedOther("sunday_discontinuation", "sunday_discontinuation"),
  reviewedOther("terminal_extension", "terminal_extension"),
  reviewedOther("terminal_relocation", "terminal_relocation"),
  reviewedOther("terminus_change", "terminus_change"),
  reviewedOther("terminus_shortening", "terminus_shortening"),
  reviewedOther("terminus_truncation", "terminus_truncation"),
  reviewedOther("traffic_enforcement_agent_deployment", "traffic_enforcement_agent_deployment"),
  reviewedOther("transit_and_truck_priority_pilot", "transit_and_truck_priority_pilot"),
  reviewedOther("transit_priority_treatments", "transit_priority_treatments"),
  reviewedMapped("transit_signal_priority", "transit_signal_priority", "signal_priority"),
  reviewedOther("tree planting and landscaping", "tree planting and landscaping"),
  reviewedOther("truck_priority", "truck_priority"),
  reviewedMapped("turn_ban", "turn_restriction", "street_design"),
  reviewedMapped("turn_restrictions", "turn_restriction", "street_design"),
  reviewedOther("water main and sewer upgrades", "water main and sewer upgrades"),
  reviewedOther("weekend_service_expansion", "weekend_service_expansion"),
  reviewedOther("weekend_service_introduction", "weekend_service_introduction"),
  reviewedOther("wide_stop_spacing", "wide_stop_spacing"),
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

/**
 * Most reviewed rows below carry the raw value as their own label, which is how
 * `priority_corridor_designation` reached a public face verbatim. A label equal
 * to its raw value is not a display name, so it is humanized here instead —
 * one helper covering every self-labeled row. A label that genuinely differs is
 * an authored display name and survives untouched.
 */
function reviewedOther(
  rawValue: string,
  reviewedLabel: string,
): ReviewedOpenTreatmentDispositionV1 {
  return {
    rawValue,
    disposition: "other_documented",
    treatmentKind: "other_documented",
    treatmentFamily: "other",
    reviewedLabel: reviewedLabel === rawValue ? humanizeRawValue(rawValue) : reviewedLabel,
  };
}

function humanizeRawValue(value: string): string {
  const words = value.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MTA_WIKI_ATOMIC_TREATMENT_DISPOSITIONS_V1 = {
  all_door_boarding: mapped("all_door_boarding", "boarding_and_fare"),
  automated_bus_lane_enforcement: mapped("automated_bus_lane_enforcement", "enforcement"),
  bus_bulb: mapped("bus_bulb", "street_design"),
  bus_lane: mapped("bus_lane", "bus_priority_lane"),
  busway: mapped("busway", "bus_priority_lane"),
  neckdown: mapped("neckdown", "street_design"),
  off_board_fare_collection: mapped("off_board_fare_collection", "boarding_and_fare"),
  pedestrian_improvement: mapped("pedestrian_improvement", "street_design"),
  queue_jump: mapped("queue_jump", "signal_priority"),
  signal_retiming: mapped("signal_retiming", "signal_priority"),
  stop_change: mapped("stop_change", "stop_change"),
  stop_consolidation: mapped("stop_consolidation", "stop_change"),
  stop_relocation: mapped("stop_relocation", "stop_change"),
  transit_signal_priority: mapped("transit_signal_priority", "signal_priority"),
  turn_restriction: mapped("turn_restriction", "street_design"),
} as const satisfies Partial<Record<MtaWikiTreatmentSemanticKindV1, MappedTreatmentDisposition>>;

function nonemptyExactValue(value: string, path: string): string {
  if (value.length === 0) throw new Error(`${path} must be non-empty`);
  return value;
}

function nonemptyIdentifier(value: string, path: string): string {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${path} must be a non-empty value without surrounding whitespace`);
  }
  return value;
}

function uniqueRecordIds(values: readonly string[], path: string): string[] {
  if (values.length === 0) throw new Error(`${path} must contain at least one record ID`);
  const recordIds = values.map((value, index) => nonemptyIdentifier(value, `${path}[${index}]`));
  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error(`${path} must not contain duplicate record IDs`);
  }
  return recordIds;
}

function mtaWikiSemanticKind(
  canonicalKind: string,
  family: string,
  path: string,
): MtaWikiTreatmentSemanticKindV1 {
  const expectedFamily = (
    MTA_WIKI_TREATMENT_SEMANTIC_KIND_FAMILIES_V1 as Readonly<Record<string, string>>
  )[canonicalKind];
  if (expectedFamily === undefined) {
    throw new Error(`${path}.canonical_kind is not in the reviewed v1 producer vocabulary`);
  }
  if (family !== expectedFamily) {
    throw new Error(`${path}.family must be ${expectedFamily} for canonical kind ${canonicalKind}`);
  }
  return canonicalKind as MtaWikiTreatmentSemanticKindV1;
}

function mtaWikiSemanticFamily(
  family: string | null,
  path: string,
): MtaWikiTreatmentSemanticFamilyV1 | null {
  if (family === null) return null;
  const families = new Set<string>(Object.values(MTA_WIKI_TREATMENT_SEMANTIC_KIND_FAMILIES_V1));
  if (!families.has(family)) {
    throw new Error(`${path} is not in the reviewed v1 producer vocabulary`);
  }
  return family as MtaWikiTreatmentSemanticFamilyV1;
}

/**
 * Adapts a strictly decoded producer artifact into the analytics contract.
 * Atomic semantics must match the Studio mapping exactly. Bundle members use
 * the producer's closed v1 vocabulary and are never split or folded into an
 * `other_documented` row. Unresolved rows remain unresolved.
 */
export function adaptMtaWikiTreatmentSemanticContractV1(
  artifact: MtaWikiTreatmentSemanticArtifactV1,
): MtaWikiTreatmentSemanticContractV1 {
  if (artifact.schema_version !== MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION) {
    throw new Error(
      `MTA Wiki treatment semantics schema must be ${MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION}`,
    );
  }
  const dispositions = artifact.dispositions.map(
    (disposition, dispositionIndex): MtaWikiTreatmentSemanticDispositionV1 => {
      const path = `treatment_semantics.dispositions[${dispositionIndex}]`;
      const rawValue = nonemptyExactValue(
        disposition.raw_treatment_kind,
        `${path}.raw_treatment_kind`,
      );
      const recordIds = uniqueRecordIds(disposition.record_ids, `${path}.record_ids`);
      if (disposition.disposition === "atomic") {
        const canonicalKind = mtaWikiSemanticKind(
          disposition.canonical_kind,
          disposition.family,
          path,
        );
        const mapping = (
          MTA_WIKI_ATOMIC_TREATMENT_DISPOSITIONS_V1 as Partial<
            Record<MtaWikiTreatmentSemanticKindV1, MappedTreatmentDisposition>
          >
        )[canonicalKind];
        if (mapping === undefined) {
          throw new Error(
            `${path}.canonical_kind ${canonicalKind} is not an atomic Studio presentation mapping`,
          );
        }
        return { disposition: "atomic", rawValue, recordIds, mapping };
      }
      if (disposition.disposition === "bundle") {
        if (disposition.members.length < 2) {
          throw new Error(`${path}.members must retain at least two source-backed members`);
        }
        const members = disposition.members.map((member, memberIndex) => {
          const memberPath = `${path}.members[${memberIndex}]`;
          const memberRawValue = nonemptyExactValue(
            member.raw_treatment_kind,
            `${memberPath}.raw_treatment_kind`,
          );
          const canonicalKind = mtaWikiSemanticKind(
            member.canonical_kind,
            member.family,
            memberPath,
          );
          return {
            rawValue: memberRawValue,
            canonicalKind,
            family: MTA_WIKI_TREATMENT_SEMANTIC_KIND_FAMILIES_V1[canonicalKind],
          };
        });
        if (new Set(members.map((member) => member.rawValue)).size !== members.length) {
          throw new Error(`${path}.members must not duplicate raw treatment wording`);
        }
        return {
          disposition: "bundle",
          rawValue,
          recordIds,
          bundleFamily: mtaWikiSemanticFamily(disposition.bundle_family, `${path}.bundle_family`),
          members,
        };
      }
      return {
        disposition: "unresolved",
        rawValue,
        recordIds,
        reviewReason: nonemptyIdentifier(disposition.review_reason, `${path}.review_reason`),
      };
    },
  );
  return { schemaVersion: MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION, dispositions };
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

function semanticScopeKey(scope: MtaWikiTreatmentVocabularyScopeV1): string {
  return `${scope.rawValue}\0${scope.recordId}`;
}

function sortedSemanticScopes<T extends MtaWikiTreatmentVocabularyScopeV1>(values: T[]): T[] {
  return values.sort((left, right) => compareText(semanticScopeKey(left), semanticScopeKey(right)));
}

function duplicateSemanticScopes(
  scopes: readonly MtaWikiTreatmentVocabularyScopeV1[],
): MtaWikiTreatmentSemanticDuplicateScopeV1[] {
  const counts = new Map<string, number>();
  for (const scope of scopes) {
    const key = semanticScopeKey(scope);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => {
      const [rawValue, recordId] = key.split("\0") as [string, string];
      return { rawValue, recordId, count };
    })
    .sort((left, right) => compareText(semanticScopeKey(left), semanticScopeKey(right)));
}

/**
 * Reconciles the producer's semantic rows against the exact record-scoped
 * vocabulary collected by the caller. Coverage can be exact while semantic
 * publication remains blocked: every explicit `unresolved` row is retained
 * in `blockingUnresolvedScopes` and keeps `publishable` false.
 */
export function reconcileMtaWikiTreatmentSemanticsV1(input: {
  vocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  artifact: MtaWikiTreatmentSemanticArtifactV1;
}): MtaWikiTreatmentSemanticReconciliationV1 {
  const contract = adaptMtaWikiTreatmentSemanticContractV1(input.artifact);
  const vocabularyScopes = input.vocabularyScopes.map((scope, index) => ({
    rawValue: nonemptyExactValue(scope.rawValue, `vocabularyScopes[${index}].rawValue`),
    recordId: nonemptyIdentifier(scope.recordId, `vocabularyScopes[${index}].recordId`),
  }));
  const dispositionScopes = contract.dispositions.flatMap((disposition) =>
    disposition.recordIds.map((recordId) => ({ rawValue: disposition.rawValue, recordId })),
  );
  const vocabularyScopeKeys = new Set(vocabularyScopes.map(semanticScopeKey));
  const dispositionScopeKeys = new Set(dispositionScopes.map(semanticScopeKey));
  const vocabularyLiterals = new Set(vocabularyScopes.map((scope) => scope.rawValue));
  const dispositionLiterals = new Set(contract.dispositions.map((row) => row.rawValue));

  const rawValuesByVocabularyRecordId = new Map<string, Set<string>>();
  for (const scope of vocabularyScopes) {
    const rawValues = rawValuesByVocabularyRecordId.get(scope.recordId) ?? new Set<string>();
    rawValues.add(scope.rawValue);
    rawValuesByVocabularyRecordId.set(scope.recordId, rawValues);
  }
  const ambiguousVocabularyRecordIds = [...rawValuesByVocabularyRecordId.entries()]
    .filter(([, rawValues]) => rawValues.size > 1)
    .map(([recordId]) => recordId)
    .sort(compareText);

  const missingLiterals = [...vocabularyLiterals]
    .filter((rawValue) => !dispositionLiterals.has(rawValue))
    .sort(compareText);
  const staleLiterals = [...dispositionLiterals]
    .filter((rawValue) => !vocabularyLiterals.has(rawValue))
    .sort(compareText);
  const missingScopes = sortedSemanticScopes(
    vocabularyScopes.filter((scope) => !dispositionScopeKeys.has(semanticScopeKey(scope))),
  );
  const unknownScopes: MtaWikiTreatmentSemanticScopeIssueV1[] = [];
  const staleScopes: MtaWikiTreatmentSemanticScopeIssueV1[] = [];
  for (const scope of dispositionScopes) {
    const vocabularyRawValues = rawValuesByVocabularyRecordId.get(scope.recordId);
    if (vocabularyRawValues === undefined) {
      unknownScopes.push({ ...scope, reason: "record_not_in_vocabulary" });
    } else if (!vocabularyRawValues.has(scope.rawValue)) {
      staleScopes.push({ ...scope, reason: "literal_mismatch" });
    }
  }
  sortedSemanticScopes(unknownScopes);
  sortedSemanticScopes(staleScopes);

  const duplicateDispositionScopes = duplicateSemanticScopes(dispositionScopes);
  const duplicateVocabularyScopes = duplicateSemanticScopes(vocabularyScopes);
  const blockingUnresolvedScopes = sortedSemanticScopes(
    contract.dispositions.flatMap((disposition) =>
      disposition.disposition === "unresolved"
        ? disposition.recordIds.map((recordId) => ({
            rawValue: disposition.rawValue,
            recordId,
            reviewReason: disposition.reviewReason,
          }))
        : [],
    ),
  );
  const exact =
    missingLiterals.length === 0 &&
    staleLiterals.length === 0 &&
    missingScopes.length === 0 &&
    unknownScopes.length === 0 &&
    staleScopes.length === 0 &&
    duplicateDispositionScopes.length === 0 &&
    duplicateVocabularyScopes.length === 0 &&
    ambiguousVocabularyRecordIds.length === 0;
  const countScopes = (disposition: MtaWikiTreatmentSemanticDispositionV1["disposition"]) =>
    contract.dispositions
      .filter((row) => row.disposition === disposition)
      .reduce((count, row) => count + row.recordIds.length, 0);

  return {
    schemaVersion: MTA_WIKI_TREATMENT_SEMANTICS_SCHEMA_VERSION,
    exact,
    publishable: exact && blockingUnresolvedScopes.length === 0,
    summary: {
      vocabularyLiteralCount: vocabularyLiterals.size,
      vocabularyRecordScopeCount: vocabularyScopeKeys.size,
      dispositionCount: contract.dispositions.length,
      atomicDispositionCount: contract.dispositions.filter((row) => row.disposition === "atomic")
        .length,
      bundleDispositionCount: contract.dispositions.filter((row) => row.disposition === "bundle")
        .length,
      unresolvedDispositionCount: contract.dispositions.filter(
        (row) => row.disposition === "unresolved",
      ).length,
      atomicRecordScopeCount: countScopes("atomic"),
      bundleRecordScopeCount: countScopes("bundle"),
      unresolvedRecordScopeCount: countScopes("unresolved"),
    },
    missingLiterals,
    staleLiterals,
    missingScopes,
    unknownScopes,
    staleScopes,
    duplicateDispositionScopes,
    duplicateVocabularyScopes,
    ambiguousVocabularyRecordIds,
    blockingUnresolvedScopes,
  };
}

export function assertMtaWikiTreatmentSemanticsReconciledV1(input: {
  vocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  artifact: MtaWikiTreatmentSemanticArtifactV1;
}): MtaWikiTreatmentSemanticReconciliationV1 {
  const reconciliation = reconcileMtaWikiTreatmentSemanticsV1(input);
  if (!reconciliation.exact) {
    throw new Error(
      `MTA Wiki treatment semantic scopes do not reconcile: missing=${reconciliation.missingScopes.length}, unknown=${reconciliation.unknownScopes.length}, stale=${reconciliation.staleScopes.length}, duplicate=${reconciliation.duplicateDispositionScopes.length}`,
    );
  }
  return reconciliation;
}

export function assertMtaWikiTreatmentSemanticsPublishableV1(input: {
  vocabularyScopes: readonly MtaWikiTreatmentVocabularyScopeV1[];
  artifact: MtaWikiTreatmentSemanticArtifactV1;
}): MtaWikiTreatmentSemanticReconciliationV1 {
  const reconciliation = assertMtaWikiTreatmentSemanticsReconciledV1(input);
  if (!reconciliation.publishable) {
    throw new Error(
      `MTA Wiki treatment semantics contain ${reconciliation.blockingUnresolvedScopes.length} unresolved record scope(s)`,
    );
  }
  return reconciliation;
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
