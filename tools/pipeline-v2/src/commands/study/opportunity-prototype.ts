import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  buildRouteSpeedSpineCrosswalk,
  serializeStudioSegmentId,
} from "@bp/analytics/feature-history";
import { decodeStrict } from "@bp/domain/decode";
import { type StudioInterventionCorpus, StudioInterventionCorpusSchema } from "@bp/domain/studio";
import {
  type StudyArtifact,
  StudyArtifactSchema,
  StudyIndexArtifactSchema,
  StudyReviewInputsArtifactV1Schema,
  type StudyTreatmentFamily,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { runPipelineFileSystemBoundary } from "../../effect/file-system.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { SqlNumberSchema } from "../../lib/local-db-aggregates/sqlite-schema.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import { loadRouteSpeedSpineCrosswalk } from "../../lib/route-speed-spine-crosswalk.ts";
import {
  apportionRouteRidershipByTripTime,
  buildBoroughLengthBenchmarks,
  buildOpportunityTransfers,
  comparableLengthBand,
  type OpportunityTransfer,
  rankOpportunities,
} from "../../lib/study-engine/opportunity.ts";

const COMMAND = "study.opportunity-prototype";
const EXPECTED_STUDY_COUNT = 9;
const READY_SPINE_STATES = new Set(["series_ready", "series_ready_with_gaps"]);
const POSITIVE_TREATMENT_STATES = new Set([
  "current_confirmed",
  "implemented",
  "historical_confirmed",
  "planned",
  "proposed",
  "under_consideration",
  "candidate",
]);

const IsoMonthSchema = Schema.String.check(Schema.isPattern(/^\d{4}-(?:0[1-9]|1[0-2])$/u));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const FiniteNumberSchema = Schema.Number.check(
  Schema.makeFilter((value) => Number.isFinite(value), { message: "Expected finite number" }),
);
const SpineReadinessSchema = Schema.Literals([
  "series_ready",
  "series_ready_with_gaps",
  "needs_pattern_review",
  "failed",
]);

const SpineManifestRouteSchema = Schema.Struct({
  routeId: Schema.String,
  routeSlug: Schema.String,
  inCurrentCatalog: Schema.Boolean,
  readiness: SpineReadinessSchema,
  reasons: Schema.Array(Schema.String),
  artifactPath: Schema.String,
  artifactWritten: Schema.Boolean,
  monthCount: NonNegativeIntegerSchema,
  sourceRowCount: NonNegativeIntegerSchema,
  busTripCount: NonNegativeIntegerSchema,
  nodeCount: NonNegativeIntegerSchema,
  spineSegmentCount: NonNegativeIntegerSchema,
  rawSegmentKeyCount: NonNegativeIntegerSchema,
  rawStopPairCount: NonNegativeIntegerSchema,
  coverage: Schema.Struct({
    minCoverageShare: FiniteNumberSchema,
    meanCoverageShare: FiniteNumberSchema,
    fullCoverageMonthCount: NonNegativeIntegerSchema,
    partialCoverageMonthCount: NonNegativeIntegerSchema,
    partialCoverageMonthShare: FiniteNumberSchema,
    rawKeyDriftMonthCount: NonNegativeIntegerSchema,
    rawKeyDriftMonthShare: FiniteNumberSchema,
  }),
  validationStatus: Schema.Literals(["pass", "warn", "fail"]),
  issueCount: NonNegativeIntegerSchema,
});

const SpineManifestSchema = Schema.Struct({
  artifactKind: Schema.Literal("studio_route_speed_spine_manifest"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  source: Schema.Struct({
    table: Schema.Literal("local_route_segment_speed"),
    dbPath: Schema.String,
    startMonth: IsoMonthSchema,
    endMonth: Schema.NullOr(IsoMonthSchema),
    toleranceMeters: FiniteNumberSchema,
    artifactRoot: Schema.String,
    manifestPath: Schema.String,
    routeUniverse: Schema.Literal("local_route_segment_speed_distinct_routes"),
  }),
  summary: Schema.Struct({
    candidateRouteCount: NonNegativeIntegerSchema,
    routeCount: NonNegativeIntegerSchema,
    currentCatalogRouteCount: NonNegativeIntegerSchema,
    speedRouteNotInCurrentCatalogCount: NonNegativeIntegerSchema,
    currentCatalogRouteMissingSpeedCount: NonNegativeIntegerSchema,
    artifactWrittenRouteCount: NonNegativeIntegerSchema,
    seriesReadyRouteCount: NonNegativeIntegerSchema,
    seriesReadyWithGapsRouteCount: NonNegativeIntegerSchema,
    needsPatternReviewRouteCount: NonNegativeIntegerSchema,
    failedRouteCount: NonNegativeIntegerSchema,
  }),
  routes: Schema.Array(SpineManifestRouteSchema),
});

const TreatmentStatusSchema = Schema.Literals([
  "current_confirmed",
  "implemented",
  "historical_confirmed",
  "planned",
  "proposed",
  "under_consideration",
  "candidate",
  "source_gap",
  "not_found",
  "not_applicable",
]);
const TreatmentTypeSchema = Schema.Literals([
  "bus_lane",
  "busway",
  "automated_bus_lane_enforcement",
  "transit_signal_priority",
  "select_bus_service",
  "queue_jump",
  "stop_change",
  "route_redesign",
  "all_door_boarding",
  "off_board_fare_collection",
  "capital_project_milestone",
  "custom_treatment",
]);
const TreatmentRowSchema = Schema.Struct({
  routeId: Schema.String,
  month: IsoMonthSchema,
  treatmentType: TreatmentTypeSchema,
  rawTreatmentType: Schema.NullOr(Schema.String),
  status: TreatmentStatusSchema,
  statusAsOf: Schema.NullOr(Schema.String),
  effectiveDate: Schema.NullOr(Schema.String),
  datePrecision: Schema.Literals(["day", "month", "season", "year", "range", "unknown"]),
  geographyScope: Schema.Literals(["route", "corridor", "segment", "intersection", "source_only"]),
  sourceRefs: Schema.Array(Schema.String),
  evidenceLabel: Schema.Literals([
    "deterministic_source",
    "reviewed_document",
    "historical_snapshot",
    "aggregate_source_gap",
    "candidate_inferred",
    "not_found",
  ]),
  confidence: Schema.Literals(["high", "medium", "low"]),
  caveats: Schema.Array(Schema.String),
  methodLimitations: Schema.Array(Schema.String),
  relatedEventIds: Schema.Array(Schema.String),
});
const SegmentTreatmentRowSchema = Schema.Struct({
  ...TreatmentRowSchema.fields,
  segmentId: Schema.String,
  directionId: Schema.NullOr(Schema.String),
  segmentOrder: Schema.NullOr(FiniteNumberSchema),
  matchMethod: Schema.Literals([
    "route_level",
    "route_shape_overlap",
    "segment_endpoint_text_match",
    "intersection_geometry",
    "source_only",
    "not_matched",
  ]),
  overlapShare: Schema.NullOr(FiniteNumberSchema),
  laneTypes: Schema.Array(Schema.String),
});
const SourceGapRowSchema = Schema.Struct({
  routeId: Schema.NullOr(Schema.String),
  month: IsoMonthSchema,
  treatmentType: TreatmentTypeSchema,
  gapKind: Schema.Literals([
    "current_inventory_missing",
    "implementation_date_missing",
    "route_mapping_missing",
    "intersection_geometry_missing",
    "evaluation_missing",
    "status_currentness_unknown",
  ]),
  sourceRefs: Schema.Array(Schema.String),
  publicStatement: Schema.String,
  blocksClaims: Schema.Array(Schema.String),
});
const TreatmentSummarySchema = Schema.Struct({
  artifactKind: Schema.Literal("route_treatment_summary"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  month: IsoMonthSchema,
  source: Schema.Struct({
    dbPath: Schema.String,
    artifactPath: Schema.String,
    summaryPath: Schema.NullOr(Schema.String),
    routeUniverse: Schema.Literal("local_route_catalog"),
    checkedTreatmentTypes: Schema.Array(TreatmentTypeSchema),
    localMissingTables: Schema.Array(Schema.String),
    inputs: Schema.Struct({
      routeCatalogRowCount: NonNegativeIntegerSchema,
      sourceEvidenceRowCount: NonNegativeIntegerSchema,
      sourceGapRowCount: NonNegativeIntegerSchema,
      segmentUniverseRowCount: NonNegativeIntegerSchema,
      segmentTreatmentRowCount: NonNegativeIntegerSchema,
      publishableInterventionCount: NonNegativeIntegerSchema,
    }),
  }),
  summary: Schema.Struct({
    routeCount: NonNegativeIntegerSchema,
    checkedTreatmentTypeCount: NonNegativeIntegerSchema,
    routeTreatmentRowCount: NonNegativeIntegerSchema,
    routeTreatmentCoverageShare: FiniteNumberSchema,
    routeWithPositiveEvidenceCount: NonNegativeIntegerSchema,
    routeWithSourceGapCount: NonNegativeIntegerSchema,
    segmentTreatmentRowCount: NonNegativeIntegerSchema,
    sourceGapRowCount: NonNegativeIntegerSchema,
    statusCounts: Schema.Record(Schema.String, NonNegativeIntegerSchema),
    treatmentTypeCounts: Schema.Record(Schema.String, NonNegativeIntegerSchema),
    evidenceLabelCounts: Schema.Record(Schema.String, NonNegativeIntegerSchema),
    confidenceCounts: Schema.Record(Schema.String, NonNegativeIntegerSchema),
  }),
  routeTreatmentRows: Schema.Array(TreatmentRowSchema),
  segmentTreatmentRows: Schema.Array(SegmentTreatmentRowSchema),
  sourceGapRows: Schema.Array(SourceGapRowSchema),
  validation: Schema.Struct({
    status: Schema.Literals(["pass", "warn", "fail"]),
    issues: Schema.Array(
      Schema.Struct({
        severity: Schema.Literals(["info", "warn", "fail"]),
        code: Schema.String,
        message: Schema.String,
      }),
    ),
  }),
});

const SegmentSqlRowSchema = Schema.Struct({
  route_id: Schema.String,
  direction: Schema.String,
  stop_order: SqlNumberSchema,
  from_stop_id: Schema.String,
  to_stop_id: Schema.String,
  borough: Schema.String,
  average_speed_mph: SqlNumberSchema,
  average_trip_time_minutes: SqlNumberSchema,
  average_distance_miles: SqlNumberSchema,
  bus_trip_count: SqlNumberSchema,
});
const RidershipSqlRowSchema = Schema.Struct({
  route_id: Schema.String,
  ridership: SqlNumberSchema,
});

type SpineManifest = typeof SpineManifestSchema.Type;
type TreatmentSummary = typeof TreatmentSummarySchema.Type;
type SegmentSqlRow = typeof SegmentSqlRowSchema.Type;

type ScoringSegment = {
  readonly routeId: string;
  readonly borough: string;
  readonly sourceSegmentId: string;
  readonly spineSegmentId: string;
  readonly direction: string;
  readonly stopOrder: number;
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly lengthMiles: number;
  readonly speedMph: number;
  readonly tripTimeMinutes: number;
  readonly busTripCount: number;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileReceipt(path: string): Promise<{ sha256: string; byteCount: number }> {
  const [bytes, metadata] = await Promise.all([readFile(path), stat(path)]);
  if (!metadata.isFile()) throw new Error(`Opportunity input is not a file: ${path}`);
  return { sha256: sha256(bytes), byteCount: metadata.size };
}

function resolveManifestArtifactPath(manifest: SpineManifest, artifactPath: string): string {
  if (isAbsolute(artifactPath)) return artifactPath;
  if (isAbsolute(manifest.source.artifactRoot)) {
    return resolve(manifest.source.artifactRoot, artifactPath);
  }
  return resolve(artifactPath);
}

function studyPath(indexPath: string, eventKey: string): string {
  return join(dirname(indexPath), `${eventKey}.json`);
}

async function loadAndValidateStudies(input: {
  analysisMonth: string;
  indexPath: string;
  reviewInputsPath: string;
  spineManifestPath: string;
}): Promise<{
  index: typeof StudyIndexArtifactSchema.Type;
  studies: readonly StudyArtifact[];
  reviewInputs: typeof StudyReviewInputsArtifactV1Schema.Type;
  manifest: SpineManifest;
  candidateSetId: string;
  reviewCutId: string;
}> {
  const [index, reviewInputs, manifest] = await Promise.all([
    readJsonArtifact(input.indexPath, StudyIndexArtifactSchema, "strict"),
    readJsonArtifact(input.reviewInputsPath, StudyReviewInputsArtifactV1Schema, "strict"),
    readJsonArtifact(input.spineManifestPath, SpineManifestSchema, "strict"),
  ]);
  if (index.studies.length !== EXPECTED_STUDY_COUNT) {
    throw new Error(
      `Complete opportunity cut requires exactly 9 studies; received ${index.studies.length}`,
    );
  }
  if (
    index.analysisMonth !== input.analysisMonth ||
    reviewInputs.analysisMonth !== input.analysisMonth ||
    reviewInputs.speedSpineSnapshot.endMonth !== input.analysisMonth ||
    manifest.source.endMonth !== input.analysisMonth
  ) {
    throw new Error("Opportunity inputs do not share the requested analysis month");
  }
  const reviewCutId = index.reviewCutId;
  if (reviewCutId === undefined) throw new Error("Opportunity prototype requires a v4 review cut");
  const manifestReceipt = await fileReceipt(input.spineManifestPath);
  if (
    manifestReceipt.sha256 !== reviewInputs.speedSpineSnapshot.manifest.sha256 ||
    manifestReceipt.byteCount !== reviewInputs.speedSpineSnapshot.manifest.byteCount
  ) {
    throw new Error("Speed-spine manifest does not match the immutable review input receipt");
  }
  if (
    manifest.summary.routeCount !== manifest.routes.length ||
    manifest.summary.artifactWrittenRouteCount !== manifest.routes.length ||
    manifest.routes.some((route) => !route.artifactWritten)
  ) {
    throw new Error("Speed-spine manifest is incomplete");
  }
  const reviewRoutes = new Map(
    reviewInputs.speedSpineSnapshot.routes.map((route) => [route.routeId, route]),
  );
  if (
    reviewInputs.speedSpineSnapshot.routeCount !== manifest.routes.length ||
    reviewRoutes.size !== manifest.routes.length
  ) {
    throw new Error("Review-input spine universe does not match the manifest");
  }
  const manifestPathSet = new Set<string>();
  for (const route of manifest.routes) {
    const reviewRoute = reviewRoutes.get(route.routeId);
    if (reviewRoute === undefined || reviewRoute.readiness !== route.readiness) {
      throw new Error(`Spine readiness mismatch for ${route.routeId}`);
    }
    manifestPathSet.add(resolveManifestArtifactPath(manifest, route.artifactPath));
  }
  const eventKeys = new Set<string>();
  const indexRows = new Map<string, (typeof index.studies)[number]>();
  for (const row of index.studies) {
    if (eventKeys.has(row.eventKey)) throw new Error(`Duplicate study index event ${row.eventKey}`);
    eventKeys.add(row.eventKey);
    indexRows.set(row.eventKey, row);
  }
  const studies = await Promise.all(
    index.studies.map((row) =>
      readJsonArtifact(studyPath(input.indexPath, row.eventKey), StudyArtifactSchema, "strict"),
    ),
  );
  const candidateSetIds = new Set<string>();
  const candidateIds = new Set<string>();
  for (const study of studies) {
    const row = indexRows.get(study.eventKey);
    if (
      row === undefined ||
      row.routeId !== study.routeId ||
      row.routeSlug !== study.routeSlug ||
      row.treatmentFamily !== study.treatmentFamily ||
      row.implementationMonth !== study.implementationMonth ||
      row.claimTier !== study.claimTier ||
      row.direction !== study.direction ||
      row.evaluationLevel !== study.evaluationLevel ||
      row.effectMph !== study.variants.allDay.effectMph
    ) {
      throw new Error(`Study artifact does not match index row ${study.eventKey}`);
    }
    if (
      study.reviewCutId !== reviewCutId ||
      study.provenance.analysisMonth !== input.analysisMonth ||
      study.provenance.engineVersion !== reviewInputs.engineVersion
    ) {
      throw new Error(`Study review-cut provenance mismatch for ${study.eventKey}`);
    }
    if (study.treatedSegmentScope === "all_route_spines_lane_fallback") {
      throw new Error(`Study ${study.eventKey} used a forbidden lane fallback`);
    }
    if (candidateIds.has(study.candidateId)) {
      throw new Error(`Duplicate study candidate ${study.candidateId}`);
    }
    candidateIds.add(study.candidateId);
    candidateSetIds.add(study.candidateSetId);
    for (const path of study.provenance.speedSpineArtifactPaths) {
      if (!manifestPathSet.has(resolve(path))) {
        throw new Error(`Study ${study.eventKey} references a spine outside the pinned manifest`);
      }
    }
  }
  if (candidateSetIds.size !== 1) throw new Error("Study artifacts mix candidate universes");
  const candidateSetId = [...candidateSetIds][0];
  if (
    candidateSetId === undefined ||
    candidateSetId !== reviewInputs.physicalScopeSnapshot.candidateSetId
  ) {
    throw new Error("Study candidate universe does not match the review input receipt");
  }
  for (const study of studies) {
    const spine = await validateAndLoadSpine({
      manifest,
      reviewInputs,
      routeId: study.routeId,
    });
    if (spine === null) {
      throw new Error(`Study treatment route ${study.routeId} has no ready pinned spine`);
    }
    const spineSegmentIds = new Set(spine.artifact.segments.map((segment) => segment.segmentId));
    for (const treatedSegmentId of study.treatedSpineSegmentIds) {
      if (!spineSegmentIds.has(treatedSegmentId)) {
        throw new Error(
          `Study ${study.eventKey} treatment segment ${treatedSegmentId} is outside its pinned spine`,
        );
      }
    }
  }
  return { index, studies, reviewInputs, manifest, candidateSetId, reviewCutId };
}

async function validateAndLoadSpine(input: {
  manifest: SpineManifest;
  reviewInputs: typeof StudyReviewInputsArtifactV1Schema.Type;
  routeId: string;
}) {
  const manifestRoute = input.manifest.routes.find((route) => route.routeId === input.routeId);
  const reviewRoute = input.reviewInputs.speedSpineSnapshot.routes.find(
    (route) => route.routeId === input.routeId,
  );
  if (manifestRoute === undefined || reviewRoute === undefined) return null;
  if (!READY_SPINE_STATES.has(manifestRoute.readiness)) return null;
  const path = resolveManifestArtifactPath(input.manifest, manifestRoute.artifactPath);
  const receipt = await fileReceipt(path);
  if (
    receipt.sha256 !== reviewRoute.artifact.sha256 ||
    receipt.byteCount !== reviewRoute.artifact.byteCount
  ) {
    throw new Error(`Route spine ${input.routeId} does not match the review receipt`);
  }
  const loaded = await loadRouteSpeedSpineCrosswalk({
    artifactRoot: input.manifest.source.artifactRoot,
    routeId: input.routeId,
    spinePath: path,
    requireSpine: true,
  });
  if (loaded.status !== "ready" || loaded.audit.readiness !== manifestRoute.readiness) {
    throw new Error(`Route spine readiness changed for ${input.routeId}`);
  }
  return loaded;
}

function loadSegmentRows(
  local: OpenLocalPipelineDb,
  analysisMonth: string,
): readonly SegmentSqlRow[] {
  return decodeStrict(Schema.Array(SegmentSqlRowSchema))(
    local.sqlite
      .query(
        `SELECT route_id, direction, stop_order, timepoint_stop_id AS from_stop_id,
                next_timepoint_stop_id AS to_stop_id, borough,
                SUM(average_road_speed_mph * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
                  AS average_speed_mph,
                SUM(average_travel_time_minutes * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
                  AS average_trip_time_minutes,
                SUM(road_distance_miles * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
                  AS average_distance_miles,
                SUM(bus_trip_count) AS bus_trip_count
         FROM local_route_segment_speed
         WHERE month = ? AND bus_trip_count > 0
         GROUP BY route_id, direction, stop_order, timepoint_stop_id, next_timepoint_stop_id, borough
         ORDER BY route_id, direction, stop_order, timepoint_stop_id, next_timepoint_stop_id, borough`,
      )
      .all(analysisMonth),
  );
}

function loadRouteRidership(
  local: OpenLocalPipelineDb,
  analysisMonth: string,
): ReadonlyMap<string, number> {
  const rows = decodeStrict(Schema.Array(RidershipSqlRowSchema))(
    local.sqlite
      .query(
        `SELECT route_id, SUM(ridership) AS ridership
         FROM local_route_hourly_ridership
         WHERE month = ?
         GROUP BY route_id ORDER BY route_id`,
      )
      .all(analysisMonth),
  );
  return new Map(rows.map((row) => [row.route_id, row.ridership]));
}

function routeTreatmentState(
  artifact: TreatmentSummary,
  routeId: string,
  treatmentFamily: StudyTreatmentFamily,
): "treated" | "unknown" | "not_applicable" {
  const rows = artifact.routeTreatmentRows.filter(
    (row) => row.routeId === routeId && row.treatmentType === treatmentFamily,
  );
  if (rows.length !== 1) return "unknown";
  const row = rows[0];
  if (row === undefined) return "unknown";
  if (POSITIVE_TREATMENT_STATES.has(row.status)) return "treated";
  if (row.status === "not_applicable") return "not_applicable";
  return "unknown";
}

function segmentTreatmentState(
  artifact: TreatmentSummary,
  corpusTreatmentPresence: ReadonlySet<string>,
  segment: ScoringSegment,
  treatmentFamily: StudyTreatmentFamily,
): "treated" | "unknown" | "not_applicable" {
  if (corpusTreatmentPresence.has(`${segment.routeId}|${treatmentFamily}`)) return "treated";
  if (treatmentFamily !== "bus_lane") {
    return routeTreatmentState(artifact, segment.routeId, treatmentFamily);
  }
  const rows = artifact.segmentTreatmentRows.filter(
    (row) => row.segmentId === segment.sourceSegmentId && row.treatmentType === treatmentFamily,
  );
  if (rows.length !== 1) return "unknown";
  const row = rows[0];
  if (row === undefined) return "unknown";
  if (POSITIVE_TREATMENT_STATES.has(row.status)) return "treated";
  if (row.status === "not_applicable") return "not_applicable";
  return "unknown";
}

const CORPUS_TREATMENT_FAMILY: Readonly<Record<string, StudyTreatmentFamily>> = {
  able: "automated_bus_lane_enforcement",
  ace: "automated_bus_lane_enforcement",
  automated_bus_lane_enforcement: "automated_bus_lane_enforcement",
  bus_lane: "bus_lane",
  red_paint: "bus_lane",
  busway: "busway",
  off_board_fare_collection: "off_board_fare_collection",
  all_door_boarding: "all_door_boarding",
  queue_jump: "queue_jump",
  reroute: "route_redesign",
  route_redesign: "route_redesign",
  select_bus_service: "select_bus_service",
  stop_consolidation: "stop_change",
  stop_relocation: "stop_change",
  signal_retiming: "transit_signal_priority",
  transit_signal_priority: "transit_signal_priority",
};

export function corpusTreatmentPresence(corpus: StudioInterventionCorpus): ReadonlySet<string> {
  if (corpus.records.length !== corpus.sourceCorpus.recordCount) {
    throw new Error(
      `Intervention corpus record-count mismatch: expected ${corpus.sourceCorpus.recordCount}, received ${corpus.records.length}`,
    );
  }
  const recordIds = new Set<string>();
  const presence = new Set<string>();
  for (const record of corpus.records) {
    if (recordIds.has(record.recordId)) {
      throw new Error(`Duplicate intervention corpus record ${record.recordId}`);
    }
    recordIds.add(record.recordId);
    for (const routeId of record.routes) {
      for (const treatment of [...record.primaryTreatments, ...record.customTreatments]) {
        const family = CORPUS_TREATMENT_FAMILY[treatment.trim().toLowerCase()];
        if (family !== undefined) presence.add(`${routeId.trim().toUpperCase()}|${family}`);
      }
    }
  }
  return presence;
}

function aggregateSpineSegments(rows: readonly ScoringSegment[]): readonly ScoringSegment[] {
  const groups = new Map<string, ScoringSegment[]>();
  for (const row of rows) {
    const group = groups.get(row.spineSegmentId) ?? [];
    group.push(row);
    groups.set(row.spineSegmentId, group);
  }
  return [...groups.values()]
    .map((group) => {
      const first = group[0];
      if (first === undefined) throw new Error("Empty spine aggregation group");
      const trips = group.reduce((sum, row) => sum + row.busTripCount, 0);
      if (!Number.isFinite(trips) || trips <= 0)
        throw new Error(`Invalid trip weight for ${first.spineSegmentId}`);
      const weighted = (pick: (row: ScoringSegment) => number) =>
        group.reduce((sum, row) => sum + pick(row) * row.busTripCount, 0) / trips;
      const borough = group
        .map((row) => row.borough)
        .toSorted((left, right) => left.localeCompare(right))[0];
      if (borough === undefined) throw new Error("Spine segment has no borough");
      return {
        ...first,
        borough,
        lengthMiles: weighted((row) => row.lengthMiles),
        speedMph: weighted((row) => row.speedMph),
        tripTimeMinutes: weighted((row) => row.tripTimeMinutes),
        busTripCount: trips,
      };
    })
    .toSorted(
      (left, right) =>
        left.routeId.localeCompare(right.routeId) ||
        left.spineSegmentId.localeCompare(right.spineSegmentId),
    );
}

function transferEvidence(studies: readonly StudyArtifact[]): {
  eligible: readonly OpportunityTransfer[];
  rows: readonly {
    treatmentFamily: StudyTreatmentFamily;
    status: "eligible" | "insufficient_evidence";
    studyCount: number;
    distinctEventRouteCount: number;
    effectPercent: number | null;
    effectFraction: number | null;
    studies: readonly {
      eventKey: string;
      candidateId: string;
      routeId: string;
      effectPercent: number;
      sourceOccurrenceIds: readonly string[];
    }[];
    excludedDescriptiveStudies: readonly {
      eventKey: string;
      candidateId: string;
      routeId: string;
      effectPercent: number | null;
      sourceOccurrenceIds: readonly string[];
    }[];
  }[];
} {
  const sourceOccurrenceIds = (study: StudyArtifact): readonly string[] =>
    [
      ...new Set(
        study.provenance.event.flatMap((event) => {
          if (!("occurrenceId" in event)) return [];
          return typeof event.occurrenceId === "string" ? [event.occurrenceId] : [];
        }),
      ),
    ].toSorted();
  const gated = studies.flatMap((study) => {
    const effectPercent = study.variants.allDay.effectPercent;
    return study.claimTier === "gated_estimate" && effectPercent !== null
      ? [
          {
            eventKey: study.eventKey,
            candidateId: study.candidateId,
            routeId: study.routeId,
            treatmentFamily: study.treatmentFamily,
            effectPercent,
            sourceOccurrenceIds: sourceOccurrenceIds(study),
          },
        ]
      : [];
  });
  const transfers = buildOpportunityTransfers(gated);
  const byFamily = new Map(
    transfers.eligible.map((transfer) => [transfer.treatmentFamily, transfer]),
  );
  const families = [...new Set(studies.map((study) => study.treatmentFamily))].toSorted();
  return {
    eligible: transfers.eligible,
    rows: families.map((treatmentFamily) => {
      const transfer = byFamily.get(treatmentFamily);
      const familyStudies = gated
        .filter((study) => study.treatmentFamily === treatmentFamily)
        .toSorted(
          (left, right) =>
            left.eventKey.localeCompare(right.eventKey) ||
            left.routeId.localeCompare(right.routeId),
        );
      const excludedDescriptiveStudies = studies
        .filter(
          (study) => study.treatmentFamily === treatmentFamily && study.claimTier === "descriptive",
        )
        .toSorted(
          (left, right) =>
            left.eventKey.localeCompare(right.eventKey) ||
            left.routeId.localeCompare(right.routeId),
        )
        .map((study) => ({
          eventKey: study.eventKey,
          candidateId: study.candidateId,
          routeId: study.routeId,
          effectPercent: study.variants.allDay.effectPercent,
          sourceOccurrenceIds: sourceOccurrenceIds(study),
        }));
      return {
        treatmentFamily,
        status: transfer === undefined ? "insufficient_evidence" : "eligible",
        studyCount: familyStudies.length,
        distinctEventRouteCount: new Set(
          familyStudies.map((study) => `${study.eventKey}|${study.routeId}`),
        ).size,
        effectPercent: transfer?.effectPercent ?? null,
        effectFraction: transfer?.effectFraction ?? null,
        studies: familyStudies.map(
          ({ eventKey, candidateId, routeId, effectPercent, sourceOccurrenceIds }) => ({
            eventKey,
            candidateId,
            routeId,
            effectPercent,
            sourceOccurrenceIds,
          }),
        ),
        excludedDescriptiveStudies,
      };
    }),
  };
}

function scoreHistogram(scores: readonly number[]) {
  return {
    negative: scores.filter((score) => score < 0).length,
    zero: scores.filter((score) => score === 0).length,
    positiveUnder100: scores.filter((score) => score > 0 && score < 100).length,
    positive100To999: scores.filter((score) => score >= 100 && score < 1_000).length,
    positive1000Plus: scores.filter((score) => score >= 1_000).length,
  };
}

function reportMarkdown(artifact: OpportunityPrototypeArtifact): string {
  const lines = [
    "# Opportunity-layer prototype report",
    "",
    `Analysis month: ${artifact.analysisMonth}`,
    `Review cut: ${artifact.reviewCutId}`,
    `Candidate universe: ${artifact.candidateSetId}`,
    "",
    "## Transfer evidence",
    "",
    ...artifact.transferEvidence.map(
      (row) =>
        `- ${row.treatmentFamily}: ${row.status}; ${row.studyCount} distinct event-route studies; signed median all-day effect ${row.effectPercent === null ? "n/a" : `${row.effectPercent}%`}; ${row.excludedDescriptiveStudies.length} descriptive studies excluded from transfer.`,
    ),
    "",
    "Distinct event-route studies are disclosed separately even when they originate from related occurrences. Descriptive studies never enter the transfer.",
    "",
    "## Distribution and exclusions",
    "",
    `Scored segments: ${artifact.distribution.scoredSegmentCount}`,
    `Unknown treatment-state exclusions: ${artifact.exclusions.unknownTreatmentStateSegmentCount}`,
    `Already-treated exclusions: ${artifact.exclusions.treatedSegmentCount}`,
    `Not-applicable exclusions: ${artifact.exclusions.notApplicableSegmentCount}`,
    `Insufficient-evidence family/segment pairs: ${artifact.exclusions.insufficientEvidenceSegmentCount}`,
    "",
    "`source_gap` and `not_found` are unknown, not untreated. The prototype excludes them rather than manufacturing treatment absence.",
    "",
    "## Top 20",
    "",
    ...(artifact.top20Narratives.length === 0
      ? ["No segments passed all evidence, treatment-state, spine, and ridership gates."]
      : artifact.top20Narratives.map((line, index) => `${index + 1}. ${line}`)),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

type OpportunityPrototypeArtifact = {
  artifactKind: "bp.studio.opportunity_prototype.v1";
  schemaVersion: 1;
  analysisMonth: string;
  reviewCutId: string;
  candidateSetId: string;
  inputs: Record<string, { path: string; sha256: string; byteCount: number }>;
  method: {
    benchmark: string;
    ridershipApportionment: string;
    score: string;
    treatmentStatePolicy: string;
    topLimit: 200;
  };
  transferEvidence: ReturnType<typeof transferEvidence>["rows"];
  exclusions: {
    sourceSegmentCount: number;
    spineNotReadySegmentCount: number;
    spineUnmatchedSegmentCount: number;
    invalidSegmentCount: number;
    missingRidershipSegmentCount: number;
    treatedSegmentCount: number;
    unknownTreatmentStateSegmentCount: number;
    notApplicableSegmentCount: number;
    insufficientEvidenceSegmentCount: number;
  };
  opportunities: readonly Record<string, unknown>[];
  distribution: {
    scoredSegmentCount: number;
    histogram: ReturnType<typeof scoreHistogram>;
    boroughMix: Record<string, number>;
  };
  top20Narratives: readonly string[];
};

export async function runOpportunityPrototype(input: {
  local: OpenLocalPipelineDb;
  analysisMonth: string;
  studyIndexPath: string;
  reviewInputsPath: string;
  spineManifestPath: string;
  treatmentSummaryPath: string;
  interventionCorpusPath: string;
  outputRoot: string;
}): Promise<{
  artifactPath: string;
  reportPath: string;
  scoredSegmentCount: number;
  eligibleTreatmentFamilyCount: number;
  unknownTreatmentStateSegmentCount: number;
}> {
  const validated = await loadAndValidateStudies({
    analysisMonth: input.analysisMonth,
    indexPath: input.studyIndexPath,
    reviewInputsPath: input.reviewInputsPath,
    spineManifestPath: input.spineManifestPath,
  });
  const [treatmentSummary, interventionCorpus] = await Promise.all([
    readJsonArtifact(input.treatmentSummaryPath, TreatmentSummarySchema, "strict"),
    readJsonArtifact(input.interventionCorpusPath, StudioInterventionCorpusSchema, "strict"),
  ]);
  if (
    treatmentSummary.month !== input.analysisMonth ||
    treatmentSummary.validation.status === "fail" ||
    treatmentSummary.source.localMissingTables.length > 0
  ) {
    throw new Error("Treatment-state summary is stale, failed, or incomplete");
  }
  const corpusPresence = corpusTreatmentPresence(interventionCorpus);
  const transfer = transferEvidence(validated.studies);
  const sourceRows = loadSegmentRows(input.local, input.analysisMonth);
  const routeRidership = loadRouteRidership(input.local, input.analysisMonth);
  const routeIds = [...new Set(sourceRows.map((row) => row.route_id))].toSorted();
  const scoringRows: ScoringSegment[] = [];
  let spineNotReadySegmentCount = 0;
  let spineUnmatchedSegmentCount = 0;
  let invalidSegmentCount = 0;
  for (const routeId of routeIds) {
    const routeRows = sourceRows.filter((row) => row.route_id === routeId);
    const spine = await validateAndLoadSpine({
      manifest: validated.manifest,
      reviewInputs: validated.reviewInputs,
      routeId,
    });
    if (spine === null) {
      spineNotReadySegmentCount += routeRows.length;
      continue;
    }
    const crosswalk = buildRouteSpeedSpineCrosswalk(spine.artifact);
    for (const row of routeRows) {
      if (
        row.average_speed_mph <= 0 ||
        row.average_trip_time_minutes <= 0 ||
        row.average_distance_miles <= 0 ||
        row.bus_trip_count <= 0
      ) {
        invalidSegmentCount += 1;
        continue;
      }
      const sourceSegmentId = serializeStudioSegmentId({
        routeId: row.route_id,
        month: input.analysisMonth,
        direction: row.direction,
        stopOrder: row.stop_order,
        fromStopId: row.from_stop_id,
        toStopId: row.to_stop_id,
      });
      const spineSegmentId = crosswalk.get(sourceSegmentId);
      if (spineSegmentId === undefined) {
        spineUnmatchedSegmentCount += 1;
        continue;
      }
      scoringRows.push({
        routeId: row.route_id,
        borough: row.borough,
        sourceSegmentId,
        spineSegmentId,
        direction: row.direction,
        stopOrder: row.stop_order,
        fromStopId: row.from_stop_id,
        toStopId: row.to_stop_id,
        lengthMiles: row.average_distance_miles,
        speedMph: row.average_speed_mph,
        tripTimeMinutes: row.average_trip_time_minutes,
        busTripCount: row.bus_trip_count,
      });
    }
  }
  const segments = aggregateSpineSegments(scoringRows);
  const benchmarks = buildBoroughLengthBenchmarks(segments);
  const exposures = new Map<string, number>();
  let missingRidershipSegmentCount = 0;
  for (const routeId of [...new Set(segments.map((segment) => segment.routeId))].toSorted()) {
    const routeSegments = segments.filter((segment) => segment.routeId === routeId);
    const ridership = routeRidership.get(routeId);
    if (ridership === undefined || !Number.isFinite(ridership) || ridership < 0) {
      missingRidershipSegmentCount += routeSegments.length;
      continue;
    }
    for (const [segmentId, exposure] of apportionRouteRidershipByTripTime({
      routeRidership: ridership,
      segments: routeSegments.map((segment) => ({
        segmentId: segment.spineSegmentId,
        tripTimeMinutes: segment.tripTimeMinutes,
      })),
    })) {
      exposures.set(`${routeId}|${segmentId}`, exposure);
    }
  }

  let treatedSegmentCount = 0;
  let unknownTreatmentStateSegmentCount = 0;
  let notApplicableSegmentCount = 0;
  const candidates: Array<{
    routeId: string;
    segmentId: string;
    sourceSegmentId: string;
    borough: string;
    direction: string;
    stopOrder: number;
    fromStopId: string;
    toStopId: string;
    lengthMiles: number;
    speedMph: number;
    benchmarkSpeedMph: number;
    comparableLengthBand: string;
    routeRidership: number;
    riderExposure: number;
    timeLostPerRiderMinutes: number;
    transferredEffectPercent: number;
    transferredEffectFraction: number;
    treatmentFamily: StudyTreatmentFamily;
    transferStudyIds: readonly string[];
  }> = [];
  for (const segment of segments) {
    const riderExposure = exposures.get(`${segment.routeId}|${segment.spineSegmentId}`);
    if (riderExposure === undefined) continue;
    const benchmarkKey = `${segment.borough}|${comparableLengthBand(segment.lengthMiles)}`;
    const benchmarkSpeedMph = benchmarks.get(benchmarkKey);
    if (benchmarkSpeedMph === undefined) throw new Error(`Missing benchmark ${benchmarkKey}`);
    for (const family of transfer.eligible) {
      const treatmentState = segmentTreatmentState(
        treatmentSummary,
        corpusPresence,
        segment,
        family.treatmentFamily,
      );
      if (treatmentState === "treated") {
        treatedSegmentCount += 1;
        continue;
      }
      if (treatmentState === "unknown") {
        unknownTreatmentStateSegmentCount += 1;
        continue;
      }
      notApplicableSegmentCount += 1;
    }
  }
  const ranked = rankOpportunities(candidates).slice(0, 200);
  const opportunities = ranked.map((row, index) => ({ rank: index + 1, ...row }));
  const scores = ranked.map((row) => row.score);
  const boroughMix = Object.fromEntries(
    [...new Set(ranked.map((row) => row.borough))]
      .toSorted()
      .map((borough) => [borough, ranked.filter((row) => row.borough === borough).length]),
  );
  const top20Narratives = ranked
    .slice(0, 20)
    .map(
      (row) =>
        `${row.routeId} ${row.fromStopId}→${row.toStopId} scored ${row.score.toFixed(2)} signed rider-minutes: ${row.riderExposure.toFixed(1)} apportioned route riders, ${row.timeLostPerRiderMinutes.toFixed(2)} minutes behind the ${row.borough} ${row.comparableLengthBand} p75 benchmark, and a ${row.transferredEffectPercent.toFixed(4)}% signed transfer.`,
    );
  const inputReceipts = await Promise.all(
    (
      [
        ["studyIndex", input.studyIndexPath],
        ["reviewInputs", input.reviewInputsPath],
        ["spineManifest", input.spineManifestPath],
        ["treatmentSummary", input.treatmentSummaryPath],
        ["interventionCorpus", input.interventionCorpusPath],
      ] as const
    ).map(async ([label, path]) => [label, { path, ...(await fileReceipt(path)) }] as const),
  );
  const insufficientFamilyCount = transfer.rows.filter(
    (row) => row.status === "insufficient_evidence",
  ).length;
  const artifact: OpportunityPrototypeArtifact = {
    artifactKind: "bp.studio.opportunity_prototype.v1",
    schemaVersion: 1,
    analysisMonth: input.analysisMonth,
    reviewCutId: validated.reviewCutId,
    candidateSetId: validated.candidateSetId,
    inputs: Object.fromEntries(inputReceipts),
    method: {
      benchmark: "nearest-rank p75 speed within borough and fixed segment-length band",
      ridershipApportionment:
        "analysis-month route ridership multiplied by segment share of summed observed route trip-time",
      score:
        "riderExposure * nonnegative timeLostPerRiderMinutes * signed median gated all-day effectPercent / 100",
      treatmentStatePolicy:
        "positive summary states or documented corpus treatments are treated; source_gap and not_found are unknown; corpus absence and unknown states are never treated as untreated",
      topLimit: 200,
    },
    transferEvidence: transfer.rows,
    exclusions: {
      sourceSegmentCount: sourceRows.length,
      spineNotReadySegmentCount,
      spineUnmatchedSegmentCount,
      invalidSegmentCount,
      missingRidershipSegmentCount,
      treatedSegmentCount,
      unknownTreatmentStateSegmentCount,
      notApplicableSegmentCount,
      insufficientEvidenceSegmentCount: segments.length * insufficientFamilyCount,
    },
    opportunities,
    distribution: {
      scoredSegmentCount: ranked.length,
      histogram: scoreHistogram(scores),
      boroughMix,
    },
    top20Narratives,
  };
  const artifactPath = join(input.outputRoot, "opportunities.json");
  const reportPath = join(input.outputRoot, "report.md");
  await writeJson(artifactPath, artifact);
  await runPipelineFileSystemBoundary({
    command: COMMAND,
    operation: "writeReport",
    run: (files) =>
      files.writeText({
        command: COMMAND,
        operation: "writeReport",
        path: reportPath,
        contents: reportMarkdown(artifact),
      }),
  });
  return {
    artifactPath,
    reportPath,
    scoredSegmentCount: ranked.length,
    eligibleTreatmentFamilyCount: transfer.eligible.length,
    unknownTreatmentStateSegmentCount,
  };
}

export default defineCommand({
  path: ["study", "opportunity-prototype"],
  summary: "Build the non-public Plan 076 opportunity-layer prototype.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      analysisMonth: IsoMonthSchema.annotate({
        description: "Exact approved study analysis month",
      }),
      studyIndex: Schema.optionalKey(Schema.String).annotate({
        description: "Complete nine-study index",
      }),
      reviewInputs: Schema.String.annotate({ description: "Immutable study review-input receipt" }),
      spineManifest: Schema.String.annotate({
        description: "Full speed-spine manifest bound by the review cut",
      }),
      treatmentSummary: Schema.String.annotate({
        description: "Pinned same-month route treatment-state summary",
      }),
      interventionCorpus: Schema.String.annotate({
        description:
          "Pinned reviewed Plan 073 intervention corpus used only for positive exclusions",
      }),
      outputRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Prototype-only output directory",
      }),
    }),
  },
  output: Schema.Struct({
    artifactPath: Schema.String,
    reportPath: Schema.String,
    scoredSegmentCount: NonNegativeIntegerSchema,
    eligibleTreatmentFamilyCount: NonNegativeIntegerSchema,
    unknownTreatmentStateSegmentCount: NonNegativeIntegerSchema,
  }),
  async run({ input }) {
    const artifactRoot = defaultArtifactRootPath();
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { readonly: true },
      command: COMMAND,
      operation: "runOpportunityPrototype",
      spanAttributes: { analysisMonth: input.options.analysisMonth },
      run: (local) =>
        runOpportunityPrototype({
          local,
          analysisMonth: input.options.analysisMonth,
          studyIndexPath: fromCliPath(
            input.options.studyIndex ?? join(artifactRoot, "studio/v2/studies/index.json"),
          ),
          reviewInputsPath: fromCliPath(input.options.reviewInputs),
          spineManifestPath: fromCliPath(input.options.spineManifest),
          treatmentSummaryPath: fromCliPath(input.options.treatmentSummary),
          interventionCorpusPath: fromCliPath(input.options.interventionCorpus),
          outputRoot: fromCliPath(
            input.options.outputRoot ??
              join(artifactRoot, "studio/v2/studies/opportunity-prototype"),
          ),
        }),
    });
  },
});
