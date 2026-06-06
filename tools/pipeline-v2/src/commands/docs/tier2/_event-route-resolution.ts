import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  classifyOperationalDate,
  type OperationalDateValidationState,
} from "@bp/domain/documents/operational-date";
import { writeJson } from "../../../lib/json.ts";
import { defaultLocalPipelineDbPath } from "../../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { latestDocsRunId, runArtifactRoot } from "./_shared.ts";

const ARTIFACT_KIND = "bp.tier2_document_event_route_resolution.v1";
const DEFAULT_SURFACES_DIR = "document-derived-surfaces-v1";
const DEFAULT_OUTPUT_FILENAME = "document-event-route-resolution-v1.json";

export type TimelineEligibility =
  | "intervention_timeline_candidate"
  | "process_only"
  | "context_only"
  | "evaluation_or_monitoring"
  | "needs_review"
  | "source_gap";

export type EventKind =
  | "physical_bus_priority_change"
  | "service_change"
  | "enforcement_or_regulatory_change"
  | "planning_or_design_milestone"
  | "public_engagement"
  | "survey_or_data_collection"
  | "evaluation_report"
  | "funding_or_approval"
  | "existing_condition"
  | "methodology_or_source_note"
  | "other";

export type InterventionFamily =
  | "busway_or_transitway"
  | "bus_lane"
  | "offset_or_curbside_bus_lane"
  | "transit_signal_priority"
  | "queue_jump"
  | "select_bus_service"
  | "stop_consolidation"
  | "camera_enforcement"
  | "curb_management"
  | "street_design_or_turn_restriction"
  | "route_redesign_or_service_pattern"
  | "other_bus_priority"
  | "none";

export type RouteResolutionTier =
  | "direct_event_text"
  | "source_single_route_context"
  | "corridor_gazetteer"
  | "ambiguous_direct_event_text"
  | "ambiguous_corridor_gazetteer"
  | "unresolved";

// Date validation is derived from the source's own stated status + the event
// kind (see @bp/domain classifyOperationalDate). Official source operational
// statements are trusted; historical GTFS is only an optional route/service
// exposure check, never a universal date validator.
export type DateValidationState = OperationalDateValidationState;

type EvidenceRef = {
  sourceId?: string;
  pageNumber?: number;
  blockId?: string;
  lineStart?: number;
  lineEnd?: number;
  roleRaw?: string;
};

export type DocumentDerivedEventSurface = {
  surfaceId: string;
  sourceId: string;
  sourceTitle?: string;
  sourceGroup?: string;
  pageNumbers?: number[];
  evidenceRefs?: EvidenceRef[];
  displayLabel?: string;
  canonicalFamily?: string;
  rawFamily?: string;
  eventName?: string;
  eventFamily?: string;
  eventSubtype?: string;
  eventStatus?: string;
  dateText?: string;
  datePrecision?: string;
  locationText?: string;
  treatmentText?: string;
  affectedEntitiesRaw?: string[];
  linkedEntityCandidateIds?: string[];
  rawCandidate?: Record<string, unknown>;
};

type DocumentDerivedEntitySurface = {
  sourceId: string;
  displayLabel?: string;
  entityMode?: string;
  canonicalFamily?: string;
};

export type RouteCatalogEntry = {
  routeId: string;
  routeShortName: string;
  routeLongName?: string | null;
};

export type RouteStopEntry = {
  routeId: string;
  routeShortName: string;
  stopName: string;
};

type RouteAliasIndex = {
  routeIds: Set<string>;
  aliasesByRoute: Map<string, string[]>;
  routeByAlias: Map<string, string>;
  routePatterns: Array<{ routeId: string; pattern: RegExp }>;
};

export type StreetRouteCandidate = {
  routeId: string;
  routeShortName: string;
  stopCount: number;
};

export type StreetRouteGazetteer = {
  streetRoutes: Map<string, Map<string, StreetRouteCandidate>>;
  streetKeys: string[];
};

export type EventClassification = {
  timelineEligibility: TimelineEligibility;
  eventKind: EventKind;
  interventionFamily: InterventionFamily;
  reasons: string[];
};

export type RouteResolutionEvidence = {
  kind: "route_text" | "source_route_context" | "corridor_street";
  matchedText: string;
  matchedRoutes: string[];
  routeFanout?: number;
};

export type EventRouteResolutionRow = {
  surfaceId: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  displayLabel: string | null;
  canonicalFamily: string | null;
  rawFamily: string | null;
  eventName: string | null;
  eventFamily: string | null;
  eventSubtype: string | null;
  eventStatus: string | null;
  dateText: string | null;
  locationText: string | null;
  treatmentText: string | null;
  affectedEntitiesRaw: string[];
  timelineEligibility: TimelineEligibility;
  eventKind: EventKind;
  interventionFamily: InterventionFamily;
  classificationReasons: string[];
  routeResolutionTier: RouteResolutionTier;
  routeResolutionState: "resolved" | "ambiguous" | "unresolved";
  routeIds: string[];
  routeCount: number;
  routeResolutionEvidence: RouteResolutionEvidence[];
  routeIdentityValidationState: "confirmed_in_current_gtfs" | "unresolved_or_ambiguous";
  dateValidationState: DateValidationState;
  promotableToRouteReviewQueue: boolean;
  promotionCaveats: string[];
  evidenceRefs: EvidenceRef[];
};

type EventRouteResolutionSummary = {
  inputEventCount: number;
  interventionCandidateCount: number;
  routeResolvedEventCount: number;
  routeResolvedInterventionCandidateCount: number;
  promotableToRouteReviewQueueCount: number;
  ambiguousInterventionCandidateCount: number;
  unresolvedInterventionCandidateCount: number;
  sourceRouteContextCount: number;
  streetGazetteerKeyCount: number;
  streetGazetteerRouteStopRows: number;
  currentGtfsRouteCount: number;
  countsByTimelineEligibility: Record<string, number>;
  countsByEventKind: Record<string, number>;
  countsByInterventionFamily: Record<string, number>;
  countsByRouteResolutionTier: Record<string, number>;
  countsByDateValidationState: Record<string, number>;
};

export type EventRouteResolutionArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceSurfacesPath: string;
  entitiesSurfacesPath: string;
  localDbPath: string;
  routeStopMonth: string | null;
  summary: EventRouteResolutionSummary;
  samples: {
    promotable: EventRouteResolutionRow[];
    ambiguous: EventRouteResolutionRow[];
    unresolvedCandidates: EventRouteResolutionRow[];
    processOnly: EventRouteResolutionRow[];
  };
  rows: EventRouteResolutionRow[];
};

export type RunTier2DocumentEventRouteResolutionArgs = {
  surfacesDir: string;
  eventsPath?: string;
  entitiesPath?: string;
  outputPath: string;
  dbPath: string;
  routeStopMonth?: string;
  generatedAt?: string;
};

export type RunTier2DocumentEventRouteResolutionResult = {
  outputPath: string;
  artifact: EventRouteResolutionArtifact;
};

type CliArgs = {
  artifactRoot?: string;
  runId?: string;
  surfacesDir?: string;
  eventsPath?: string;
  entitiesPath?: string;
  outputPath?: string;
  dbPath?: string;
  routeStopMonth?: string;
  generatedAt?: string;
};

const PROCESS_TERMS = [
  "community engagement",
  "community outreach",
  "public engagement",
  "public outreach",
  "public meeting",
  "workshop",
  "open house",
  "presentation",
  "survey",
  "feedback",
  "comment period",
  "advisory committee",
  "stakeholder",
  "consultation",
] as const;

const EVALUATION_TERMS = [
  "evaluation",
  "monitoring",
  "report",
  "study",
  "analysis",
  "dashboard",
  "survey results",
  "ridership trends",
  "methodology",
  "technical memorandum",
] as const;

const CONTEXT_TERMS = [
  "existing condition",
  "existing conditions",
  "traffic condition",
  "traffic analysis",
  "before condition",
  "baseline condition",
  "problem statement",
] as const;

const INTERVENTION_TERMS = [
  "bus lane",
  "busway",
  "transitway",
  "transit priority",
  "truck priority",
  "bus priority",
  "select bus service",
  "sbs",
  "transit signal priority",
  "signal priority",
  "tsp",
  "queue jump",
  "bus bulb",
  "bus boarding island",
  "offset bus lane",
  "curbside bus lane",
  "camera enforcement",
  "automated camera enforcement",
  "bus-mounted camera",
  "bus stop consolidation",
  "stop consolidation",
  "route redesign",
  "service launch",
  "service change",
  "street improvement",
  "turn restriction",
  "dedicated bus",
] as const;

const PHYSICAL_TERMS = [
  "bus lane",
  "busway",
  "transitway",
  "queue jump",
  "bus bulb",
  "bus boarding island",
  "offset bus lane",
  "curbside bus lane",
  "street improvement",
  "turn restriction",
] as const;

function compact(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function upperCompact(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, terms: readonly string[]): boolean {
  const normalized = compact(text);
  return terms.some((term) => normalized.includes(term));
}

// Word-boundary variant: short acronyms ("ace", "sbs", "tsp") must match as
// whole tokens, not as substrings inside other words ("Place", "resurface").
function includesAnyWord(text: string, terms: readonly string[]): boolean {
  const normalized = compact(text);
  return terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalized);
  });
}

const CAMERA_ENFORCEMENT_TERMS = [
  "camera enforcement",
  "automated camera enforcement",
  "automated bus lane enforcement",
  "bus lane camera",
  "bus-mounted camera",
  "ace",
] as const;

function addCount(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function textForEvent(event: DocumentDerivedEventSurface): string {
  return [
    event.displayLabel,
    event.canonicalFamily,
    event.rawFamily,
    event.eventName,
    event.eventFamily,
    event.eventSubtype,
    event.eventStatus,
    event.dateText,
    event.locationText,
    event.treatmentText,
    ...(event.affectedEntitiesRaw ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function processTextForEvent(event: DocumentDerivedEventSurface): string {
  return [
    event.displayLabel,
    event.canonicalFamily,
    event.rawFamily,
    event.eventName,
    event.eventFamily,
    event.eventSubtype,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

export function classifyTier2Event(event: DocumentDerivedEventSurface): EventClassification {
  const allText = textForEvent(event);
  const familyText = processTextForEvent(event);
  const canonicalFamily = compact(event.canonicalFamily);
  const rawFamily = compact(event.rawFamily);
  const reasons: string[] = [];

  const isPublicEngagement =
    canonicalFamily === "public_engagement" || includesAny(familyText, PROCESS_TERMS);
  const isEvaluation =
    canonicalFamily === "evaluation_report" || includesAny(familyText, EVALUATION_TERMS);
  const isContext = includesAny(familyText, CONTEXT_TERMS);
  const hasInterventionTerm = includesAnyWord(allText, INTERVENTION_TERMS);

  if (isPublicEngagement) reasons.push("public/process event family");
  if (isEvaluation) reasons.push("evaluation/report/monitoring family");
  if (isContext) reasons.push("existing-condition/context family");
  if (hasInterventionTerm) reasons.push("bus-priority treatment term present");

  let timelineEligibility: TimelineEligibility;
  if (isPublicEngagement) {
    timelineEligibility = "process_only";
  } else if (isEvaluation) {
    timelineEligibility = "evaluation_or_monitoring";
  } else if (isContext) {
    timelineEligibility = "context_only";
  } else if (
    hasInterventionTerm ||
    canonicalFamily === "planned_intervention" ||
    canonicalFamily === "implementation_milestone" ||
    canonicalFamily === "regulatory_or_enforcement" ||
    canonicalFamily === "service_change"
  ) {
    timelineEligibility = "intervention_timeline_candidate";
  } else if (canonicalFamily === "other_event" || rawFamily === "source_gap") {
    timelineEligibility = "needs_review";
  } else {
    timelineEligibility = "needs_review";
  }

  let eventKind: EventKind = "other";
  if (timelineEligibility === "process_only") eventKind = "public_engagement";
  else if (timelineEligibility === "evaluation_or_monitoring") eventKind = "evaluation_report";
  else if (timelineEligibility === "context_only") eventKind = "existing_condition";
  else if (includesAny(allText, ["funding", "grant", "approved", "approval"])) {
    eventKind = "funding_or_approval";
  } else if (includesAnyWord(allText, CAMERA_ENFORCEMENT_TERMS)) {
    eventKind = "enforcement_or_regulatory_change";
  } else if (
    includesAny(allText, [
      "service change",
      "route redesign",
      "service launch",
      "select bus service",
      "sbs",
    ])
  ) {
    eventKind = "service_change";
  } else if (includesAny(allText, PHYSICAL_TERMS)) {
    eventKind = "physical_bus_priority_change";
  } else if (timelineEligibility === "intervention_timeline_candidate") {
    eventKind = "planning_or_design_milestone";
  }

  let interventionFamily: InterventionFamily = "none";
  if (
    includesAny(allText, ["busway", "transitway", "transit and truck priority", "truck priority"])
  ) {
    interventionFamily = "busway_or_transitway";
  } else if (includesAny(allText, ["offset bus lane"])) {
    interventionFamily = "offset_or_curbside_bus_lane";
  } else if (includesAny(allText, ["curbside bus lane"])) {
    interventionFamily = "offset_or_curbside_bus_lane";
  } else if (includesAny(allText, ["bus lane", "dedicated bus"])) {
    interventionFamily = "bus_lane";
  } else if (includesAny(allText, ["transit signal priority", "signal priority", "tsp"])) {
    interventionFamily = "transit_signal_priority";
  } else if (includesAny(allText, ["queue jump"])) {
    interventionFamily = "queue_jump";
  } else if (includesAny(allText, ["select bus service", "sbs"])) {
    interventionFamily = "select_bus_service";
  } else if (includesAny(allText, ["stop consolidation", "bus stop consolidation"])) {
    interventionFamily = "stop_consolidation";
  } else if (includesAnyWord(allText, CAMERA_ENFORCEMENT_TERMS)) {
    interventionFamily = "camera_enforcement";
  } else if (includesAny(allText, ["curb management", "curb regulation", "curbside"])) {
    interventionFamily = "curb_management";
  } else if (includesAny(allText, ["turn restriction", "street improvement", "street design"])) {
    interventionFamily = "street_design_or_turn_restriction";
  } else if (
    includesAny(allText, ["route redesign", "service pattern", "service change", "service launch"])
  ) {
    interventionFamily = "route_redesign_or_service_pattern";
  } else if (timelineEligibility === "intervention_timeline_candidate") {
    interventionFamily = "other_bus_priority";
  }

  return {
    timelineEligibility,
    eventKind,
    interventionFamily,
    reasons: reasons.length > 0 ? reasons : ["no deterministic family rule matched"],
  };
}

function routeBaseToken(routeIdOrShortName: string): string | null {
  const normalized = routeIdOrShortName
    .toUpperCase()
    .replace(/SELECT BUS SERVICE/g, "SBS")
    .replace(/[-_ ]?SBS\b/g, "")
    .replace(/\+/g, "")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(BX|SIM|[MBQS])(\d{1,3})([A-Z]?)$/);
  return match ? `${match[1]}${match[2]}${match[3] ?? ""}` : null;
}

function routePatternFromBase(base: string): RegExp {
  const match = base.match(/^(BX|SIM|[MBQS])(\d{1,3})([A-Z]?)$/);
  if (!match) return /$a/;
  const [, prefix, number, suffix] = match;
  const suffixPattern = suffix ? `\\s*${suffix}` : "";
  return new RegExp(
    `(^|[^A-Z0-9])${prefix}\\s*${number}${suffixPattern}(?:\\s*[- ]?(?:SBS|SELECT\\s+BUS\\s+SERVICE))?([^A-Z0-9]|$)`,
    "i",
  );
}

export function buildRouteAliasIndex(routes: readonly RouteCatalogEntry[]): RouteAliasIndex {
  const routeIds = new Set<string>();
  const aliasesByRoute = new Map<string, string[]>();
  const routeByAlias = new Map<string, string>();
  const routePatterns: Array<{ routeId: string; pattern: RegExp }> = [];

  for (const route of routes) {
    const aliases = new Set<string>();
    aliases.add(route.routeId.toUpperCase());
    aliases.add(route.routeShortName.toUpperCase());
    const routeIdBase = routeBaseToken(route.routeId);
    const shortNameBase = routeBaseToken(route.routeShortName);
    if (routeIdBase) aliases.add(routeIdBase);
    if (shortNameBase) aliases.add(shortNameBase);
    if (route.routeLongName) aliases.add(route.routeLongName.toUpperCase());

    const base = shortNameBase ?? routeIdBase;
    if (base) {
      aliases.add(`${base} SBS`);
      aliases.add(`${base}-SBS`);
      routePatterns.push({ routeId: route.routeId, pattern: routePatternFromBase(base) });
    }

    routeIds.add(route.routeId);
    const aliasList = Array.from(aliases).filter((alias) => alias.length > 0);
    aliasesByRoute.set(route.routeId, aliasList);
    for (const alias of aliasList) {
      routeByAlias.set(alias, route.routeId);
    }
  }

  return { routeIds, aliasesByRoute, routeByAlias, routePatterns };
}

function slashedRouteMentions(text: string, index: RouteAliasIndex): Set<string> {
  const routeIds = new Set<string>();
  const pattern =
    /\b(BX|SIM|[MBQS])\s*(\d{1,3})\s*([A-Z])?\s*\/\s*(?:(BX|SIM|[MBQS])\s*)?(\d{1,3})?\s*([A-Z])?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const prefixA = match[1]?.toUpperCase();
    const numberA = match[2];
    const suffixA = match[3]?.toUpperCase() ?? "";
    const prefixB = match[4]?.toUpperCase() ?? prefixA;
    const numberB = match[5] ?? numberA;
    const suffixB = match[6]?.toUpperCase() ?? "";
    for (const token of [`${prefixA}${numberA}${suffixA}`, `${prefixB}${numberB}${suffixB}`]) {
      const routeId = index.routeByAlias.get(token);
      if (routeId) routeIds.add(routeId);
    }
  }
  return routeIds;
}

export function findRouteMentions(text: string, index: RouteAliasIndex): string[] {
  const routeIds = slashedRouteMentions(text, index);
  for (const routePattern of index.routePatterns) {
    if (routePattern.pattern.test(text)) {
      routeIds.add(routePattern.routeId);
    }
  }
  return Array.from(routeIds).sort();
}

const STREET_SUFFIX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bAVENUE\b/g, "AVENUE"],
  [/\bAVE\b/g, "AVENUE"],
  [/\bAV\b/g, "AVENUE"],
  [/\bSTREET\b/g, "STREET"],
  [/\bST\b/g, "STREET"],
  [/\bROAD\b/g, "ROAD"],
  [/\bRD\b/g, "ROAD"],
  [/\bBOULEVARD\b/g, "BOULEVARD"],
  [/\bBLVD\b/g, "BOULEVARD"],
  [/\bDRIVE\b/g, "DRIVE"],
  [/\bDR\b/g, "DRIVE"],
  [/\bPARKWAY\b/g, "PARKWAY"],
  [/\bPKWY\b/g, "PARKWAY"],
  [/\bPLACE\b/g, "PLACE"],
  [/\bPL\b/g, "PLACE"],
  [/\bLANE\b/g, "LANE"],
  [/\bLN\b/g, "LANE"],
  [/\bBROADWAY\b/g, "BROADWAY"],
];

export function normalizeStreetName(value: string): string {
  let normalized = upperCompact(value)
    .replace(/[.,;:()[\]{}]/g, " ")
    .replace(/&/g, " AND ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of STREET_SUFFIX_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function stripDirectionalPrefix(street: string): string {
  return street.replace(/^(EAST|WEST|NORTH|SOUTH|E|W|N|S)\s+/, "").trim();
}

function streetAliasesFromStopName(stopName: string): string[] {
  const [primaryRaw] = stopName.split("/");
  const primary = normalizeStreetName(primaryRaw ?? stopName);
  if (!primary) return [];
  const aliases = new Set<string>([primary, stripDirectionalPrefix(primary)]);
  return Array.from(aliases).filter((alias) => streetKeyLooksUseful(alias));
}

function streetKeyLooksUseful(street: string): boolean {
  if (street.length < 5) return false;
  if (street.split(" ").length === 1 && !street.includes("BROADWAY")) return false;
  return /\b(STREET|AVENUE|ROAD|BOULEVARD|DRIVE|PARKWAY|PLACE|LANE|BROADWAY)\b/.test(street);
}

export function buildStreetRouteGazetteer(stops: readonly RouteStopEntry[]): StreetRouteGazetteer {
  const streetRoutes = new Map<string, Map<string, StreetRouteCandidate>>();
  for (const stop of stops) {
    for (const street of streetAliasesFromStopName(stop.stopName)) {
      let routeMap = streetRoutes.get(street);
      if (!routeMap) {
        routeMap = new Map<string, StreetRouteCandidate>();
        streetRoutes.set(street, routeMap);
      }
      const existing = routeMap.get(stop.routeId);
      if (existing) {
        existing.stopCount += 1;
      } else {
        routeMap.set(stop.routeId, {
          routeId: stop.routeId,
          routeShortName: stop.routeShortName,
          stopCount: 1,
        });
      }
    }
  }

  const streetKeys = Array.from(streetRoutes.keys()).sort((a, b) => b.length - a.length);
  return { streetRoutes, streetKeys };
}

function findCorridorMatches(
  text: string,
  gazetteer: StreetRouteGazetteer,
): RouteResolutionEvidence[] {
  const normalizedText = normalizeStreetName(text);
  const matches: RouteResolutionEvidence[] = [];
  const seen = new Set<string>();
  for (const street of gazetteer.streetKeys) {
    if (!streetKeyAppearsInText(street, normalizedText)) continue;
    const routeMap = gazetteer.streetRoutes.get(street);
    if (!routeMap) continue;
    const candidates = Array.from(routeMap.values()).sort((a, b) => b.stopCount - a.stopCount);
    const matchedRoutes = candidates.map((candidate) => candidate.routeId);
    const key = `${street}|${matchedRoutes.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      kind: "corridor_street",
      matchedText: street,
      matchedRoutes,
      routeFanout: matchedRoutes.length,
    });
    if (matches.length >= 5) break;
  }
  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function streetKeyAppearsInText(street: string, normalizedText: string): boolean {
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(street)}([^A-Z0-9]|$)`).test(normalizedText);
}

function resolveRoutes(input: {
  event: DocumentDerivedEventSurface;
  routeAliasIndex: RouteAliasIndex;
  sourceRouteContext: Map<string, string[]>;
  gazetteer: StreetRouteGazetteer;
}): {
  tier: RouteResolutionTier;
  state: "resolved" | "ambiguous" | "unresolved";
  routeIds: string[];
  evidence: RouteResolutionEvidence[];
} {
  const eventText = textForEvent(input.event);
  const directRoutes = findRouteMentions(eventText, input.routeAliasIndex);
  if (directRoutes.length > 0) {
    return {
      tier: directRoutes.length <= 8 ? "direct_event_text" : "ambiguous_direct_event_text",
      state: directRoutes.length <= 8 ? "resolved" : "ambiguous",
      routeIds: directRoutes,
      evidence: [
        {
          kind: "route_text",
          matchedText: "event_text",
          matchedRoutes: directRoutes,
          routeFanout: directRoutes.length,
        },
      ],
    };
  }

  const sourceRoutes = input.sourceRouteContext.get(input.event.sourceId) ?? [];
  if (sourceRoutes.length === 1) {
    return {
      tier: "source_single_route_context",
      state: "resolved",
      routeIds: sourceRoutes,
      evidence: [
        {
          kind: "source_route_context",
          matchedText: input.event.sourceId,
          matchedRoutes: sourceRoutes,
          routeFanout: 1,
        },
      ],
    };
  }

  const corridorText = [
    input.event.locationText,
    input.event.displayLabel,
    input.event.treatmentText,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  const corridorMatches = findCorridorMatches(corridorText, input.gazetteer).sort(
    (a, b) => (a.routeFanout ?? 999) - (b.routeFanout ?? 999),
  );
  const bestCorridor = corridorMatches[0];
  if (bestCorridor) {
    const selectedRoutes = (bestCorridor.matchedRoutes ?? []).slice(0, 8).sort();
    const fanout = bestCorridor.routeFanout ?? selectedRoutes.length;
    return {
      tier: fanout <= 6 ? "corridor_gazetteer" : "ambiguous_corridor_gazetteer",
      state: fanout <= 6 ? "resolved" : "ambiguous",
      routeIds: selectedRoutes,
      evidence: corridorMatches,
    };
  }

  return {
    tier: "unresolved",
    state: "unresolved",
    routeIds: [],
    evidence: [],
  };
}

async function* readJsonl<T>(path: string): AsyncGenerator<T> {
  const stream = Bun.file(path).stream();
  const decoder = new TextDecoder();
  let carry = "";
  for await (const chunk of stream) {
    carry += decoder.decode(chunk, { stream: true });
    let newlineIndex = carry.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = carry.slice(0, newlineIndex).trim();
      carry = carry.slice(newlineIndex + 1);
      if (line.length > 0) yield JSON.parse(line) as T;
      newlineIndex = carry.indexOf("\n");
    }
  }
  carry += decoder.decode();
  const line = carry.trim();
  if (line.length > 0) yield JSON.parse(line) as T;
}

function latestRouteStopMonth(sqlite: Database): string | null {
  const row = sqlite
    .query<{ month: string | null }, []>("SELECT max(month) AS month FROM local_route_stop")
    .get();
  return row?.month ?? null;
}

function readRouteCatalog(sqlite: Database): RouteCatalogEntry[] {
  return sqlite
    .query<{ route_id: string; route_short_name: string; route_long_name: string | null }, []>(
      `SELECT route_id, route_short_name, route_long_name
         FROM local_route_catalog
        ORDER BY route_id`,
    )
    .all()
    .map((row) => ({
      routeId: row.route_id,
      routeShortName: row.route_short_name,
      routeLongName: row.route_long_name,
    }));
}

function readRouteStops(sqlite: Database, month: string | null): RouteStopEntry[] {
  const sql =
    month === null
      ? `SELECT route_id, route_short_name, stop_name
           FROM local_route_stop
          GROUP BY route_id, route_short_name, stop_name
          ORDER BY route_id, stop_name`
      : `SELECT route_id, route_short_name, stop_name
           FROM local_route_stop
          WHERE month = $month
          GROUP BY route_id, route_short_name, stop_name
          ORDER BY route_id, stop_name`;
  const rows =
    month === null
      ? sqlite
          .query<{ route_id: string; route_short_name: string; stop_name: string }, []>(sql)
          .all()
      : sqlite
          .query<
            { route_id: string; route_short_name: string; stop_name: string },
            { $month: string }
          >(sql)
          .all({ $month: month });
  return rows.map((row) => ({
    routeId: row.route_id,
    routeShortName: row.route_short_name,
    stopName: row.stop_name,
  }));
}

async function buildSourceRouteContext(
  entitiesPath: string,
  routeAliasIndex: RouteAliasIndex,
): Promise<Map<string, string[]>> {
  const routesBySource = new Map<string, Set<string>>();
  const file = Bun.file(entitiesPath);
  if (!(await file.exists())) return new Map();

  for await (const entity of readJsonl<DocumentDerivedEntitySurface>(entitiesPath)) {
    if (
      entity.entityMode !== "bus_route" &&
      entity.canonicalFamily !== "bus_route" &&
      !compact(entity.displayLabel).includes("bus route")
    ) {
      continue;
    }
    const routeMentions = findRouteMentions(entity.displayLabel ?? "", routeAliasIndex);
    if (routeMentions.length === 0) continue;
    let sourceSet = routesBySource.get(entity.sourceId);
    if (!sourceSet) {
      sourceSet = new Set<string>();
      routesBySource.set(entity.sourceId, sourceSet);
    }
    for (const routeId of routeMentions) sourceSet.add(routeId);
  }

  return new Map(
    Array.from(routesBySource.entries()).map(([sourceId, routes]) => [
      sourceId,
      Array.from(routes).sort(),
    ]),
  );
}

function eventRow(input: {
  event: DocumentDerivedEventSurface;
  classification: EventClassification;
  routeResolution: ReturnType<typeof resolveRoutes>;
}): EventRouteResolutionRow {
  const routeResolved = input.routeResolution.state === "resolved";
  const isInterventionCandidate =
    input.classification.timelineEligibility === "intervention_timeline_candidate";
  const promotable = isInterventionCandidate && routeResolved;
  const rawCandidate = input.event.rawCandidate ?? {};
  const rawStatusValue = rawCandidate["statusRaw"];
  const rawFamilyValue = rawCandidate["familyRaw"];
  const rawSubtypeValue = rawCandidate["subtypeRaw"];
  const operationalDate = classifyOperationalDate({
    statusRaw: typeof rawStatusValue === "string" ? rawStatusValue : null,
    dateText: input.event.dateText ?? null,
    datePrecision: input.event.datePrecision ?? null,
    eventKind: input.classification.eventKind,
    familyRaw:
      typeof rawFamilyValue === "string" ? rawFamilyValue : (input.event.eventFamily ?? null),
    subtypeRaw:
      typeof rawSubtypeValue === "string" ? rawSubtypeValue : (input.event.eventSubtype ?? null),
    eventName: input.event.eventName ?? null,
    eventStatus: input.event.eventStatus ?? null,
  });
  const promotionCaveats = [
    "document_claim_only_event: source text was not validated against a historical service record",
  ];
  switch (operationalDate.validationState) {
    case "source_stated_operational_date":
      promotionCaveats.push(
        "date_basis_source_stated_operational: trusting the official source operational date; historical GTFS is only an optional route/service exposure check",
      );
      break;
    case "source_stated_planned_date":
      promotionCaveats.push(
        "date_basis_source_stated_plan: source states a planned/scheduled date; confirm via historical GTFS exposure that the plan was realized",
      );
      break;
    case "operational_without_date":
    case "needs_review":
      promotionCaveats.push(
        "date_validation_needs_review: source operational-date signal is ambiguous or missing",
      );
      break;
    // non_operational_milestone: not a treatment-date event, so no date caveat.
  }
  if (input.routeResolution.tier === "source_single_route_context") {
    promotionCaveats.push(
      "route resolution came from source-level single-route context, not direct event text",
    );
  }
  if (input.routeResolution.tier === "corridor_gazetteer") {
    promotionCaveats.push("route resolution came from current-snapshot corridor gazetteer");
  }

  return {
    surfaceId: input.event.surfaceId,
    sourceId: input.event.sourceId,
    sourceTitle: input.event.sourceTitle ?? null,
    sourceGroup: input.event.sourceGroup ?? null,
    displayLabel: input.event.displayLabel ?? null,
    canonicalFamily: input.event.canonicalFamily ?? null,
    rawFamily: input.event.rawFamily ?? null,
    eventName: input.event.eventName ?? null,
    eventFamily: input.event.eventFamily ?? null,
    eventSubtype: input.event.eventSubtype ?? null,
    eventStatus: input.event.eventStatus ?? null,
    dateText: input.event.dateText ?? null,
    locationText: input.event.locationText ?? null,
    treatmentText: input.event.treatmentText ?? null,
    affectedEntitiesRaw: input.event.affectedEntitiesRaw ?? [],
    timelineEligibility: input.classification.timelineEligibility,
    eventKind: input.classification.eventKind,
    interventionFamily: input.classification.interventionFamily,
    classificationReasons: input.classification.reasons,
    routeResolutionTier: input.routeResolution.tier,
    routeResolutionState: input.routeResolution.state,
    routeIds: input.routeResolution.routeIds,
    routeCount: input.routeResolution.routeIds.length,
    routeResolutionEvidence: input.routeResolution.evidence,
    routeIdentityValidationState: routeResolved
      ? "confirmed_in_current_gtfs"
      : "unresolved_or_ambiguous",
    dateValidationState: operationalDate.validationState,
    promotableToRouteReviewQueue: promotable,
    promotionCaveats,
    evidenceRefs: input.event.evidenceRefs ?? [],
  };
}

function buildSummary(input: {
  rows: readonly EventRouteResolutionRow[];
  sourceRouteContextCount: number;
  streetGazetteerKeyCount: number;
  streetGazetteerRouteStopRows: number;
  currentGtfsRouteCount: number;
}): EventRouteResolutionSummary {
  const countsByTimelineEligibility: Record<string, number> = {};
  const countsByEventKind: Record<string, number> = {};
  const countsByInterventionFamily: Record<string, number> = {};
  const countsByRouteResolutionTier: Record<string, number> = {};
  const countsByDateValidationState: Record<string, number> = {};

  for (const row of input.rows) {
    addCount(countsByTimelineEligibility, row.timelineEligibility);
    addCount(countsByEventKind, row.eventKind);
    addCount(countsByInterventionFamily, row.interventionFamily);
    addCount(countsByRouteResolutionTier, row.routeResolutionTier);
    addCount(countsByDateValidationState, row.dateValidationState);
  }

  const interventionCandidates = input.rows.filter(
    (row) => row.timelineEligibility === "intervention_timeline_candidate",
  );

  return {
    inputEventCount: input.rows.length,
    interventionCandidateCount: interventionCandidates.length,
    routeResolvedEventCount: input.rows.filter((row) => row.routeResolutionState === "resolved")
      .length,
    routeResolvedInterventionCandidateCount: interventionCandidates.filter(
      (row) => row.routeResolutionState === "resolved",
    ).length,
    promotableToRouteReviewQueueCount: input.rows.filter((row) => row.promotableToRouteReviewQueue)
      .length,
    ambiguousInterventionCandidateCount: interventionCandidates.filter(
      (row) => row.routeResolutionState === "ambiguous",
    ).length,
    unresolvedInterventionCandidateCount: interventionCandidates.filter(
      (row) => row.routeResolutionState === "unresolved",
    ).length,
    sourceRouteContextCount: input.sourceRouteContextCount,
    streetGazetteerKeyCount: input.streetGazetteerKeyCount,
    streetGazetteerRouteStopRows: input.streetGazetteerRouteStopRows,
    currentGtfsRouteCount: input.currentGtfsRouteCount,
    countsByTimelineEligibility,
    countsByEventKind,
    countsByInterventionFamily,
    countsByRouteResolutionTier,
    countsByDateValidationState,
  };
}

function sampleRows(
  rows: readonly EventRouteResolutionRow[],
): EventRouteResolutionArtifact["samples"] {
  return {
    promotable: rows.filter((row) => row.promotableToRouteReviewQueue).slice(0, 20),
    ambiguous: rows.filter((row) => row.routeResolutionState === "ambiguous").slice(0, 20),
    unresolvedCandidates: rows
      .filter(
        (row) =>
          row.timelineEligibility === "intervention_timeline_candidate" &&
          row.routeResolutionState === "unresolved",
      )
      .slice(0, 20),
    processOnly: rows.filter((row) => row.timelineEligibility === "process_only").slice(0, 20),
  };
}

export async function runTier2DocumentEventRouteResolution(
  args: RunTier2DocumentEventRouteResolutionArgs,
): Promise<RunTier2DocumentEventRouteResolutionResult> {
  const eventsPath = args.eventsPath ?? join(args.surfacesDir, "events.jsonl");
  const entitiesPath = args.entitiesPath ?? join(args.surfacesDir, "entities.jsonl");
  const sqlite = new Database(args.dbPath, { readonly: true });
  let routeStopMonth: string | null = null;
  let routes: RouteCatalogEntry[] = [];
  let routeStops: RouteStopEntry[] = [];
  try {
    routeStopMonth = args.routeStopMonth ?? latestRouteStopMonth(sqlite);
    routes = readRouteCatalog(sqlite);
    routeStops = readRouteStops(sqlite, routeStopMonth);
  } finally {
    sqlite.close();
  }

  const routeAliasIndex = buildRouteAliasIndex(routes);
  const gazetteer = buildStreetRouteGazetteer(routeStops);
  const sourceRouteContext = await buildSourceRouteContext(entitiesPath, routeAliasIndex);

  const rows: EventRouteResolutionRow[] = [];
  for await (const event of readJsonl<DocumentDerivedEventSurface>(eventsPath)) {
    const classification = classifyTier2Event(event);
    const routeResolution = resolveRoutes({
      event,
      routeAliasIndex,
      sourceRouteContext,
      gazetteer,
    });
    rows.push(eventRow({ event, classification, routeResolution }));
  }

  const artifact: EventRouteResolutionArtifact = {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    sourceSurfacesPath: eventsPath,
    entitiesSurfacesPath: entitiesPath,
    localDbPath: args.dbPath,
    routeStopMonth,
    summary: buildSummary({
      rows,
      sourceRouteContextCount: sourceRouteContext.size,
      streetGazetteerKeyCount: gazetteer.streetKeys.length,
      streetGazetteerRouteStopRows: routeStops.length,
      currentGtfsRouteCount: routes.length,
    }),
    samples: sampleRows(rows),
    rows,
  };

  await mkdir(dirname(args.outputPath), { recursive: true });
  await writeJson(args.outputPath, artifact);

  return { outputPath: args.outputPath, artifact };
}

function parseCliOptions(args: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !flag.startsWith("--")) throw new Error(`Unknown argument: ${flag ?? ""}`);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    index += 1;
    switch (flag) {
      case "--artifact-root":
        parsed.artifactRoot = value;
        break;
      case "--run-id":
        parsed.runId = value;
        break;
      case "--surfaces-dir":
        parsed.surfacesDir = value;
        break;
      case "--events":
        parsed.eventsPath = value;
        break;
      case "--entities":
        parsed.entitiesPath = value;
        break;
      case "--output":
        parsed.outputPath = value;
        break;
      case "--db":
        parsed.dbPath = value;
        break;
      case "--route-stop-month":
        parsed.routeStopMonth = value;
        break;
      case "--generated-at":
        parsed.generatedAt = value;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return parsed;
}

export async function runTier2DocumentEventRouteResolutionFromCli(args: string[]) {
  const parsed = parseCliOptions(args);
  const artifactRoot = parsed.artifactRoot
    ? fromCliPath(parsed.artifactRoot)
    : defaultArtifactRootPath();
  const runId = parsed.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null && parsed.surfacesDir === undefined && parsed.eventsPath === undefined) {
    throw new Error("No Tier 2 run found. Pass --surfaces-dir or --run-id.");
  }
  const surfacesDir =
    parsed.surfacesDir !== undefined
      ? fromCliPath(parsed.surfacesDir)
      : join(runArtifactRoot(artifactRoot, runId ?? ""), DEFAULT_SURFACES_DIR);
  const outputPath =
    parsed.outputPath !== undefined
      ? fromCliPath(parsed.outputPath)
      : join(surfacesDir, DEFAULT_OUTPUT_FILENAME);
  return runTier2DocumentEventRouteResolution({
    surfacesDir,
    outputPath,
    dbPath: parsed.dbPath ? fromCliPath(parsed.dbPath) : defaultLocalPipelineDbPath(),
    ...(parsed.eventsPath ? { eventsPath: fromCliPath(parsed.eventsPath) } : {}),
    ...(parsed.entitiesPath ? { entitiesPath: fromCliPath(parsed.entitiesPath) } : {}),
    ...(parsed.routeStopMonth ? { routeStopMonth: parsed.routeStopMonth } : {}),
    ...(parsed.generatedAt ? { generatedAt: parsed.generatedAt } : {}),
  });
}
