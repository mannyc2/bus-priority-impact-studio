import type { LocalBusLane } from "@bp/db/local";
import type {
  ClaimCaveat as DomainClaimCaveat,
  ClaimEvidence as DomainClaimEvidence,
  StudioBrief as DomainStudioBrief,
  StudioAiPublicNote,
} from "@bp/domain/studio/briefs";
import type { StudioSpeedPercentileContext } from "@bp/domain/studio/docs";
import type { StudioFinding as DomainStudioFinding } from "@bp/domain/studio/findings";
import type { StudioIntervention as DomainStudioIntervention } from "@bp/domain/studio/interventions";
import type {
  StudioRoute as DomainStudioRoute,
  StudioSegment as DomainStudioSegment,
} from "@bp/domain/studio/routes";
import type { SocrataRow } from "@bp/sources/clients/socrata";

// The Studio release pipeline annotates the canonical domain Route/Segment/Brief
// shapes with additional provenance fields (lane source, TSP source-snapshot
// evidence, brief evidence-ref counts). These augmentations match the field set
// the v1 monolith produced; they live here so downstream files can import the
// extended shapes without a workspace-wide schema change.
export type StudioRoute = Omit<DomainStudioRoute, "tspCoverage" | "diagnosis" | "termini"> & {
  tspCoverage?: DomainStudioRoute["tspCoverage"];
  diagnosis?: DomainStudioRoute["diagnosis"];
  termini?: DomainStudioRoute["termini"];
  ridershipProfile: {
    peakRidershipWindow: RouteBriefRidershipWindow | null;
    topRidershipWindows: RouteBriefRidershipWindow[];
    slowCrowdedWindows: RouteBriefRidershipWindow[];
    hourlyBoardings: RouteBriefHourlyBoardings | null;
    topStopBoardings: RouteBriefTopStopBoardings;
  } | null;
  sparkMonths: string[];
  ridershipSpark: number[];
  ridershipSparkMonths: string[];
  speedPercentileContext: StudioSpeedPercentileContext;
  endpoints: { start: string; end: string };
  laneTypes: string[];
  laneOperatingHours: string[];
  laneOperatingDays: string[];
  laneCoverageSource: "dot_bus_lanes_geometry" | "geometry_unavailable";
  tspStatus: "installed" | "candidate" | "unknown";
  tspSource: "not_in_ingested_tsp_sources" | "nyc_dot_tsp_status_2017";
  tspSourceDate: string | null;
  tspSourceUrl: string | null;
  tspCorridor: string | null;
  tspMatchMethod:
    | "not_matched_in_ingested_sources"
    | "route_label_in_2017_status_snapshot"
    | "segment_endpoint_text_match"
    | "route_level_status_only";
};

export type StudioSegment = Omit<DomainStudioSegment, "aiNote" | "tsp"> & {
  tsp?: boolean;
  aiNote?: StudioAiPublicNote;
  laneSource: "dot_bus_lanes_geometry" | "geometry_unavailable";
  laneOverlapShare: number;
  laneMatchedCount: number;
  laneTypes: string[];
  laneOperatingHours: string[];
  laneOperatingDays: string[];
  tspStatus: "installed" | "candidate" | "unknown";
  tspSource: "not_in_ingested_tsp_sources" | "nyc_dot_tsp_status_2017";
  tspSourceDate: string | null;
  tspCorridor: string | null;
  tspMatchMethod:
    | "not_matched_in_ingested_sources"
    | "route_label_in_2017_status_snapshot"
    | "segment_endpoint_text_match"
    | "route_level_status_only";
};

// Studio brief evidence rows carry pipeline-internal source provenance fields
// (sourceRefId/sourceLabel/sourceHref + optional artifact triple). These are
// not part of the public ClaimEvidence schema but are written by the release
// builder for downstream audit and rendering.
export type StudioClaimEvidence = DomainClaimEvidence & {
  sourceRefId?: string;
  sourceLabel?: string;
  sourceHref?: string;
  sourceArtifactKey?: string;
  sourceArtifactHref?: string;
  sourceArtifactSha256?: string;
};

// Brief/finding caveats carry a pipeline-internal stable id used for claim
// caveatIds references.
export type StudioClaimCaveat = DomainClaimCaveat & {
  id: string;
};

export type StudioBrief = Omit<DomainStudioBrief, "evidence" | "caveats" | "citationCount"> & {
  evidence: StudioClaimEvidence[];
  caveats: StudioClaimCaveat[];
  citationCount?: number;
  evidenceRefCount?: number;
};

export type StudioFinding = Omit<DomainStudioFinding, "caveat"> & {
  caveat: DomainStudioFinding["caveat"] & { id: string };
};

// Studio interventions accept v1 manual-registry fields (timelineLayer,
// candidateId, sourceLinks, sourceSpanRefs, etc.) on top of the public domain
// shape. A few optional domain fields are widened to preserve exact-optional
// compatibility for JSON artifacts that may explicitly carry undefined while
// the release pipeline is still normalizing them.
export type StudioIntervention = Omit<
  DomainStudioIntervention,
  "comparisonCohort" | "sourceDetail" | "sourceLabel" | "tone"
> & {
  comparisonCohort?: DomainStudioIntervention["comparisonCohort"] | undefined;
  sourceDetail?: DomainStudioIntervention["sourceDetail"] | undefined;
  sourceLabel?: DomainStudioIntervention["sourceLabel"] | undefined;
  tone?: DomainStudioIntervention["tone"] | undefined;
  candidateId?: string;
  timelineLayer?:
    | "canonical_milestone"
    | "treatment_component"
    | "planned_or_proposed"
    | "evaluation";
  qualityTier?: string;
  status?: "implemented" | "planned" | "proposed" | "historical_context" | "defer";
  interventionType?: string;
  sourceSpanChunkIds?: string[];
  sourceSpanRefs?: Tier2DocumentChunkPreview[];
  sourceLinks?: Array<{ label: string; url: string }>;
};

export type ReleaseProfile = "demo" | "full";

export type FetchLike = typeof fetch;

export type SegmentNoteLlmOptions = {
  enabled: boolean;
  model: string;
  limit: number | null;
  maxTokens: number;
  timeoutMs: number;
  maxAttempts: number;
  apiKey: string | undefined;
  fetcher: FetchLike;
};

export type CliOptions = {
  month: string;
  outputPath: string;
  schemaPath: string;
  seedPath: string;
  routeLimit: number;
  findingLimit: number;
  reviewQueuePath: string;
  promotedFindingsPath: string;
  contextAppendixPath: string;
  routeSliceArtifactsRoot: string;
  routeSliceRawRoot: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
  tspSourcePath: string;
  tier2DocumentChunksPath: string;
  manualInterventionsPath: string;
  publishableInterventionsByRoutePath: string | null;
  localDbPath: string;
  profile: ReleaseProfile;
  segmentNoteLlm: SegmentNoteLlmOptions;
};

export type RouteBriefRidershipWindow = {
  dayOfWeek: string;
  hourOfDay: number;
  ridership: number;
  transfers: number;
  matchedObservationCount: number;
  busTripCount: number;
  weightedAverageSpeedMph: number | null;
  slowObservationShare: number | null;
};

export type RouteBriefHourlyBoardingBin = {
  hourOfDay: number;
  boardings: number;
  transfers: number;
  serviceDayCount: number;
};

export type RouteBriefHourlyBoardings = {
  sourceId: string;
  sourceLabel: string;
  window: string;
  dayType: "weekday_average";
  bins: RouteBriefHourlyBoardingBin[];
};

export type RouteBriefTopStopBoardings = {
  coverage: "available" | "not_available";
  sourceId: string | null;
  sourceLabel: string | null;
  window: string | null;
  unavailableReason: string | null;
  stops: Array<{
    rank: number;
    stopId: string;
    stopName: string;
    direction: "NB" | "SB" | "EB" | "WB" | null;
    averageDailyBoardings: number;
  }>;
};

// The artifact stores the same hourly passenger delay shape as the applied
// research route-brief model produces and the StudioRouteSegmentEvidence schema
// accepts. Re-export the schema-derived type so downstream consumers stay aligned.
export type { RouteBriefHourlyPassengerDelay } from "@bp/applied-research/route-briefs";

import type { RouteBriefHourlyPassengerDelay as _RouteBriefHourlyPassengerDelay } from "@bp/applied-research/route-briefs";

export type RouteBriefSegment = {
  segmentId: string;
  direction: string;
  from?: string;
  to?: string;
  weightedAverageSpeedMph?: number;
  weightedAverageTravelTimeMinutes?: number;
  averageRoadDistanceMiles?: number;
  slowWindowPercent?: number;
  ridershipExposure?: number | null;
  hotspotScore?: number;
  riderImpactScore?: number | null;
  stopOrder?: number;
  observationCount?: number;
  busTripCount?: number;
  hourlySlowWindowBins?: number[];
  hourlyPassengerDelay?: _RouteBriefHourlyPassengerDelay[];
  stopBoardings?: null;
  segmentBoardings?: null;
};

export type RouteBriefInputArtifact = {
  metrics?: {
    routeScore?: number;
    averageSpeedMph?: number;
    hotspotCount?: number;
    totalRidership?: number;
    segmentCount?: number;
    scheduledPairCount?: number;
    scheduleMatchedHotspotCount?: number;
  };
  analysisPeriod?: string;
  segmentUniverse?: {
    grain?: "all_observed_timepoint_segments";
    segmentCount?: number;
    source?: "mta_bus_segment_speeds";
    ridershipDenominator?: "average_service_day_route_hourly_ridership";
    serviceDayRidershipCoverage?: "available";
    stopBoardingsCoverage?: "not_available";
    segmentBoardingsCoverage?: "not_available";
    hourlyRiderDelayCoverage?: "available";
    caveats?: string[];
  };
  ridershipProfile?: {
    peakRidershipWindow?: RouteBriefRidershipWindow | null;
    topRidershipWindows?: RouteBriefRidershipWindow[];
    slowCrowdedWindows?: RouteBriefRidershipWindow[];
    hourlyBoardings?: RouteBriefHourlyBoardings | null;
    topStopBoardings?: RouteBriefTopStopBoardings;
  };
  interventionStatus?: {
    aceActiveDuringAnalysisPeriod?: boolean;
    aceViolationCount?: number;
    busLaneMatchedLaneCount?: number;
  };
  segments?: RouteBriefSegment[];
  topSegments?: RouteBriefSegment[];
  scheduleComparisons?: Array<{
    segmentId: string;
    direction: string;
    from?: string;
    to?: string;
    observedTravelTimeMinutes?: number;
    scheduledMedianTravelTimeMinutes?: number | null;
    observedMinusScheduledMinutes?: number | null;
    scheduledSampleCount?: number;
    observedBusTripCount?: number;
    observedSpeedMph?: number;
    hotspotScore?: number;
    riderImpactScore?: number | null;
  }>;
  caveats?: string[];
};

export type RouteBriefTopSegment = NonNullable<RouteBriefInputArtifact["topSegments"]>[number];
export type RouteBriefScheduleComparison = NonNullable<
  RouteBriefInputArtifact["scheduleComparisons"]
>[number];

export type RawSourceSnapshot = {
  rows?: SocrataRow[];
};

export type RawTspSourceMetadata = {
  sourceId?: string;
  title?: string;
  sourceUrl?: string;
  documentDate?: string;
  finalUrl?: string;
  textArtifactKey?: string;
};

export type Tier2DocumentChunkPreview = {
  chunkId: string;
  pageRefs: number[];
  excerpt: string;
};

export type Tier2DocumentChunkIndex = ReadonlyMap<string, Tier2DocumentChunkPreview>;

// Subset of the Tier 2 document chunk artifact we care about (inlined here
// until tools/pipeline-v2 ports docs/tier2-docs.ts; see Batch D task #13).
export type Tier2DocumentChunksArtifact = {
  chunks: Array<{
    chunkId: string;
    pageRefs: number[];
    excerpt: string;
  }>;
};

export type Tier2ManualInterventionEvidence = {
  evidenceId: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl?: string;
  artifactKey?: string;
  pageRefs: number[];
  chunkIds: string[];
  excerpt: string;
  supports: string[];
};

export type Tier2ManualInterventionComponent = {
  componentId: string;
  componentType: string;
  status: "implemented" | "planned" | "proposed" | "historical_context";
  description: string;
  extent: {
    corridor: string | null;
    from: string | null;
    to: string | null;
  };
  details: Record<string, unknown>;
  evidenceRefs: string[];
};

export type Tier2ManualInterventionCandidate = {
  candidateId: string;
  reviewState: "manual_curated";
  qualityTier:
    | "canonical_milestone"
    | "implemented_treatment_component"
    | "planned_or_proposed"
    | "historical_context"
    | "supporting_duplicate"
    | "defer";
  canonicalName: string;
  status: "implemented" | "planned" | "proposed" | "historical_context" | "defer";
  program: string;
  interventionType: string;
  implementationDate?: string;
  dateUnknownReason?: string;
  datePrecision?: "day" | "month" | "year";
  dateRole: string;
  dateRangeEnd?: string;
  routesAffected?: string[];
  routeUnknownReason?: string;
  routeRoles: Array<{ routeId: string; role: "affected" | "comparison" | "context" | "unknown" }>;
  location: {
    borough: string | null;
    corridor: string | null;
    from: string | null;
    to: string | null;
    directionality: string[];
    notes: string | null;
  };
  locationUnknownReason?: string;
  components: Tier2ManualInterventionComponent[];
  evidence: Tier2ManualInterventionEvidence[];
  sourceEventIds: string[];
  sourceCandidateIds: string[];
};

export type Tier2ManualInterventionCandidatesArtifact = {
  candidates: Tier2ManualInterventionCandidate[];
};

export type Coordinate = {
  longitude: number;
  latitude: number;
};

export type RouteGeometrySummary = {
  miles: number;
  endpoints: {
    start: string;
    end: string;
  };
  laneCoverage: number;
  laneCoverageSource: StudioRoute["laneCoverageSource"];
  laneTypes: string[];
  laneOperatingHours: string[];
  laneOperatingDays: string[];
};

export type RouteShapePath = {
  routeId: string;
  direction: string;
  shapeId: string;
  coordinates: Coordinate[];
};

export type Projection = {
  coordinate: Coordinate;
  distanceAlongMeters: number;
  distanceToLineMeters: number;
  segmentIndex: number;
};

export type SegmentLaneOverlap = {
  lane: StudioSegment["lane"];
  laneSource: "dot_bus_lanes_geometry" | "geometry_unavailable";
  laneOverlapShare: number;
  laneMatchedCount: number;
  laneTypes: string[];
  laneOperatingHours: string[];
  laneOperatingDays: string[];
  segmentGeometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  } | null;
};

export type TspEvidence = {
  tspStatus: StudioRoute["tspStatus"];
  tspSource: StudioRoute["tspSource"];
  tspSourceDate: string | null;
  tspSourceUrl: string | null;
  tspCorridor: string | null;
  tspMatchMethod: StudioRoute["tspMatchMethod"];
  streetMatchers: string[];
};

export type SegmentEndpoints = {
  from: Coordinate;
  to: Coordinate;
};

export type BBox = {
  latitudeMin: number;
  latitudeMax: number;
  longitudeMin: number;
  longitudeMax: number;
};

export type BusLanePath = {
  segmentId: string;
  laneType: string | null;
  hours: string | null;
  days: string | null;
  coordinates: Coordinate[];
  bbox: BBox;
};

export type SpeedPercentileResult = StudioSpeedPercentileContext & { percentile: number };

export type ReviewQueueCandidate = {
  candidateId: string;
  detectorId: string;
  routeId: string | null;
  reasonCode: string;
  category: string;
  severity: string;
  confidence: string;
  detectorScore: number;
  claimSafeLabel?: import("@bp/domain/studio/findings").StudioFindingReview["claimSafeLabel"];
  claimText: string;
  reviewState?: import("@bp/domain/studio/findings").StudioFindingReview["reviewState"];
  evidenceRefCount?: number;
  evidenceRefs?: string[];
};

export type ReviewQueueArtifact = {
  artifactKind?: string;
  candidates?: ReviewQueueCandidate[];
};

export type FindingContextAppendixRoute = {
  routeId?: string;
  weatherReliability?: unknown;
  equity?: unknown;
  trafficVolume?: unknown;
  currentTrafficSpeed?: unknown;
};

export type FindingContextAppendixArtifact = {
  artifactKind?: string;
  weather?: unknown;
  routes?: FindingContextAppendixRoute[];
};

export type SegmentAnalystNoteRecord = {
  routeSlug: string;
  segmentId: string;
  note: import("@bp/domain/studio/briefs").StudioAiAnalystNote;
};

export type SegmentAnalystNotesArtifact = {
  schemaVersion: 1;
  generatedAt: string;
  notes: SegmentAnalystNoteRecord[];
};

// Re-export LocalBusLane so geometry helpers don't import @bp/db/local directly.
export type { LocalBusLane };
