import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";

const ARTIFACT_KIND = "bp.tier2_manual_vocab_projection_overlay.v1";
const DEFAULT_KEY_IDS = ["eventFamily", "eventSubtype", "eventTreatmentFamily"] as const;

type JsonRecord = Record<string, unknown>;
type ProjectionDecision = "mapped" | "preserve_raw" | "unresolved";

type ProjectionRow = {
  keyId: string;
  targetPayloadPath: string;
  rawValue: string;
  decision: ProjectionDecision;
  originalDecision: ProjectionDecision;
  canonicalLeafId: string | null;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  modifiers: Record<string, string[]>;
  evidenceProvenance: {
    inputCount: number;
    sourceFieldCounts: Record<string, number>;
    surfaceKindCounts: Record<string, number>;
    examples: unknown[];
  };
};

type ProjectionArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  sourceManifestPath: string;
  rowCount: number;
  rows: ProjectionRow[];
};

type GraduationKey = {
  id: string;
  targetPayloadPath: string;
  sourceFieldPaths: string[];
};

type ManualDecision = {
  decision: ProjectionDecision;
  canonicalLeafId: string | null;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  ruleId: string;
  rationale: string;
};

type MissingRawValue = {
  keyId: string;
  targetPayloadPath: string;
  rawValue: string;
  inputCount: number;
  sourceFieldCounts: Record<string, number>;
  surfaceKindCounts: Record<string, number>;
  examples: JsonRecord[];
};

type OverlayKeySummary = {
  manualProjectionRowCount: number;
  missingProjectionInstanceCountBefore: number;
  manualDecisionDistinctCounts: Record<string, number>;
  manualDecisionInstanceCounts: Record<string, number>;
};

type OverlaySummary = {
  sourceProjectionRowCount: number;
  sourceProjectionSanitizedRowCount: number;
  manualProjectionRowCount: number;
  expandedProjectionRowCount: number;
  missingProjectionInstanceCountBefore: number;
  missingProjectionDistinctRawValueCountBefore: number;
  eventFamilyMissingSourceFieldEventCandidateCount: number;
  byKey: Record<string, OverlayKeySummary>;
  manualRuleInstanceCounts: Record<string, number>;
};

type TopDecisionRow = {
  rawValue: string;
  inputCount: number;
  ruleId: string;
  exampleDisplayLabel: unknown;
};

export type BuildTier2ManualVocabProjectionOverlayArgs = {
  canonicalMergePath: string;
  graduationPlanPath: string;
  sourceProjectionPath: string;
  outputRoot?: string;
  keyIds?: string[];
  generatedAt?: string;
};

type CliArgs = Partial<BuildTier2ManualVocabProjectionOverlayArgs>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function primitiveValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => primitiveValues(item));
  if (["string", "number", "boolean"].includes(typeof value)) {
    const normalized = String(value).replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? [normalized] : [];
  }
  return [];
}

function pathValues(root: unknown, path: string): string[] {
  let values: unknown[] = [root];
  for (const part of path.split(".")) {
    const next: unknown[] = [];
    for (const value of values) {
      if (!isRecord(value)) continue;
      const child = value[part];
      if (child === undefined) continue;
      if (Array.isArray(child)) next.push(...child);
      else next.push(child);
    }
    values = next;
  }
  return values.flatMap((value) => primitiveValues(value));
}

function normalizeTokenKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function tokens(value: string): { tokenSet: Set<string>; text: string } {
  const parts = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return {
    tokenSet: new Set(parts),
    text: `_${parts.join("_")}_`,
  };
}

function hasToken(tokenSet: Set<string>, ...values: string[]): boolean {
  return values.some((value) => tokenSet.has(value));
}

function hasPhrase(text: string, value: string): boolean {
  return text.includes(`_${value}_`);
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function projectionIndexKey(keyId: string, rawValue: string): string {
  return `${keyId}\u0000${rawValue}`;
}

const metricPlaceSpecificLeafMarkers = [
  "flushing",
  "jamaica",
  "fordham",
  "nostrand",
  "utica",
  "hylan",
  "webster",
  "woodhaven",
  "bronx",
  "brooklyn",
  "queens",
  "manhattan",
  "staten",
  "34th",
  "one25th",
] as const;

function metricLeafLooksTooSpecificForRaw(keyId: string, rawValue: string, canonicalLeafId: string | null): boolean {
  if (canonicalLeafId === null) return false;
  if (keyId !== "metricFamily" && keyId !== "metricSubjectFamily") return false;
  const raw = normalizeTokenKey(rawValue);
  const leaf = normalizeTokenKey(canonicalLeafId);
  if (leaf.includes("lmb") && !raw.includes("lmb") && !raw.includes("lower_montauk")) return true;
  if (leaf.includes("lower_montauk") && !raw.includes("lower_montauk") && !raw.includes("lmb")) return true;
  if (leaf.includes("lic_to_jamaica") && !raw.includes("lic") && !raw.includes("jamaica")) return true;
  return metricPlaceSpecificLeafMarkers.some((marker) => leaf.includes(marker) && !raw.includes(marker));
}

function rawLooksRouteSpecific(rawValue: string): boolean {
  return /\b(?:b|bx|m|q|s)\d{1,3}[a-z]?\b/i.test(rawValue);
}

function rawLooksBusSpecific(rawValue: string, tokenSet: Set<string>): boolean {
  return hasToken(tokenSet, "bus", "buses", "sbs", "brt", "select", "nyct") || rawLooksRouteSpecific(rawValue);
}

function rawLooksNonBusVehicleSpecific(tokenSet: Set<string>, text: string): boolean {
  return (
    hasToken(tokenSet, "taxi", "taxis", "cab", "cabs", "car", "cars", "vehicle", "vehicles", "vehicular") ||
    hasPhrase(text, "non_bus") ||
    hasPhrase(text, "all_vehicles")
  );
}

function rawLooksPercentOrChange(rawValue: string, tokenSet: Set<string>): boolean {
  return (
    rawValue.includes("%") ||
    hasToken(
      tokenSet,
      "percent",
      "percentage",
      "change",
      "reduction",
      "increase",
      "improvement",
      "savings",
      "faster",
      "decrease",
      "decline",
    )
  );
}

function metricLeafLooksTooBroadForPublicClaims(
  keyId: string,
  rawValue: string,
  canonicalLeafId: string | null,
): boolean {
  if (canonicalLeafId === null) return false;
  if (keyId !== "metricFamily" && keyId !== "metricSubjectFamily") return false;
  const leaf = normalizeTokenKey(canonicalLeafId);
  const { tokenSet, text } = tokens(rawValue);
  const busSpecific = rawLooksBusSpecific(rawValue, tokenSet);
  const nonBusVehicleSpecific = rawLooksNonBusVehicleSpecific(tokenSet, text);
  const percentOrChange = rawLooksPercentOrChange(rawValue, tokenSet);

  if (keyId === "metricFamily") {
    if (leaf === "bus_speed_mph") return !busSpecific || nonBusVehicleSpecific || (percentOrChange && !hasToken(tokenSet, "mph"));
    if (leaf === "bus_travel_time_minutes" || leaf === "bus_running_time_minutes") {
      return !busSpecific || nonBusVehicleSpecific || percentOrChange;
    }
    if (leaf === "bus_lane_width_feet") {
      return !(hasPhrase(text, "bus_lane") || (hasToken(tokenSet, "bus") && hasToken(tokenSet, "lane", "lanes")));
    }
    if (leaf === "parking_occupancy_rate_metered_blocks") {
      return !(hasToken(tokenSet, "occupancy", "occupied") && hasToken(tokenSet, "parking", "metered", "meter", "meters", "block", "blocks"));
    }
    if (leaf === "corridor_length_miles") {
      return !(hasToken(tokenSet, "corridor") && hasToken(tokenSet, "length", "distance", "mile", "miles"));
    }
    if (leaf === "bus_stop_count") {
      return !(
        (hasPhrase(text, "bus_stop") || (hasToken(tokenSet, "bus") && hasToken(tokenSet, "stop", "stops"))) &&
        hasToken(tokenSet, "count", "counts", "number", "total")
      );
    }
    if (leaf === "pedestrian_injuries_count") {
      return !(hasToken(tokenSet, "pedestrian", "pedestrians") && hasToken(tokenSet, "injury", "injuries")) || percentOrChange;
    }
    if (leaf === "outreach_comment_count") {
      if (hasToken(tokenSet, "rating", "ratings", "vote", "votes", "meeting", "meetings", "location", "locations", "stop", "stops")) {
        return true;
      }
      return !hasToken(tokenSet, "comment", "comments", "submission", "submissions");
    }
    if (leaf === "bus_bunching") return !hasToken(tokenSet, "bunching", "bunched");
    if (leaf === "average_speed_increase_mph") {
      return !(hasToken(tokenSet, "speed") && hasToken(tokenSet, "increase", "improvement", "faster") && hasToken(tokenSet, "mph"));
    }
  }

  if (keyId === "metricSubjectFamily") {
    if (leaf === "bus_travel_time") return !busSpecific || nonBusVehicleSpecific;
    if (leaf === "parking_spaces") {
      return !(hasToken(tokenSet, "parking") && hasToken(tokenSet, "space", "spaces", "count", "counts", "supply"));
    }
    if (leaf === "bus_speed") return !busSpecific || nonBusVehicleSpecific;
    if (leaf === "mode_share") {
      return !hasToken(tokenSet, "mode", "share", "commute", "commuting", "transit", "drive", "driving", "walk", "walking");
    }
  }

  return false;
}

function metricProjectionSanitizationReason(row: ProjectionRow): string | null {
  if (row.decision !== "mapped") return null;
  if (metricLeafLooksTooSpecificForRaw(row.keyId, row.rawValue, row.canonicalLeafId)) {
    return "Quarantined because the canonical leaf is location/project-specific but the raw value is generic.";
  }
  if (metricLeafLooksTooBroadForPublicClaims(row.keyId, row.rawValue, row.canonicalLeafId)) {
    return "Quarantined because the canonical leaf is too semantically broad or specific for public metric claims.";
  }
  return null;
}

function sanitizeUnsafeMetricProjectionRow(row: ProjectionRow): ProjectionRow {
  if (metricProjectionSanitizationReason(row) === null) return row;
  return {
    ...row,
    decision: "preserve_raw",
    canonicalLeafId: null,
    canonicalLeafLabel: null,
  };
}

function modifiersFor(rawValue: string, coarseFamily: string): Record<string, string[]> {
  const { tokenSet } = tokens(rawValue);
  const modes = new Set<string>();
  if (tokenSet.has("brt")) modes.add("brt");
  if (tokenSet.has("sbs") || (tokenSet.has("select") && tokenSet.has("bus") && tokenSet.has("service"))) {
    modes.add("select_bus_service");
  }
  if (tokenSet.has("bus")) modes.add("bus");
  if (
    coarseFamily === "rail_non_bus" ||
    hasToken(tokenSet, "rail", "train", "subway", "streetcar", "lirr")
  ) {
    modes.add("rail");
  }
  if (tokenSet.has("traffic")) modes.add("traffic");
  if (hasToken(tokenSet, "curb", "curbside", "parking", "loading")) modes.add("curb_or_parking");
  return {
    routeIds: [],
    directions: [],
    periods: [],
    geographies: [],
    modes: [...modes].sort((left, right) => left.localeCompare(right)),
  };
}

class LeafResolver {
  private readonly byKeyAndLeaf = new Map<string, ProjectionRow>();
  private readonly byKeyAndNormalizedAlias = new Map<string, ProjectionRow>();

  constructor(rows: ProjectionRow[]) {
    for (const row of rows) {
      const aliasKey = projectionIndexKey(row.keyId, normalizeTokenKey(row.rawValue));
      if (!this.byKeyAndNormalizedAlias.has(aliasKey)) this.byKeyAndNormalizedAlias.set(aliasKey, row);
      if (row.decision === "mapped" && row.canonicalLeafId !== null) {
        const leafKey = projectionIndexKey(row.keyId, row.canonicalLeafId);
        if (!this.byKeyAndLeaf.has(leafKey)) this.byKeyAndLeaf.set(leafKey, row);
      }
    }
  }

  existingAliasDecision(keyId: string, rawValue: string): ManualDecision | null {
    const row = this.byKeyAndNormalizedAlias.get(projectionIndexKey(keyId, normalizeTokenKey(rawValue)));
    if (row === undefined) return null;
    if (metricLeafLooksTooSpecificForRaw(keyId, rawValue, row.canonicalLeafId)) return null;
    return {
      decision: row.decision,
      canonicalLeafId: row.canonicalLeafId,
      canonicalLeafLabel: row.canonicalLeafLabel,
      coarseFamily: row.coarseFamily,
      ruleId: "manual_normalized_existing_alias",
      rationale: "Normalized raw value matches an existing projection alias for the same key.",
    };
  }

  mapped(keyId: string, canonicalLeafId: string, ruleId: string, rationale: string): ManualDecision | null {
    const row = this.byKeyAndLeaf.get(projectionIndexKey(keyId, canonicalLeafId));
    if (row === undefined) return null;
    return {
      decision: "mapped",
      canonicalLeafId,
      canonicalLeafLabel: row.canonicalLeafLabel,
      coarseFamily: row.coarseFamily,
      ruleId,
      rationale,
    };
  }
}

function preserve(coarseFamily: string, ruleId: string, rationale: string): ManualDecision {
  return {
    decision: "preserve_raw",
    canonicalLeafId: null,
    canonicalLeafLabel: null,
    coarseFamily,
    ruleId,
    rationale,
  };
}

function unresolved(coarseFamily: string, ruleId: string, rationale: string): ManualDecision {
  return {
    decision: "unresolved",
    canonicalLeafId: null,
    canonicalLeafLabel: null,
    coarseFamily,
    ruleId,
    rationale,
  };
}

function mappedOrPreserve(
  resolver: LeafResolver,
  keyId: string,
  canonicalLeafId: string,
  rawValue: string,
  coarseFamily: string,
  ruleId: string,
  rationale: string,
): ManualDecision {
  return resolver.mapped(keyId, canonicalLeafId, ruleId, rationale) ?? preserve(coarseFamily, `${ruleId}_leaf_missing`, `No existing leaf ${canonicalLeafId} for ${rawValue}; preserving raw value.`);
}

function mappedFirstOrPreserve(
  resolver: LeafResolver,
  keyId: string,
  canonicalLeafIds: string[],
  rawValue: string,
  coarseFamily: string,
  ruleId: string,
  rationale: string,
): ManualDecision {
  for (const canonicalLeafId of canonicalLeafIds) {
    const decision = resolver.mapped(keyId, canonicalLeafId, ruleId, rationale);
    if (decision !== null) return decision;
  }
  return preserve(
    coarseFamily,
    `${ruleId}_leaf_missing`,
    `No existing candidate leaf for ${rawValue}; preserving raw value.`,
  );
}

const eventFamilyPreserveExact = new Set([
  "brt_project",
  "bus_rapid_transit_project",
  "bus_stop_improvement",
  "fleet_and_technology",
  "natural_disaster",
  "opening",
  "procurement",
  "program_launch_or_implementation",
  "project_opening",
  "safety_and_operational_project",
  "street_reopening",
  "system_replacement",
  "transit_opening",
]);

const eventFamilyProposedExact = new Set(["bus_rapid_transit_design", "design_selection", "project_action"]);

function classifyEventFamily(rawValue: string, resolver: LeafResolver): ManualDecision {
  const normalized = normalizeTokenKey(rawValue);
  const existing = resolver.existingAliasDecision("eventFamily", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  if (eventFamilyPreserveExact.has(normalized)) {
    return preserve("other_event", "manual_event_family_preserve_exact", "Raw label is too broad or context-dependent to map globally.");
  }
  if (eventFamilyProposedExact.has(normalized)) {
    return mappedOrPreserve(resolver, "eventFamily", "proposed_design", rawValue, "planning_design", "manual_event_family_exact_proposed", "Exact manual proposed-design alias.");
  }
  if ((hasToken(tokenSet, "rail", "train", "lirr", "subway", "streetcar") || hasPhrase(text, "7_train") || hasPhrase(text, "7_line")) && !hasToken(tokenSet, "bus", "brt", "sbs")) {
    return preserve("rail_non_bus", "manual_event_family_rail_non_bus", "Rail/non-bus label is preserved.");
  }
  if (hasPhrase(text, "right_of_way") || hasPhrase(text, "property_acquisition") || tokenSet.has("acquisition")) {
    return mappedOrPreserve(resolver, "eventFamily", "right_of_way_acquisition", rawValue, "other_event", "manual_event_family_right_of_way", "Acquisition/property-right label.");
  }
  if (hasToken(tokenSet, "fatality", "fatalities", "crash", "crashes", "collision", "injury", "injuries", "incident", "incidents")) {
    return mappedOrPreserve(resolver, "eventFamily", "safety_incident", rawValue, "other_event", "manual_event_family_safety", "Safety incident label.");
  }
  if (hasToken(tokenSet, "environmental", "nepa", "ceqr", "eas", "eis") || hasPhrase(text, "regulatory_review") || hasPhrase(text, "environmental_review") || hasPhrase(text, "regulatory_compliance")) {
    return mappedOrPreserve(resolver, "eventFamily", "environmental_review", rawValue, "other_event", "manual_event_family_environmental", "Environmental/regulatory review label.");
  }
  if (hasToken(tokenSet, "funding", "grant", "budget", "finance") || hasPhrase(text, "funding_application") || hasPhrase(text, "funding_allocation")) {
    return mappedOrPreserve(resolver, "eventFamily", "funding_decision", rawValue, "other_event", "manual_event_family_funding", "Funding/grant/budget label.");
  }
  if (hasToken(tokenSet, "enforcement", "camera", "cameras", "summons", "summonses", "compliance")) {
    return mappedOrPreserve(resolver, "eventFamily", "enforcement", rawValue, "other_event", "manual_event_family_enforcement", "Enforcement/camera label.");
  }
  if (hasToken(tokenSet, "signal", "signals", "tsp") || hasPhrase(text, "queue_jump") || hasPhrase(text, "turn_restriction") || hasPhrase(text, "signal_priority") || hasPhrase(text, "signal_timing")) {
    return mappedOrPreserve(resolver, "eventFamily", "signal_timing", rawValue, "other_event", "manual_event_family_signal", "Signal/TSP label.");
  }
  if (hasToken(tokenSet, "curb", "curbside", "parking", "loading", "meter", "metered", "regulation", "regulations")) {
    return mappedOrPreserve(resolver, "eventFamily", "curbside_regulation", rawValue, "other_event", "manual_event_family_curbside", "Curb/parking/loading label.");
  }
  if (hasPhrase(text, "site_visit") || hasPhrase(text, "field_visit") || hasToken(tokenSet, "fieldwork", "inspection")) {
    return mappedOrPreserve(resolver, "eventFamily", "site_visit", rawValue, "public_engagement", "manual_event_family_site_visit", "Site/field visit label.");
  }
  if (hasToken(tokenSet, "policy", "announcement", "release", "publication", "published", "initiative", "summit", "designation", "legislation") || hasPhrase(text, "action_plan") || hasPhrase(text, "report_publication") || hasPhrase(text, "report_release")) {
    return mappedOrPreserve(resolver, "eventFamily", "policy_announcement", rawValue, "other_event", "manual_event_family_policy", "Policy/publication/release label.");
  }
  if (hasToken(tokenSet, "performance", "monitoring") || hasPhrase(text, "post_implementation") || hasPhrase(text, "before_after") || hasPhrase(text, "impact_evaluation")) {
    return mappedOrPreserve(resolver, "eventFamily", "performance_monitoring", rawValue, "implementation_delivery", "manual_event_family_monitoring", "Performance/monitoring label.");
  }
  if (hasToken(tokenSet, "outreach", "engagement", "meeting", "meetings", "workshop", "workshops", "presentation", "presentations", "advisory", "committee", "community", "stakeholder", "briefing", "charrette", "hearing", "consultation", "feedback", "forum", "walkthrough", "tour", "cac") || hasPhrase(text, "open_house")) {
    return mappedOrPreserve(resolver, "eventFamily", "community_outreach", rawValue, "public_engagement", "manual_event_family_engagement", "Public engagement label.");
  }
  if ((hasPhrase(text, "service_launch") || hasPhrase(text, "service_start") || hasPhrase(text, "start_of_service") || hasPhrase(text, "revenue_service") || hasToken(tokenSet, "launch", "launched", "inauguration")) && (hasToken(tokenSet, "service", "bus", "brt", "sbs", "route") || hasPhrase(text, "select_bus_service"))) {
    return mappedOrPreserve(resolver, "eventFamily", "service_launch", rawValue, "implementation_delivery", "manual_event_family_service_launch", "Bus/service launch label.");
  }
  if (hasPhrase(text, "service_change") || hasPhrase(text, "route_change") || hasPhrase(text, "route_modification") || hasToken(tokenSet, "realignment", "reroute", "extension") || hasPhrase(text, "stop_change") || hasPhrase(text, "service_adjustment") || hasPhrase(text, "service_upgrade") || hasPhrase(text, "service_conversion") || hasPhrase(text, "stop_relocation") || hasPhrase(text, "route_renaming")) {
    return mappedOrPreserve(resolver, "eventFamily", "service_change", rawValue, "implementation_delivery", "manual_event_family_service_change", "Route/stop/service-change label.");
  }
  if (hasToken(tokenSet, "implementation", "implement", "implemented", "construction", "construct", "install", "installation", "activation", "deployment", "delivery", "built", "buildout", "rollout", "striping") || hasPhrase(text, "fare_machine") || hasPhrase(text, "bus_priority_improvement") || hasPhrase(text, "operational_project") || hasPhrase(text, "program_implementation")) {
    return mappedOrPreserve(resolver, "eventFamily", "implementation", rawValue, "implementation_delivery", "manual_event_family_implementation", "Construction/installation/implementation label.");
  }
  if (hasToken(tokenSet, "pedestrian", "sidewalk", "crosswalk", "accessibility") || hasPhrase(text, "safety_island")) {
    return mappedOrPreserve(resolver, "eventFamily", "pedestrian_safety", rawValue, "other_event", "manual_event_family_pedestrian", "Pedestrian safety label.");
  }
  if (hasToken(tokenSet, "pilot", "demonstration", "test", "trial")) {
    return mappedOrPreserve(resolver, "eventFamily", "pilot_program", rawValue, "other_event", "manual_event_family_pilot", "Pilot/test label.");
  }
  if (hasToken(tokenSet, "traffic", "congestion", "vehicle", "vehicles", "truck", "trucks") || hasPhrase(text, "operational_analysis") || hasPhrase(text, "traffic_analysis") || hasPhrase(text, "traffic_study")) {
    return mappedOrPreserve(resolver, "eventFamily", "traffic_analysis", rawValue, "planning_design", "manual_event_family_traffic", "Traffic/vehicle analysis label.");
  }
  if (hasPhrase(text, "street_design") || hasToken(tokenSet, "intersection", "roadway", "median", "geometry") || hasPhrase(text, "bus_bulb") || hasPhrase(text, "station_design") || hasPhrase(text, "stop_design") || hasPhrase(text, "transitway_design") || hasPhrase(text, "corridor_design")) {
    return mappedOrPreserve(resolver, "eventFamily", "street_design", rawValue, "planning_design", "manual_event_family_street_design", "Street/intersection/design label.");
  }
  if (hasToken(tokenSet, "survey", "poll", "count", "observation", "observations") || hasPhrase(text, "data_collection") || hasPhrase(text, "field_observation")) {
    return mappedOrPreserve(resolver, "eventFamily", "data_collection", rawValue, "planning_design", "manual_event_family_data_collection", "Survey/data-collection label.");
  }
  if (hasToken(tokenSet, "proposed", "proposal", "concept", "alternative", "alternatives", "option", "preferred", "recommendation", "recommended", "treatment", "plan", "planned") || hasPhrase(text, "design_concept") || hasPhrase(text, "project_concept") || hasPhrase(text, "transitway_concept")) {
    return mappedOrPreserve(resolver, "eventFamily", "proposed_design", rawValue, "planning_design", "manual_event_family_proposed_design", "Proposed/design/concept label.");
  }
  if (hasToken(tokenSet, "study", "planning", "screening", "scoping", "phase", "process", "initiation", "identification", "assessment", "review", "research", "evaluation") || hasPhrase(text, "transportation_study") || hasPhrase(text, "truck_study") || tokenSet.has("analysis")) {
    return mappedOrPreserve(resolver, "eventFamily", "planning", rawValue, "planning_design", "manual_event_family_planning", "Study/planning/analysis label.");
  }
  if (hasToken(tokenSet, "milestone", "decision", "timeline", "schedule", "goal", "approval", "selection") || hasPhrase(text, "next_step") || hasPhrase(text, "project_activity")) {
    return mappedOrPreserve(resolver, "eventFamily", "project_milestone", rawValue, "other_event", "manual_event_family_milestone", "Milestone/decision/schedule label.");
  }
  if (hasToken(tokenSet, "history", "historical", "past", "previous", "legacy", "former")) {
    return mappedOrPreserve(resolver, "eventFamily", "historical_reference", rawValue, "other_event", "manual_event_family_historical", "Historical/past label.");
  }
  if (hasPhrase(text, "existing_condition") || hasPhrase(text, "current_condition") || hasToken(tokenSet, "background", "baseline", "context")) {
    return unresolved("other_event", "manual_event_family_unresolved_context", "Context-only label does not identify an event family.");
  }
  return preserve("other_event", "manual_event_family_preserve_no_safe_rule", "No safe event-family rule matched.");
}

function classifyEventSubtype(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("eventSubtype", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (id: string, coarse = "other_event", why = "Manual event subtype rule.") =>
    mappedOrPreserve(resolver, "eventSubtype", id, rawValue, coarse, `manual_event_subtype_${id}`, why);
  if ((hasToken(tokenSet, "rail", "train", "lirr", "subway", "streetcar") || hasPhrase(text, "7_train") || hasPhrase(text, "7_line")) && !hasToken(tokenSet, "bus", "brt", "sbs")) return preserve("rail_non_bus", "manual_event_subtype_preserve_rail_non_bus", "Rail/non-bus subtype is preserved.");
  if (hasToken(tokenSet, "cac") || (hasToken(tokenSet, "advisory") && hasToken(tokenSet, "committee"))) return leaf("advisory_committee_meeting", "public_engagement", "CAC/advisory committee label.");
  if (hasPhrase(text, "community_board") || /^cb\d+$/i.test(rawValue)) return leaf("community_board_meeting", "public_engagement", "Community board label.");
  if (hasPhrase(text, "open_house")) return leaf("open_house", "public_engagement", "Open house label.");
  if (hasToken(tokenSet, "workshop", "workshops")) return leaf(hasToken(tokenSet, "design") ? "design_workshop" : "public_workshop", "public_engagement", "Workshop label.");
  if (hasToken(tokenSet, "briefing")) return leaf("stakeholder_meeting", "public_engagement", "Briefing/stakeholder meeting label.");
  if (hasToken(tokenSet, "presentation", "presentations")) return leaf(hasToken(tokenSet, "design") ? "design_presentation" : "public_presentation", "public_engagement", "Presentation label.");
  if (hasToken(tokenSet, "meeting", "meetings")) return leaf("stakeholder_meeting", "public_engagement", "Meeting label.");
  if (hasPhrase(text, "site_visit") || hasPhrase(text, "field_visit") || hasToken(tokenSet, "tour")) return leaf("site_visit", "public_engagement", "Site/tour label.");
  if (hasToken(tokenSet, "environmental", "nepa", "ceqr", "eas", "eis") || hasPhrase(text, "environmental_review")) return leaf("environmental_review", "other_event", "Environmental review label.");
  if (hasPhrase(text, "alternatives_analysis")) return leaf("alternatives_analysis", "planning_design", "Alternatives analysis label.");
  if (hasToken(tokenSet, "survey", "poll")) return leaf("survey", "planning_design", "Survey/poll label.");
  if (hasPhrase(text, "data_collection") || hasToken(tokenSet, "data")) return leaf("data_collection", "planning_design", "Data collection label.");
  if (hasToken(tokenSet, "launch") || hasPhrase(text, "service_start") || hasPhrase(text, "start_of_service")) return leaf("service_launch", "implementation_delivery", "Service launch/start label.");
  if (hasToken(tokenSet, "construction", "construct") || hasPhrase(text, "capital_construction")) return leaf("capital_construction", "implementation_delivery", "Construction label.");
  if (hasToken(tokenSet, "install", "installation") && hasToken(tokenSet, "camera", "cameras")) return leaf("camera_installation", "implementation_delivery", "Camera installation label.");
  if (hasToken(tokenSet, "install", "installation") && hasPhrase(text, "fare_machine")) return leaf("fare_machine_installation", "implementation_delivery", "Fare machine installation label.");
  if (hasToken(tokenSet, "install", "installation") && hasPhrase(text, "bus_bulb")) return leaf("bus_bulb_installation", "implementation_delivery", "Bus bulb installation label.");
  if (hasToken(tokenSet, "install", "installation") && hasPhrase(text, "bus_lane")) return leaf("bus_lane_installation", "implementation_delivery", "Bus lane installation label.");
  if (hasToken(tokenSet, "implementation", "implemented", "deployment", "activation")) return leaf("implementation_phase", "implementation_delivery", "Implementation/deployment label.");
  if (hasPhrase(text, "post_implementation") || hasToken(tokenSet, "monitoring", "performance")) return leaf("post_implementation_monitoring", "implementation_delivery", "Monitoring/performance label.");
  if (hasToken(tokenSet, "progress", "update", "report")) return leaf("progress_report", "other_event", "Progress/report label.");
  if (hasToken(tokenSet, "finalization", "finalize", "final", "completion", "complete")) return leaf("final_design", "planning_design", "Finalization/completion label.");
  if (hasToken(tokenSet, "design") && hasToken(tokenSet, "concept")) return leaf("concept_design", "planning_design", "Design concept label.");
  if (hasToken(tokenSet, "design") && hasToken(tokenSet, "draft")) return leaf("draft_design", "planning_design", "Draft design label.");
  if (hasToken(tokenSet, "design")) return leaf("detailed_design", "planning_design", "Design label.");
  if (hasToken(tokenSet, "corridor") && hasToken(tokenSet, "study")) return leaf("corridor_study", "planning_design", "Corridor study label.");
  if (hasToken(tokenSet, "study", "planning", "analysis", "screening", "assessment", "review")) return leaf("corridor_study", "planning_design", "Study/planning/analysis label.");
  if (hasPhrase(text, "bus_lane")) return leaf("bus_lane_installation", "implementation_delivery", "Bus lane label.");
  if (hasPhrase(text, "bus_stop") || hasToken(tokenSet, "station", "stations", "stop", "stops")) return leaf("station_design", "planning_design", "Stop/station label.");
  if (hasToken(tokenSet, "signal", "signals", "tsp")) return leaf("signal_timing", "other_event", "Signal/TSP label.");
  if (hasToken(tokenSet, "curb", "curbside", "parking", "loading")) return leaf("curb_management", "other_event", "Curb/parking label.");
  return preserve(inferEventCoarseFamily(rawValue), "manual_event_subtype_preserve_no_safe_rule", "No safe event-subtype rule matched.");
}

function classifyEventTreatmentFamily(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("eventTreatmentFamily", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (id: string, coarse = "other_treatment", why = "Manual treatment rule.") =>
    mappedOrPreserve(resolver, "eventTreatmentFamily", id, rawValue, coarse, `manual_event_treatment_${id}`, why);
  if ((hasToken(tokenSet, "rail", "train", "lirr", "subway", "streetcar") || hasPhrase(text, "7_train") || hasPhrase(text, "7_line")) && !hasToken(tokenSet, "bus", "brt", "sbs")) return preserve("rail_non_bus", "manual_event_treatment_preserve_rail_non_bus", "Rail/non-bus treatment is preserved.");
  if (hasPhrase(text, "queue_jump")) return leaf("bus_queue_jump", "signal_priority", "Queue jump label.");
  if (hasPhrase(text, "transit_signal_priority") || tokenSet.has("tsp")) return leaf("transit_signal_priority", "signal_priority", "TSP label.");
  if (hasToken(tokenSet, "signal", "signals")) return leaf("signal_timing_adjustment", "signal_priority", "Signal timing label.");
  if (hasPhrase(text, "off_board") || hasPhrase(text, "fare_collection") || hasPhrase(text, "fare_machine") || hasToken(tokenSet, "fare", "prepayment", "pre", "proof")) return leaf("fare_collection", "fare_collection", "Fare collection label.");
  if (hasPhrase(text, "center_running")) return leaf("center_running_bus_lane", "bus_lane", "Center-running bus lane label.");
  if (hasPhrase(text, "offset_bus_lane")) return leaf("offset_bus_lane", "bus_lane", "Offset bus lane label.");
  if (hasPhrase(text, "curbside_bus_lane")) return leaf("curbside_bus_lane", "bus_lane", "Curbside bus lane label.");
  if (hasPhrase(text, "bus_lane") || hasPhrase(text, "busway") || hasPhrase(text, "bus_only_lane") || hasPhrase(text, "transit_lane")) return leaf("bus_lane", "bus_lane", "Bus lane/busway label.");
  if (hasPhrase(text, "bus_bulb") || hasPhrase(text, "bus_boarder")) return leaf("bus_bulb", "stop_station_amenity", "Bus bulb/boarder label.");
  if (hasToken(tokenSet, "shelter", "bench", "amenity", "amenities")) return leaf("passenger_amenity", "stop_station_amenity", "Passenger amenity label.");
  if (hasToken(tokenSet, "signage", "sign", "wayfinding", "information")) return leaf("passenger_information", "stop_station_amenity", "Passenger information/signage label.");
  if (hasToken(tokenSet, "station", "stations")) return leaf(hasToken(tokenSet, "install", "installation") ? "station_installation" : "station_siting", "stop_station_amenity", "Station label.");
  if (hasPhrase(text, "stop_consolidation")) return leaf("stop_consolidation", "stop_station_amenity", "Stop consolidation label.");
  if (hasToken(tokenSet, "stop", "stops")) return leaf("station_siting", "stop_station_amenity", "Stop/station siting label.");
  if (hasToken(tokenSet, "loading")) return leaf("loading_zone", "curb_parking_loading", "Loading-zone label.");
  if (hasToken(tokenSet, "parking")) return leaf("parking_regulation_change", "curb_parking_loading", "Parking regulation label.");
  if (hasToken(tokenSet, "curb", "curbside")) return leaf("curb_extension", "curb_parking_loading", "Curb label.");
  if (hasPhrase(text, "pedestrian_refuge") || hasPhrase(text, "safety_island")) return leaf("pedestrian_refuge_island", "pedestrian_safety", "Pedestrian refuge/island label.");
  if (hasToken(tokenSet, "pedestrian", "sidewalk", "crosswalk", "safety")) return leaf("pedestrian_improvements", "pedestrian_safety", "Pedestrian/safety label.");
  if (hasPhrase(text, "turn_restriction")) return leaf("turn_restriction", "other_treatment", "Turn restriction label.");
  if (hasToken(tokenSet, "brt") && hasToken(tokenSet, "outreach")) return leaf("brt_outreach", "outreach_engagement", "BRT outreach label.");
  if (hasToken(tokenSet, "outreach", "engagement", "meeting", "workshop", "presentation", "open", "house")) return leaf("public_outreach", "outreach_engagement", "Public outreach label.");
  if (hasPhrase(text, "select_bus_service") || tokenSet.has("sbs")) return leaf(hasToken(tokenSet, "planning", "plan") ? "select_bus_service_planning" : "select_bus_service", "service_planning", "SBS/service label.");
  if (hasToken(tokenSet, "brt")) return leaf("brt_planning", "capital_delivery", "BRT planning label.");
  if (hasPhrase(text, "bus_priority")) return leaf("bus_priority_planning", "capital_delivery", "Bus-priority planning label.");
  if (hasToken(tokenSet, "design", "engineering", "planning", "plan")) return leaf("preliminary_corridor_design", "capital_delivery", "Design/planning label.");
  return preserve(inferTreatmentCoarseFamily(rawValue), "manual_event_treatment_preserve_no_safe_rule", "No safe treatment-family rule matched.");
}

function classifyMetricFamily(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("metricFamily", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_metric", why = "Manual metric-family rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "metricFamily",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_metric_family_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "speed", "mph")) {
    if (hasToken(tokenSet, "increase", "improvement", "faster")) {
      return leaf(["average_speed_increase_mph", "bus_speed_improvement_percentage"], "bus_performance", "Speed-improvement label.");
    }
    return leaf("bus_speed_mph", "bus_performance", "Speed/MPH label.");
  }
  if (hasPhrase(text, "travel_time") || hasPhrase(text, "running_time") || hasToken(tokenSet, "runtime", "headway")) {
    return leaf(["bus_travel_time_minutes", "bus_running_time_minutes", "bus_arrival_minutes"], "bus_performance", "Travel/run/headway time label.");
  }
  if (hasToken(tokenSet, "ridership", "riders", "passengers", "customers", "boardings", "alightings")) {
    if (hasToken(tokenSet, "annual")) return leaf("annual_route_ridership", "ridership", "Annual ridership label.");
    if (hasToken(tokenSet, "daily")) return leaf("daily_bus_riders_count", "ridership", "Daily rider/passenger label.");
    return leaf(["average_weekday_ridership", "daily_bus_riders_count"], "ridership", "Ridership/passenger label.");
  }
  if (hasToken(tokenSet, "bunching", "bunched", "late", "schedule", "adherence")) {
    return leaf(["bus_bunching", "bus_bunching_and_schedule_adherence"], "bus_reliability", "Bunching/schedule adherence label.");
  }
  if (hasToken(tokenSet, "crowding", "load", "loads")) return leaf("bus_crowding", "bus_reliability", "Crowding/load label.");
  if (hasToken(tokenSet, "fatality", "fatalities")) return leaf("fatalities_count", "safety", "Fatality count label.");
  if (hasToken(tokenSet, "injury", "injuries")) return leaf("pedestrian_injuries_count", "safety", "Injury count label.");
  if (hasToken(tokenSet, "crash", "crashes", "collision", "collisions", "ksi")) {
    return leaf(["crash_count", "pedestrian_ksi_count"], "safety", "Crash/KSI label.");
  }
  if (hasPhrase(text, "level_of_service") || tokenSet.has("los")) {
    return leaf(["level_of_service_delay_thresholds", "intersection_delay_seconds"], "traffic_operations", "Level-of-service/delay label.");
  }
  if (hasToken(tokenSet, "delay", "delays")) return leaf("intersection_delay_seconds", "traffic_operations", "Delay label.");
  if (hasToken(tokenSet, "width", "dimension", "dimensions", "feet", "ft")) {
    if (hasToken(tokenSet, "roadway", "street")) return leaf("existing_total_roadway_width", "street_geometry", "Roadway/street width label.");
    if (hasToken(tokenSet, "parking")) return leaf("parking_lane_width_feet", "street_geometry", "Parking lane width label.");
    return leaf("bus_lane_width_feet", "street_geometry", "Lane-width label.");
  }
  if (hasToken(tokenSet, "length", "distance", "miles")) {
    if (hasPhrase(text, "bus_lane")) return leaf("bus_lane_length_miles", "street_geometry", "Bus lane length label.");
    return leaf("corridor_length_miles", "street_geometry", "Corridor length/distance label.");
  }
  if (hasToken(tokenSet, "parking", "metered")) {
    if (hasToken(tokenSet, "removed", "removal")) return leaf("parking_spaces_removed_count", "curb_parking", "Parking removal/count label.");
    return leaf("parking_occupancy_rate_metered_blocks", "curb_parking", "Parking/curb metric label.");
  }
  if (hasToken(tokenSet, "cost", "costs", "funding", "budget", "dollar", "dollars")) {
    return leaf(["overall_project_cost", "operating_costs_per_train_hour"], "cost_funding", "Cost/funding label.");
  }
  if (hasToken(tokenSet, "population", "household", "households", "income", "demographic", "residents")) {
    return leaf(["census_population", "median_annual_income"], "demographics", "Demographic label.");
  }
  if (hasPhrase(text, "mode_share") || hasToken(tokenSet, "modal")) {
    if (hasPhrase(text, "downtown_flushing")) {
      if (tokenSet.has("bus")) return leaf("bus_modal_share_to_downtown_flushing", "mode_share", "Downtown Flushing bus mode-share label.");
      if (tokenSet.has("car") || tokenSet.has("drive")) return leaf("car_modal_share_to_downtown_flushing", "mode_share", "Downtown Flushing car mode-share label.");
      if (tokenSet.has("subway")) return leaf("subway_modal_share_to_downtown_flushing", "mode_share", "Downtown Flushing subway mode-share label.");
      if (hasToken(tokenSet, "walk", "walked", "pedestrian")) return leaf("walked_modal_share_to_downtown_flushing", "mode_share", "Downtown Flushing walk mode-share label.");
    }
    if (tokenSet.has("bus") || tokenSet.has("nyct")) return leaf("bus_percentage_modal_share", "mode_share", "Bus mode-share label.");
    if (tokenSet.has("subway")) return leaf("mode_share_subway_percentage", "mode_share", "Subway mode-share label.");
    if (hasToken(tokenSet, "walk", "walked", "pedestrian")) return leaf("mode_share_walked_from_home_percentage", "mode_share", "Walk mode-share label.");
    if (hasToken(tokenSet, "transit", "public")) return leaf("transit_commute_share_percentage", "mode_share", "Transit mode-share label.");
    return preserve("mode_share", "manual_metric_family_preserve_generic_mode_share", "Generic mode-share label lacks a safe canonical leaf.");
  }
  if (hasToken(tokenSet, "share", "percentage", "percent") || rawValue.includes("%")) {
    return preserve("ratio", "manual_metric_family_preserve_generic_percentage", "Generic percentage/share label lacks a safe canonical leaf.");
  }
  if (hasToken(tokenSet, "survey", "comment", "comments", "outreach", "feedback")) {
    return leaf(["outreach_comment_count", "business_survey_delivery_zone_preference"], "engagement", "Survey/outreach label.");
  }
  if (hasToken(tokenSet, "stop", "stops", "station", "stations")) {
    if (hasPhrase(text, "stops_away")) return leaf("bus_stops_away", "bus_service", "Stops-away label.");
    return leaf("bus_stop_count", "bus_service", "Stop/station count label.");
  }
  return preserve(inferMetricCoarseFamily(rawValue), "manual_metric_family_preserve_no_safe_rule", "No safe metric-family rule matched.");
}

function classifyMetricSubjectFamily(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("metricSubjectFamily", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_metric_subject", why = "Manual metric-subject rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "metricSubjectFamily",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_metric_subject_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "ridership", "riders", "passengers", "customers", "boardings")) {
    return leaf(["ridership", "corridor_bus_ridership", "route_specific_ridership"], "ridership", "Ridership/passenger subject.");
  }
  if (hasToken(tokenSet, "speed", "mph")) return leaf(["bus_speed", "route_specific_bus_speed", "traffic_speed"], "bus_performance", "Speed subject.");
  if (hasPhrase(text, "travel_time") || hasPhrase(text, "running_time")) {
    return leaf(["bus_travel_time", "generic_travel_time", "route_specific_bus_travel_time"], "bus_performance", "Travel/running-time subject.");
  }
  if (hasToken(tokenSet, "traffic", "vehicle", "vehicles", "volume")) {
    return leaf(["general_traffic_volume", "general_traffic_delay", "traffic_flow_qualitative"], "traffic_operations", "Traffic/vehicle subject.");
  }
  if (hasToken(tokenSet, "parking")) {
    return leaf(["parking_spaces", "on_street_parking_spaces", "metered_parking_regulation"], "curb_parking", "Parking subject.");
  }
  if (hasToken(tokenSet, "curb", "curbside")) return leaf(["curb_regulations", "curb_occupancy"], "curb_parking", "Curb subject.");
  if (hasToken(tokenSet, "loading", "delivery", "deliveries")) return leaf(["commercial_loading_zones", "deliveries"], "curb_parking", "Loading/delivery subject.");
  if (hasToken(tokenSet, "bunching", "bunched")) return leaf("bus_bunching_metric", "bus_reliability", "Bunching subject.");
  if (hasToken(tokenSet, "reliability", "reliable")) return leaf("bus_service", "bus_reliability", "Reliability/service subject.");
  if (hasToken(tokenSet, "crash", "crashes", "ksi", "injury", "injuries", "fatality", "fatalities")) {
    return leaf(["crashes_generic", "crash_count_by_intersection", "ksi_count"], "safety", "Crash/safety subject.");
  }
  if (hasToken(tokenSet, "lane", "lanes") && tokenSet.has("bus")) return leaf("bus_lane_infrastructure", "bus_priority", "Bus-lane subject.");
  if (hasToken(tokenSet, "route", "routes")) return leaf(["bus_routes", "route_specific_measure"], "route_service", "Route subject.");
  if (hasToken(tokenSet, "corridor")) return leaf(["corridor_geography", "corridor_bus_ridership"], "geography", "Corridor subject.");
  if (hasToken(tokenSet, "business", "businesses", "merchant", "merchants")) return leaf("businesses", "business", "Business subject.");
  if (hasToken(tokenSet, "survey", "respondents")) return leaf(["survey_respondents", "survey_sample"], "engagement", "Survey subject.");
  if (hasToken(tokenSet, "population", "residents", "households", "workers")) {
    return leaf(["corridor_residents", "workers_in_corridor", "population_within_walk_of_corridor"], "demographics", "Demographic subject.");
  }
  if (hasToken(tokenSet, "cyclist", "cyclists", "bicyclist", "bicyclists")) return leaf("bicyclists", "safety", "Cyclist subject.");
  return preserve(inferMetricSubjectCoarseFamily(rawValue), "manual_metric_subject_preserve_no_safe_rule", "No safe metric-subject rule matched.");
}

function classifyMetricUnit(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("metricUnit", rawValue);
  if (existing !== null) return existing;
  const normalized = normalizeTokenKey(rawValue);
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_unit", why = "Manual metric-unit rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "metricUnit",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_metric_unit_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (normalized === "mph" || hasToken(tokenSet, "mph")) return leaf("mph", "speed", "MPH unit.");
  if (hasToken(tokenSet, "vehicle", "vehicles")) return leaf(["vehicles_per_hour", "vehicles", "vehicles_per_day"], "vehicles", "Vehicle unit.");
  if (hasToken(tokenSet, "bus", "buses")) return leaf(["buses_per_hour", "buses", "buses_per_day"], "vehicles", "Bus unit.");
  if (hasToken(tokenSet, "minute", "minutes", "min", "mins")) return leaf("minutes", "time", "Minute unit.");
  if (hasToken(tokenSet, "second", "seconds", "sec", "secs")) return leaf("seconds", "time", "Second unit.");
  if (hasToken(tokenSet, "hour", "hours")) return leaf("hours", "time", "Hour unit.");
  if (hasToken(tokenSet, "day", "days")) return leaf(["days", "calendar_days"], "time", "Day unit.");
  if (hasToken(tokenSet, "rider", "riders")) return leaf(["riders", "riders_per_day", "riders_per_weekday"], "people", "Rider unit.");
  if (hasToken(tokenSet, "passenger", "passengers", "customer", "customers")) {
    return leaf(["passengers", "passengers_per_day", "customers_per_day"], "people", "Passenger/customer unit.");
  }
  if (hasToken(tokenSet, "route", "routes")) return leaf("routes", "service", "Route count unit.");
  if (hasToken(tokenSet, "percent", "percentage", "proportion", "share") || rawValue.includes("%")) return leaf("percent", "ratio", "Percent/share unit.");
  if (hasToken(tokenSet, "feet", "foot", "ft")) return leaf("feet", "distance", "Feet unit.");
  if (hasToken(tokenSet, "mile", "miles")) return leaf("miles", "distance", "Mile unit.");
  if (hasToken(tokenSet, "dollar", "dollars") || rawValue.includes("$")) return leaf(["dollars", "dollars_per_mile"], "money", "Dollar unit.");
  if (hasToken(tokenSet, "crash", "crashes")) return leaf("crashes", "safety", "Crash count unit.");
  if (hasToken(tokenSet, "injury", "injuries")) return leaf("injuries", "safety", "Injury count unit.");
  if (hasToken(tokenSet, "fatality", "fatalities")) return leaf("fatalities", "safety", "Fatality count unit.");
  if (hasToken(tokenSet, "summons", "summonses", "ticket", "tickets")) return leaf(["summonses", "violations"], "enforcement", "Summons/violation unit.");
  if (hasToken(tokenSet, "cyclist", "cyclists", "bicyclist", "bicyclists")) return leaf(["cyclists", "bicyclists"], "people", "Cyclist unit.");
  if (hasPhrase(text, "square_feet")) return leaf(["square_feet", "square_miles"], "area", "Area unit.");
  if (hasToken(tokenSet, "vote", "votes")) return leaf("votes", "engagement", "Vote unit.");
  return preserve(inferUnitCoarseFamily(rawValue), "manual_metric_unit_preserve_no_safe_rule", "No safe metric-unit rule matched.");
}

function classifyEntityKind(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("entityKind", rawValue);
  if (existing !== null) return existing;
  const { tokenSet } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_entity", why = "Manual entity-kind rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "entityKind",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_entity_kind_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "agency", "dot", "mta")) return leaf("agency", "organization", "Agency kind.");
  if (hasToken(tokenSet, "organization", "company", "business", "bid")) return leaf(["organization", "business", "business_improvement_district"], "organization", "Organization/business kind.");
  if (hasToken(tokenSet, "person", "contact", "speaker", "presenter")) return leaf("person", "person", "Person/contact kind.");
  if (hasToken(tokenSet, "community") && tokenSet.has("board")) return leaf("community_board", "organization", "Community board kind.");
  if (hasToken(tokenSet, "committee", "cac")) return leaf("committee", "organization", "Committee kind.");
  if (hasToken(tokenSet, "route", "routes")) {
    if (hasToken(tokenSet, "grouping", "inventory", "collection", "set")) return leaf("route_collection", "transit", "Route collection kind.");
    return leaf("bus_route", "transit", "Bus route kind.");
  }
  if (hasToken(tokenSet, "service", "sbs", "select")) return leaf("transit_service", "transit", "Transit service kind.");
  if (hasToken(tokenSet, "stop", "stops")) return leaf("bus_stop", "transit", "Bus stop kind.");
  if (hasToken(tokenSet, "station", "terminal")) return leaf("station", "transit", "Station/terminal kind.");
  if (hasToken(tokenSet, "street", "avenue", "road", "boulevard", "highway")) return leaf(["street", "highway"], "geography", "Street/highway kind.");
  if (hasToken(tokenSet, "intersection")) return leaf("intersection", "geography", "Intersection kind.");
  if (hasToken(tokenSet, "corridor")) return leaf("corridor", "geography", "Corridor kind.");
  if (hasToken(tokenSet, "destination", "venue", "landmark", "location")) return leaf(["location", "landmark"], "geography", "Location/landmark kind.");
  if (hasToken(tokenSet, "neighborhood", "borough", "city", "county", "state")) return leaf(["neighborhood", "borough", "city", "county", "state"], "geography", "Administrative geography kind.");
  if (hasToken(tokenSet, "study")) return leaf("study", "project", "Study kind.");
  if (hasToken(tokenSet, "project", "program")) return leaf(["project", "program"], "project", "Project/program kind.");
  if (hasToken(tokenSet, "alternative", "option", "scenario")) return leaf("proposal_alternative", "project", "Alternative/option kind.");
  if (hasToken(tokenSet, "treatment", "feature", "infrastructure", "signage", "lane", "island")) {
    return leaf(["treatment_component", "design_element", "infrastructure_type"], "treatment", "Treatment/design element kind.");
  }
  if (hasToken(tokenSet, "parking", "curb")) return leaf("parking_regulation_type", "curb_parking", "Parking/curb kind.");
  return preserve(inferEntityCoarseFamily(rawValue), "manual_entity_kind_preserve_no_safe_rule", "No safe entity-kind rule matched.");
}

function classifyEntityRole(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("entityRole", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_entity_role", why = "Manual entity-role rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "entityRole",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_entity_role_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "lead") && hasToken(tokenSet, "agency")) return leaf("lead_agency", "agency_role", "Lead agency role.");
  if (hasToken(tokenSet, "partner", "co", "presenter", "presenting")) return leaf(["partner_agency", "presenting_agency"], "agency_role", "Partner/presenter role.");
  if (hasToken(tokenSet, "contact")) return leaf(["outreach_contact", "outreach_agent"], "engagement_role", "Outreach/contact role.");
  if (hasToken(tokenSet, "participant", "member", "stakeholder")) return leaf(["meeting_participant", "stakeholder"], "engagement_role", "Participant/stakeholder role.");
  if (hasToken(tokenSet, "committee") && hasToken(tokenSet, "member")) return leaf(["committee_member_category", "meeting_participant"], "engagement_role", "Committee member role.");
  if (hasToken(tokenSet, "title") || hasPhrase(text, "study_name")) return leaf(["source_study", "project_name"], "document_role", "Study/title role.");
  if (hasToken(tokenSet, "project") && hasToken(tokenSet, "name")) return leaf("project_name", "project_role", "Project-name role.");
  if (hasToken(tokenSet, "corridor")) {
    if (hasToken(tokenSet, "endpoint")) return leaf(["corridor_endpoint", "project_boundary"], "geography_role", "Corridor endpoint role.");
    return leaf(["project_corridor", "subject_corridor", "study_corridor"], "geography_role", "Corridor role.");
  }
  if (hasToken(tokenSet, "boundary")) return leaf(["project_boundary", "segment_boundary", "origin_destination_study_boundary"], "geography_role", "Boundary role.");
  if (hasToken(tokenSet, "street")) return leaf(["intersecting_street", "adjacent_street", "map_label"], "geography_role", "Street/map role.");
  if (hasToken(tokenSet, "landmark")) return leaf(["surrounding_landmark", "boundary_landmark"], "geography_role", "Landmark role.");
  if (hasToken(tokenSet, "map", "label", "legend")) return leaf(["map_label", "map_legend_item"], "visual_role", "Map label/legend role.");
  if (hasToken(tokenSet, "photo", "photograph", "caption")) return leaf(["subject_of_photo", "photo_location_label"], "visual_role", "Photo/caption role.");
  if (hasToken(tokenSet, "route")) return leaf(["subject_route", "featured_route", "existing_route"], "transit_role", "Route role.");
  if (hasToken(tokenSet, "service")) return leaf(["subject_service", "featured_service", "existing_service_reference"], "transit_role", "Service role.");
  if (hasToken(tokenSet, "station")) return leaf(["proposed_station", "station_design_element"], "transit_role", "Station role.");
  if (hasToken(tokenSet, "stop")) return leaf(["proposed_stop", "bus_stop_location", "existing_bus_stop"], "transit_role", "Stop role.");
  if (hasToken(tokenSet, "treatment")) return leaf(["proposed_treatment", "treatment_location"], "treatment_role", "Treatment role.");
  if (hasToken(tokenSet, "design", "feature", "element")) return leaf(["design_element_name", "feature_category", "existing_feature"], "treatment_role", "Design/feature role.");
  if (hasToken(tokenSet, "parking")) return leaf("existing_parking_regulation", "curb_role", "Parking role.");
  if (hasToken(tokenSet, "curb")) return leaf("curb_allocation", "curb_role", "Curb role.");
  return preserve(inferEntityCoarseFamily(rawValue), "manual_entity_role_preserve_no_safe_rule", "No safe entity-role rule matched.");
}

function classifyClaimKind(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("claimKind", rawValue);
  if (existing !== null) return existing;
  const { tokenSet } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_claim", why = "Manual claim-kind rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "claimKind",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_claim_kind_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "survey", "opinion", "sentiment", "feedback", "support", "concern")) {
    return leaf(["survey_finding", "public_feedback", "outreach_summary"], "engagement_claim", "Survey/public-feedback claim.");
  }
  if (hasToken(tokenSet, "schedule", "timeline", "status", "scope", "program")) return leaf("project_scope", "project_claim", "Project schedule/status/scope claim.");
  if (hasToken(tokenSet, "impact", "performance", "traffic", "outcome")) return leaf(["performance_observation", "key_finding"], "finding_claim", "Impact/performance claim.");
  if (hasToken(tokenSet, "benefit", "advantage")) return leaf("proposed_benefit", "proposal_claim", "Benefit/advantage claim.");
  if (hasToken(tokenSet, "design", "feature", "specification", "description")) return leaf("design_description", "design_claim", "Design/feature claim.");
  if (hasToken(tokenSet, "goal", "objective")) return leaf("project_goal", "project_claim", "Goal/objective claim.");
  if (hasToken(tokenSet, "problem", "need")) return leaf("problem_statement", "problem_claim", "Problem/need claim.");
  if (hasToken(tokenSet, "method", "methodology")) return leaf("methodology_note", "methodology_claim", "Methodology claim.");
  if (hasToken(tokenSet, "existing", "baseline")) return leaf("existing_condition", "baseline_claim", "Existing/baseline claim.");
  if (hasToken(tokenSet, "treatment")) return leaf("proposed_treatment", "proposal_claim", "Treatment claim.");
  return preserve("other_claim", "manual_claim_kind_preserve_no_safe_rule", "No safe claim-kind rule matched.");
}

function classifyClaimResearchUseTag(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("claimResearchUseTag", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_research_use", why = "Manual research-use rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "claimResearchUseTag",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_research_use_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "objective", "scope", "program")) return leaf("project_scope", "project", "Project objective/scope tag.");
  if (hasPhrase(text, "bus_priority") || hasToken(tokenSet, "priority")) return leaf("bus_priority", "bus_priority", "Bus-priority tag.");
  if (hasPhrase(text, "bus_lane") || hasToken(tokenSet, "lane")) return leaf(["bus_lane_design", "bus_lane_justification"], "bus_priority", "Bus-lane tag.");
  if (hasToken(tokenSet, "community", "sentiment", "support", "concern", "merchant", "public")) return leaf("community_engagement", "engagement", "Community/public tag.");
  if (hasToken(tokenSet, "curb", "parking", "loading", "delivery")) return leaf(["curb_management", "delivery_loading"], "curb_parking", "Curb/loading tag.");
  if (hasToken(tokenSet, "route", "inventory")) return leaf(["route_identification", "service_network_context"], "route_service", "Route/service tag.");
  if (hasToken(tokenSet, "service")) return leaf("service_network_context", "route_service", "Service context tag.");
  if (hasPhrase(text, "travel_time") || hasToken(tokenSet, "speed", "performance", "baseline")) {
    return leaf(["performance_issue", "baseline_condition", "bus_speed"], "performance", "Performance/baseline tag.");
  }
  if (hasToken(tokenSet, "traffic", "impact", "flow")) return leaf("projected_traffic_impact", "traffic", "Traffic impact tag.");
  if (hasToken(tokenSet, "timeline", "schedule", "status")) return leaf("project_timeline", "project", "Timeline/status tag.");
  if (hasToken(tokenSet, "design", "element")) return leaf(["bus_lane_design", "station_design", "transitway_design"], "design", "Design tag.");
  if (hasToken(tokenSet, "mode", "share")) return leaf("mode_share", "mode_share", "Mode-share tag.");
  if (hasToken(tokenSet, "pedestrian", "safety", "crash")) return leaf(["pedestrian_safety", "safety_compliance"], "safety", "Safety tag.");
  if (hasToken(tokenSet, "survey")) return leaf("survey_evidence", "engagement", "Survey tag.");
  if (hasToken(tokenSet, "data", "quality")) return leaf("data_quality", "data_quality", "Data-quality tag.");
  return preserve("other_research_use", "manual_research_use_preserve_no_safe_rule", "No safe research-use rule matched.");
}

function classifyContextKind(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("contextKind", rawValue);
  if (existing !== null) return existing;
  const { tokenSet } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_context", why = "Manual context-kind rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "contextKind",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_context_kind_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "section", "introduction", "divider", "heading")) return leaf(["section_context", "section_heading"], "document_context", "Section/heading context.");
  if (hasToken(tokenSet, "map", "diagram")) return leaf(["map_context", "map_diagram", "map_visual"], "visual_context", "Map/diagram context.");
  if (hasToken(tokenSet, "photo", "photograph", "image", "caption")) return leaf("image_caption", "visual_context", "Image/caption context.");
  if (hasToken(tokenSet, "data", "source", "attribution")) return leaf(["data_source", "data_quality_context"], "data_context", "Data/source context.");
  if (hasToken(tokenSet, "design", "concept", "proposal", "alternative")) return leaf("design_context", "design_context", "Design/proposal context.");
  if (hasToken(tokenSet, "analysis", "scenario", "comparison")) return leaf(["analysis_context", "comparison_context"], "analysis_context", "Analysis/comparison context.");
  if (hasToken(tokenSet, "scope", "project")) return leaf(["project_scope", "project_context"], "project_context", "Project/scope context.");
  if (hasToken(tokenSet, "landmark", "geography", "area", "segment", "boundary")) return leaf(["geographic_context", "geographic_boundary"], "geography_context", "Geographic context.");
  if (hasToken(tokenSet, "problem")) return leaf(["existing_condition", "operational_context"], "problem_context", "Problem/existing context.");
  if (hasToken(tokenSet, "demographic", "equity", "population")) return leaf("demographics_equity_context", "demographics_context", "Demographic/equity context.");
  if (hasToken(tokenSet, "street", "geometry", "roadway")) return leaf("street_geometry_context", "street_context", "Street geometry context.");
  if (hasToken(tokenSet, "survey")) return leaf("survey_context", "engagement_context", "Survey context.");
  if (hasToken(tokenSet, "meeting", "workshop")) return leaf("meeting_context", "engagement_context", "Meeting/workshop context.");
  if (hasToken(tokenSet, "timeline", "schedule", "phase")) return leaf(["project_timeline", "project_phase"], "project_context", "Timeline/phase context.");
  return preserve("other_context", "manual_context_kind_preserve_no_safe_rule", "No safe context-kind rule matched.");
}

function classifyQuestionKind(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("questionKind", rawValue);
  if (existing !== null) return existing;
  const { tokenSet } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_question", why = "Manual question-kind rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "questionKind",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_question_kind_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "diagram", "visual", "map")) return leaf(["map_content_clarification", "map_detail"], "visual_question", "Map/visual question.");
  if (hasToken(tokenSet, "clarification", "ambiguity")) return leaf("clarification", "clarification", "Clarification question.");
  if (hasToken(tokenSet, "project", "scope")) return leaf("project_scope", "project_question", "Project/scope question.");
  if (hasToken(tokenSet, "metric", "quantitative", "number", "data")) return leaf(["missing_metric", "quantitative_clarification", "data_gap"], "data_question", "Metric/data question.");
  if (hasToken(tokenSet, "relationship", "route")) return leaf(["route_relationship", "route_identification", "route_clarification"], "route_question", "Route/relationship question.");
  if (hasToken(tokenSet, "source")) return leaf(["data_provenance", "reference_clarification"], "source_question", "Source/provenance question.");
  if (hasToken(tokenSet, "feature", "design")) return leaf(["design_detail", "design_clarification"], "design_question", "Feature/design question.");
  if (hasToken(tokenSet, "implementation", "status", "verification", "outcome")) return leaf("implementation_status", "implementation_question", "Implementation/status question.");
  if (hasToken(tokenSet, "treatment")) return leaf("treatment_detail", "treatment_question", "Treatment-detail question.");
  if (hasToken(tokenSet, "spatial", "location", "geography")) return leaf("spatial_detail", "spatial_question", "Spatial-detail question.");
  if (hasToken(tokenSet, "temporal", "date", "time")) return leaf("temporal_clarification", "temporal_question", "Temporal question.");
  if (hasToken(tokenSet, "content", "gap", "missing")) return leaf("content_gap", "content_question", "Content/gap question.");
  return preserve("other_question", "manual_question_kind_preserve_no_safe_rule", "No safe question-kind rule matched.");
}

function classifyTableKind(rawValue: string, resolver: LeafResolver): ManualDecision {
  const existing = resolver.existingAliasDecision("tableKind", rawValue);
  if (existing !== null) return existing;
  const { tokenSet, text } = tokens(rawValue);
  const leaf = (ids: string | string[], coarse = "other_table", why = "Manual table-kind rule.") =>
    mappedFirstOrPreserve(
      resolver,
      "tableKind",
      Array.isArray(ids) ? ids : [ids],
      rawValue,
      coarse,
      `manual_table_kind_${Array.isArray(ids) ? ids[0] : ids}`,
      why,
    );

  if (hasToken(tokenSet, "schedule", "timeline")) return leaf("project_timeline", "project_table", "Schedule/timeline table.");
  if (hasToken(tokenSet, "survey")) return leaf("survey_response_table", "engagement_table", "Survey results table.");
  if (hasToken(tokenSet, "mode", "share", "percentage", "breakdown")) return leaf(["mode_share_table", "time_allocation_breakdown"], "breakdown_table", "Share/breakdown table.");
  if (hasToken(tokenSet, "speed")) return leaf("speed_table", "performance_table", "Speed table.");
  if (hasPhrase(text, "travel_time")) return leaf("travel_time_table", "performance_table", "Travel-time table.");
  if (hasToken(tokenSet, "width", "dimension", "cross", "section", "lane")) return leaf(["cross_section", "infrastructure_inventory"], "street_geometry_table", "Dimension/cross-section table.");
  if (hasToken(tokenSet, "curb", "loading", "delivery")) return leaf("curb_activity_data", "curb_table", "Curb/loading table.");
  if (hasToken(tokenSet, "parking")) return leaf("parking_impact_table", "curb_table", "Parking table.");
  if (hasToken(tokenSet, "route")) return leaf("route_inventory", "route_table", "Route inventory table.");
  if (hasToken(tokenSet, "ridership", "riders", "passengers")) return leaf("ridership_table", "ridership_table", "Ridership table.");
  if (hasToken(tokenSet, "crash", "injury", "safety")) return leaf(["crash_count_by_movement", "injury_summary"], "safety_table", "Crash/safety table.");
  if (hasToken(tokenSet, "intersection")) return leaf(["intersection_inventory", "intersection_treatment_matrix"], "street_geometry_table", "Intersection table.");
  if (hasToken(tokenSet, "treatment", "design")) return leaf("design_treatment_segment_table", "design_table", "Design/treatment table.");
  if (hasToken(tokenSet, "score", "scoring", "ranking", "rank")) return leaf(["scoring_matrix", "ranking_table"], "ranking_table", "Scoring/ranking table.");
  if (hasToken(tokenSet, "stop", "station")) return leaf("stop_list", "transit_table", "Stop/station table.");
  return preserve("other_table", "manual_table_kind_preserve_no_safe_rule", "No safe table-kind rule matched.");
}

function inferEventCoarseFamily(rawValue: string): string {
  const { tokenSet, text } = tokens(rawValue);
  if (hasToken(tokenSet, "meeting", "workshop", "outreach", "engagement", "presentation", "committee", "stakeholder") || hasPhrase(text, "open_house")) return "public_engagement";
  if (hasToken(tokenSet, "implementation", "construction", "install", "launch", "service")) return "implementation_delivery";
  if (hasToken(tokenSet, "design", "planning", "study", "analysis", "proposal", "draft")) return "planning_design";
  if (hasToken(tokenSet, "rail", "train", "subway", "lirr")) return "rail_non_bus";
  return "other_event";
}

function inferTreatmentCoarseFamily(rawValue: string): string {
  const { tokenSet, text } = tokens(rawValue);
  if (hasPhrase(text, "queue_jump") || hasToken(tokenSet, "signal", "tsp")) return "signal_priority";
  if (hasPhrase(text, "bus_lane") || hasPhrase(text, "busway") || hasPhrase(text, "transit_lane")) return "bus_lane";
  if (hasToken(tokenSet, "fare", "prepayment")) return "fare_collection";
  if (hasToken(tokenSet, "station", "stop", "shelter", "amenity", "signage")) return "stop_station_amenity";
  if (hasToken(tokenSet, "curb", "parking", "loading")) return "curb_parking_loading";
  if (hasToken(tokenSet, "pedestrian", "sidewalk", "crosswalk", "safety")) return "pedestrian_safety";
  if (hasToken(tokenSet, "outreach", "meeting", "workshop", "presentation")) return "outreach_engagement";
  if (hasToken(tokenSet, "service", "route", "sbs")) return "service_planning";
  if (hasToken(tokenSet, "rail", "train", "subway", "lirr")) return "rail_non_bus";
  if (hasToken(tokenSet, "design", "construction", "implementation", "planning", "brt")) return "capital_delivery";
  return "other_treatment";
}

function inferMetricCoarseFamily(rawValue: string): string {
  const { tokenSet, text } = tokens(rawValue);
  if (hasToken(tokenSet, "speed", "travel", "time", "runtime", "headway") || hasPhrase(text, "travel_time")) return "bus_performance";
  if (hasToken(tokenSet, "ridership", "riders", "passengers", "boardings")) return "ridership";
  if (hasToken(tokenSet, "bunching", "reliability", "late", "schedule")) return "bus_reliability";
  if (hasToken(tokenSet, "crash", "injury", "fatality", "fatalities", "ksi")) return "safety";
  if (hasToken(tokenSet, "parking", "curb", "loading")) return "curb_parking";
  if (hasToken(tokenSet, "width", "lane", "roadway", "length", "mile", "feet")) return "street_geometry";
  if (hasToken(tokenSet, "cost", "funding", "budget", "dollar")) return "cost_funding";
  if (hasToken(tokenSet, "population", "household", "income", "resident")) return "demographics";
  return "other_metric";
}

function inferMetricSubjectCoarseFamily(rawValue: string): string {
  const { tokenSet, text } = tokens(rawValue);
  if (hasToken(tokenSet, "speed", "travel", "time") || hasPhrase(text, "travel_time")) return "bus_performance";
  if (hasToken(tokenSet, "ridership", "riders", "passengers", "boardings")) return "ridership";
  if (hasToken(tokenSet, "traffic", "vehicle", "volume")) return "traffic_operations";
  if (hasToken(tokenSet, "parking", "curb", "loading", "delivery")) return "curb_parking";
  if (hasToken(tokenSet, "crash", "injury", "fatality", "fatalities", "ksi", "safety")) return "safety";
  if (hasToken(tokenSet, "route", "service", "bus")) return "route_service";
  if (hasToken(tokenSet, "corridor", "street", "intersection")) return "geography";
  return "other_metric_subject";
}

function inferUnitCoarseFamily(rawValue: string): string {
  const { tokenSet } = tokens(rawValue);
  if (hasToken(tokenSet, "minute", "minutes", "second", "seconds", "hour", "hours", "day", "days")) return "time";
  if (hasToken(tokenSet, "rider", "riders", "passenger", "passengers", "customer", "customers", "cyclist", "cyclists")) return "people";
  if (hasToken(tokenSet, "vehicle", "vehicles", "bus", "buses")) return "vehicles";
  if (hasToken(tokenSet, "percent", "percentage", "share", "proportion")) return "ratio";
  if (hasToken(tokenSet, "feet", "ft", "mile", "miles")) return "distance";
  if (hasToken(tokenSet, "dollar", "dollars")) return "money";
  if (hasToken(tokenSet, "crash", "crashes", "injury", "injuries", "fatality", "fatalities")) return "safety";
  return "other_unit";
}

function inferEntityCoarseFamily(rawValue: string): string {
  const { tokenSet } = tokens(rawValue);
  if (hasToken(tokenSet, "agency", "organization", "business", "committee", "board")) return "organization";
  if (hasToken(tokenSet, "person", "contact", "participant", "member")) return "person";
  if (hasToken(tokenSet, "route", "service", "stop", "station", "terminal", "sbs")) return "transit";
  if (hasToken(tokenSet, "corridor", "street", "intersection", "location", "landmark", "boundary")) return "geography";
  if (hasToken(tokenSet, "project", "program", "study", "alternative", "option")) return "project";
  if (hasToken(tokenSet, "treatment", "design", "feature", "lane", "curb", "parking")) return "treatment";
  return "other_entity";
}

function classifyManual(keyId: string, rawValue: string, resolver: LeafResolver): ManualDecision {
  if (keyId === "eventFamily") return classifyEventFamily(rawValue, resolver);
  if (keyId === "eventSubtype") return classifyEventSubtype(rawValue, resolver);
  if (keyId === "eventTreatmentFamily") return classifyEventTreatmentFamily(rawValue, resolver);
  if (keyId === "metricFamily") return classifyMetricFamily(rawValue, resolver);
  if (keyId === "metricSubjectFamily") return classifyMetricSubjectFamily(rawValue, resolver);
  if (keyId === "metricUnit") return classifyMetricUnit(rawValue, resolver);
  if (keyId === "entityKind") return classifyEntityKind(rawValue, resolver);
  if (keyId === "entityRole") return classifyEntityRole(rawValue, resolver);
  if (keyId === "claimKind") return classifyClaimKind(rawValue, resolver);
  if (keyId === "claimResearchUseTag") return classifyClaimResearchUseTag(rawValue, resolver);
  if (keyId === "contextKind") return classifyContextKind(rawValue, resolver);
  if (keyId === "questionKind") return classifyQuestionKind(rawValue, resolver);
  if (keyId === "tableKind") return classifyTableKind(rawValue, resolver);
  return preserve("other", "manual_preserve_unsupported_key", `No manual rules are configured for ${keyId}.`);
}

function readCanonicalArtifactRefs(raw: unknown): Array<{ artifactPath: string; sourceId: string | null; pageNumbers: number[] }> {
  if (!isRecord(raw)) throw new Error("Canonical merge artifact is not an object.");
  const refs: Array<{ artifactPath: string; sourceId: string | null; pageNumbers: number[] }> = [];
  for (const item of arrayValue<JsonRecord>(raw["canonicalArtifacts"])) {
    const artifactPath = stringValue(item["artifactPath"]);
    if (artifactPath === null) continue;
    refs.push({
      artifactPath: fromCliPath(artifactPath),
      sourceId: stringValue(item["sourceId"]),
      pageNumbers: arrayValue<number>(item["pageNumbers"]).filter((value) => Number.isFinite(value)),
    });
  }
  if (refs.length === 0) throw new Error("Canonical merge artifact has no canonicalArtifacts.");
  return refs;
}

function readGraduationKeys(raw: unknown, keyIds: string[]): GraduationKey[] {
  if (!isRecord(raw)) throw new Error("Graduation plan is not an object.");
  const wanted = new Set(keyIds);
  const keys = arrayValue<JsonRecord>(raw["graduationKeys"])
    .filter((item) => typeof item["id"] === "string" && wanted.has(item["id"]))
    .map((item) => ({
      id: String(item["id"]),
      targetPayloadPath: String(item["targetPayloadPath"]),
      sourceFieldPaths: arrayValue<string>(item["sourceFieldPaths"]).filter((value) => typeof value === "string"),
    }));
  const found = new Set(keys.map((key) => key.id));
  const missing = keyIds.filter((keyId) => !found.has(keyId));
  if (missing.length > 0) throw new Error(`Graduation plan is missing requested key(s): ${missing.join(", ")}`);
  return keys;
}

function projectionRows(raw: unknown): ProjectionRow[] {
  if (!isRecord(raw)) throw new Error("Projection artifact is not an object.");
  return arrayValue<ProjectionRow>(raw["rows"]);
}

function eventFamilySuggestion(surface: JsonRecord, resolver: LeafResolver): JsonRecord {
  const label = stringValue(surface["displayLabel"]) ?? "";
  const rawText = stringValue(surface["rawText"]) ?? "";
  const text = [label, rawText].filter((value) => value.length > 0).join(" ");
  const decision = text.length === 0 ? unresolved("other_event", "manual_review_no_text", "No display label or raw text available.") : classifyEventFamily(text, resolver);
  return {
    decision: decision.decision,
    canonicalLeafId: decision.canonicalLeafId,
    canonicalLeafLabel: decision.canonicalLeafLabel,
    coarseFamily: decision.coarseFamily,
    ruleId: decision.ruleId,
    rationale: `Review suggestion only: ${decision.rationale}`,
  };
}

export async function buildTier2ManualVocabProjectionOverlay(args: BuildTier2ManualVocabProjectionOverlayArgs): Promise<{
  overlay: JsonRecord;
  expandedProjection: ProjectionArtifact;
  outputRoot: string;
  overlayPath: string;
  expandedProjectionPath: string;
  markdownPath: string;
  missingSourceReviewPath: string;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const keyIds = args.keyIds === undefined || args.keyIds.length === 0 ? [...DEFAULT_KEY_IDS] : args.keyIds;
  const outputRoot = fromCliPath(
    args.outputRoot ?? join(defaultArtifactRootPath(), "docs", "tier2-manual-vocab-projection-overlay"),
  );
  const overlayPath = join(outputRoot, "manual-vocab-projection-overlay.json");
  const expandedProjectionPath = join(outputRoot, "vocab-normalization-projection-manual-overlay.json");
  const markdownPath = join(outputRoot, "manual-vocab-projection-overlay.md");
  const missingSourceReviewPath = join(outputRoot, "event-family-missing-source-field-review.json");

  const sourceProjection = (await Bun.file(fromCliPath(args.sourceProjectionPath)).json()) as ProjectionArtifact;
  const sourceProjectionRowsBefore = projectionRows(sourceProjection);
  const projectionRowsBefore = sourceProjectionRowsBefore.map((row) => sanitizeUnsafeMetricProjectionRow(row));
  const sourceProjectionSanitizedRowCount = projectionRowsBefore.filter(
    (row, index) => row !== sourceProjectionRowsBefore[index],
  ).length;
  const exactProjectionKeys = new Set(projectionRowsBefore.map((row) => projectionIndexKey(row.keyId, row.rawValue)));
  const resolver = new LeafResolver(projectionRowsBefore);
  const canonicalRefs = readCanonicalArtifactRefs(await Bun.file(fromCliPath(args.canonicalMergePath)).json());
  const graduationKeys = readGraduationKeys(await Bun.file(fromCliPath(args.graduationPlanPath)).json(), keyIds);

  const missingByKeyAndRaw = new Map<string, MissingRawValue>();
  const eventFamilyNoSourceSurfaces: JsonRecord[] = [];

  for (const ref of canonicalRefs) {
    const artifact = await Bun.file(ref.artifactPath).json();
    for (const acceptedItem of artifact.submitResult?.accepted ?? []) {
      const surface = acceptedItem.surface;
      if (!isRecord(surface)) continue;
      for (const key of graduationKeys) {
        const sourceValues: Array<{ sourceFieldPath: string; rawValue: string }> = [];
        for (const sourceFieldPath of key.sourceFieldPaths) {
          for (const rawValue of pathValues(surface, sourceFieldPath)) sourceValues.push({ sourceFieldPath, rawValue });
        }
        if (key.id === "eventFamily" && surface["surfaceKind"] === "event_candidate" && sourceValues.length === 0) {
          eventFamilyNoSourceSurfaces.push({
            artifactPath: ref.artifactPath,
            sourceId: ref.sourceId ?? surface["sourceId"] ?? null,
            pageNumbers: ref.pageNumbers ?? surface["pageNumbers"] ?? [],
            surfaceId: surface["surfaceId"] ?? null,
            displayLabel: surface["displayLabel"] ?? null,
            rawText: surface["rawText"] ?? null,
            rawPayload: surface["rawPayload"] ?? {},
            reviewSuggestion: eventFamilySuggestion(surface, resolver),
          });
        }
        for (const { sourceFieldPath, rawValue } of sourceValues) {
          if (exactProjectionKeys.has(projectionIndexKey(key.id, rawValue))) continue;
          const missingKey = projectionIndexKey(key.id, rawValue);
          const row = missingByKeyAndRaw.get(missingKey) ?? {
            keyId: key.id,
            targetPayloadPath: key.targetPayloadPath,
            rawValue,
            inputCount: 0,
            sourceFieldCounts: {},
            surfaceKindCounts: {},
            examples: [],
          };
          row.inputCount += 1;
          increment(row.sourceFieldCounts, sourceFieldPath);
          if (typeof surface["surfaceKind"] === "string") increment(row.surfaceKindCounts, surface["surfaceKind"]);
          if (row.examples.length < 4) {
            row.examples.push({
              artifactPath: ref.artifactPath,
              sourceId: ref.sourceId ?? surface["sourceId"] ?? null,
              sourceGroup: surface["sourceGroup"] ?? null,
              pageNumbers: ref.pageNumbers ?? surface["pageNumbers"] ?? [],
              surfaceId: surface["surfaceId"] ?? null,
              surfaceKind: surface["surfaceKind"] ?? null,
              payloadSchemaId: surface["payloadSchemaId"] ?? null,
              displayLabel: surface["displayLabel"] ?? null,
              sourceFieldPath,
            });
          }
          missingByKeyAndRaw.set(missingKey, row);
        }
      }
    }
  }

  const manualRowsWithAudit = [...missingByKeyAndRaw.values()]
    .sort((left, right) => left.keyId.localeCompare(right.keyId) || right.inputCount - left.inputCount || left.rawValue.localeCompare(right.rawValue))
    .map((missing) => {
      const decision = classifyManual(missing.keyId, missing.rawValue, resolver);
      const row: ProjectionRow & { manualRuleId: string; manualRationale: string } = {
        keyId: missing.keyId,
        targetPayloadPath: missing.targetPayloadPath,
        rawValue: missing.rawValue,
        decision: decision.decision,
        originalDecision: decision.decision,
        canonicalLeafId: decision.canonicalLeafId,
        canonicalLeafLabel: decision.canonicalLeafLabel,
        coarseFamily: decision.coarseFamily,
        modifiers: modifiersFor(missing.rawValue, decision.coarseFamily),
        evidenceProvenance: {
          inputCount: missing.inputCount,
          sourceFieldCounts: sortedRecord(missing.sourceFieldCounts),
          surfaceKindCounts: sortedRecord(missing.surfaceKindCounts),
          examples: missing.examples,
        },
        manualRuleId: decision.ruleId,
        manualRationale: decision.rationale,
      };
      const sanitized = sanitizeUnsafeMetricProjectionRow(row);
      if (sanitized !== row) {
        const reason =
          metricProjectionSanitizationReason(row) ??
          "Quarantined because the metric projection did not meet public-claim safety rules.";
        return {
          ...sanitized,
          manualRuleId: `${decision.ruleId}_sanitized_metric_claim_safety`,
          manualRationale: `${decision.rationale} ${reason}`,
        };
      }
      return row;
    });

  const manualProjectionRows = manualRowsWithAudit.map(({ manualRuleId: _ruleId, manualRationale: _rationale, ...row }) => row);
  const summaryByKey: Record<string, OverlayKeySummary> = {};
  const ruleInstanceCounts: Record<string, number> = {};
  const topByKeyAndDecision: Record<string, TopDecisionRow[]> = {};
  for (const row of manualRowsWithAudit) {
    const keySummary = (summaryByKey[row.keyId] ??= {
      manualProjectionRowCount: 0,
      missingProjectionInstanceCountBefore: 0,
      manualDecisionDistinctCounts: {},
      manualDecisionInstanceCounts: {},
    });
    const decisionKey = row.decision === "mapped" ? row.canonicalLeafId ?? "mapped_null" : row.decision;
    keySummary.manualProjectionRowCount += 1;
    keySummary.missingProjectionInstanceCountBefore += row.evidenceProvenance.inputCount;
    increment(keySummary.manualDecisionDistinctCounts, decisionKey);
    increment(keySummary.manualDecisionInstanceCounts, decisionKey, row.evidenceProvenance.inputCount);
    increment(ruleInstanceCounts, row.manualRuleId, row.evidenceProvenance.inputCount);
    const topKey = `${row.keyId}:${decisionKey}`;
    topByKeyAndDecision[topKey] ??= [];
    topByKeyAndDecision[topKey].push({
      rawValue: row.rawValue,
      inputCount: row.evidenceProvenance.inputCount,
      ruleId: row.manualRuleId,
      exampleDisplayLabel: (row.evidenceProvenance.examples[0] as JsonRecord | undefined)?.["displayLabel"] ?? null,
    });
  }
  for (const value of Object.values(topByKeyAndDecision)) {
    value.sort((left, right) => right.inputCount - left.inputCount || left.rawValue.localeCompare(right.rawValue));
    value.splice(25);
  }
  for (const keySummary of Object.values(summaryByKey)) {
    keySummary.manualDecisionDistinctCounts = sortedRecord(keySummary.manualDecisionDistinctCounts);
    keySummary.manualDecisionInstanceCounts = sortedRecord(keySummary.manualDecisionInstanceCounts);
  }

  const expandedProjection: ProjectionArtifact = {
    ...sourceProjection,
    generatedAt,
    sourceManifestPath: overlayPath,
    rowCount: projectionRowsBefore.length + manualProjectionRows.length,
    rows: [...projectionRowsBefore, ...manualProjectionRows],
  };

  const summary: OverlaySummary = {
    sourceProjectionRowCount: projectionRowsBefore.length,
    sourceProjectionSanitizedRowCount,
    manualProjectionRowCount: manualProjectionRows.length,
    expandedProjectionRowCount: expandedProjection.rowCount,
    missingProjectionInstanceCountBefore: manualProjectionRows.reduce((sum, row) => sum + row.evidenceProvenance.inputCount, 0),
    missingProjectionDistinctRawValueCountBefore: manualProjectionRows.length,
    eventFamilyMissingSourceFieldEventCandidateCount: eventFamilyNoSourceSurfaces.length,
    byKey: sortedRecord(summaryByKey),
    manualRuleInstanceCounts: sortedRecord(ruleInstanceCounts),
  };

  const overlay: JsonRecord = {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceCanonicalMergePath: fromCliPath(args.canonicalMergePath),
    sourceGraduationPlanPath: fromCliPath(args.graduationPlanPath),
    sourceProjectionPath: fromCliPath(args.sourceProjectionPath),
    outputProjectionPath: expandedProjectionPath,
    safetyPolicy: {
      rawPayloadMutationAllowed: false,
      canonicalPayloadMode: "additive_from_vocab_projection",
      unresolvedBehavior: "preserve_raw_and_emit_unresolved",
      llmRuntimeUse: "none",
      manualMappingScope: keyIds,
    },
    summary,
    manualRules: [
      "Use only existing canonical leaves from the cleaned source projection.",
      "Tokenize raw labels before matching, so substrings like publication->public or release->EAS cannot cause false matches.",
      "Map normalized exact aliases first; map clear manual patterns; preserve ambiguous long-tail values instead of guessing.",
      "Quarantine source-projection metric rows that map generic raw values onto location/project-specific canonical leaves.",
      "Do not use rawText to create projection rows. RawText-derived suggestions are review-only for event candidates with no family-like source field.",
    ],
    topByKeyAndDecision: sortedRecord(topByKeyAndDecision),
    rows: manualRowsWithAudit,
  };

  const missingSourceReview = {
    artifactKind: "bp.tier2_event_family_missing_source_field_review.v1",
    schemaVersion: 1,
    generatedAt,
    sourceCanonicalMergePath: fromCliPath(args.canonicalMergePath),
    sourceGraduationPlanPath: fromCliPath(args.graduationPlanPath),
    summary: {
      eventCandidateWithoutFamilyLikeFieldCount: eventFamilyNoSourceSurfaces.length,
    },
    surfaces: eventFamilyNoSourceSurfaces,
  };

  await mkdir(outputRoot, { recursive: true });
  await writeJson(overlayPath, overlay);
  await writeJson(expandedProjectionPath, expandedProjection);
  await writeJson(missingSourceReviewPath, missingSourceReview);
  await Bun.write(markdownPath, renderMarkdown(overlay, outputRoot, expandedProjectionPath, missingSourceReviewPath));

  return { overlay, expandedProjection, outputRoot, overlayPath, expandedProjectionPath, markdownPath, missingSourceReviewPath };
}

function renderMarkdown(overlay: JsonRecord, outputRoot: string, expandedProjectionPath: string, missingSourceReviewPath: string): string {
  const summary = overlay["summary"] as OverlaySummary;
  const byKey = summary.byKey;
  const lines: string[] = [];
  lines.push("# Manual Vocab Projection Overlay");
  lines.push("");
  lines.push(`Generated: ${String(overlay["generatedAt"])}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Source projection rows: ${summary["sourceProjectionRowCount"]}`);
  lines.push(`- Source projection rows quarantined: ${summary["sourceProjectionSanitizedRowCount"]}`);
  lines.push(`- Manual rows added: ${summary["manualProjectionRowCount"]}`);
  lines.push(`- Missing-projection instances covered: ${summary["missingProjectionInstanceCountBefore"]}`);
  lines.push(`- Event candidates with no family-like source field: ${summary["eventFamilyMissingSourceFieldEventCandidateCount"]}`);
  lines.push(`- Expanded projection rows: ${summary["expandedProjectionRowCount"]}`);
  lines.push("");
  lines.push("## By Key");
  lines.push("");
  lines.push("| key | rows | instances | mapped instances | preserved/unresolved instances |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const [keyId, keySummary] of Object.entries(byKey)) {
    const instanceCounts = keySummary["manualDecisionInstanceCounts"];
    const mapped = Object.entries(instanceCounts)
      .filter(([key]) => key !== "preserve_raw" && key !== "unresolved")
      .reduce((sum, [, value]) => sum + value, 0);
    const notMapped = (instanceCounts["preserve_raw"] ?? 0) + (instanceCounts["unresolved"] ?? 0);
    lines.push(`| ${keyId} | ${keySummary["manualProjectionRowCount"]} | ${keySummary["missingProjectionInstanceCountBefore"]} | ${mapped} | ${notMapped} |`);
  }
  lines.push("");
  lines.push("## Rules");
  lines.push("");
  for (const rule of arrayValue<string>(overlay["manualRules"])) lines.push(`- ${rule}`);
  lines.push("");
  lines.push("## Outputs");
  lines.push("");
  lines.push(`- Output root: ${outputRoot}`);
  lines.push(`- Expanded projection: ${expandedProjectionPath}`);
  lines.push(`- Event-family missing-source review: ${missingSourceReviewPath}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--canonical-merge") {
      if (value === undefined) throw new Error("--canonical-merge requires a value.");
      args.canonicalMergePath = value;
      index += 1;
    } else if (arg === "--graduation-plan") {
      if (value === undefined) throw new Error("--graduation-plan requires a value.");
      args.graduationPlanPath = value;
      index += 1;
    } else if (arg === "--source-projection") {
      if (value === undefined) throw new Error("--source-projection requires a value.");
      args.sourceProjectionPath = value;
      index += 1;
    } else if (arg === "--output-root") {
      if (value === undefined) throw new Error("--output-root requires a value.");
      args.outputRoot = value;
      index += 1;
    } else if (arg === "--key-ids") {
      if (value === undefined) throw new Error("--key-ids requires a value.");
      args.keyIds = value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 manual-vocab-projection-overlay option: ${arg}`);
    }
  }
  return args;
}

export async function runTier2ManualVocabProjectionOverlayFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.canonicalMergePath === undefined) throw new Error("Provide --canonical-merge.");
  if (args.graduationPlanPath === undefined) throw new Error("Provide --graduation-plan.");
  if (args.sourceProjectionPath === undefined) throw new Error("Provide --source-projection.");
  const result = await buildTier2ManualVocabProjectionOverlay({
    canonicalMergePath: args.canonicalMergePath,
    graduationPlanPath: args.graduationPlanPath,
    sourceProjectionPath: args.sourceProjectionPath,
    ...(args.outputRoot === undefined ? {} : { outputRoot: args.outputRoot }),
    ...(args.keyIds === undefined ? {} : { keyIds: args.keyIds }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  const summary = result.overlay["summary"] as OverlaySummary;
  console.log(
    `tier2-manual-vocab-projection-overlay: rows=${summary["manualProjectionRowCount"]} instances=${summary["missingProjectionInstanceCountBefore"]} projectionRows=${result.expandedProjection.rowCount}`,
  );
  return {
    artifactKind: result.overlay["artifactKind"],
    schemaVersion: result.overlay["schemaVersion"],
    generatedAt: result.overlay["generatedAt"],
    outputRoot: result.outputRoot,
    overlayPath: result.overlayPath,
    expandedProjectionPath: result.expandedProjectionPath,
    markdownPath: result.markdownPath,
    missingSourceReviewPath: result.missingSourceReviewPath,
    summary,
  };
}
