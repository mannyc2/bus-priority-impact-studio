import { loadRepoRootEnv } from "./lib/env.js";

// Load the canonical repo-root .env so `bun --filter` runs (CWD =
// tools/pipeline) still see API keys and credentials defined at the
// monorepo root.
loadRepoRootEnv();

type CommandHandler = (args: string[]) => Promise<unknown>;

type Command = {
  description: string;
  run: CommandHandler;
};

const commands = {
  "sources:list": {
    description: "List configured source ids.",
    run: async () => {
      await import("./jobs/sources/sources-list.js");
    },
  },
  "sources:probe": {
    description: "Probe configured source metadata and write probe outputs.",
    run: async () => {
      await import("./jobs/sources/sources-probe.js");
    },
  },
  "collect:gtfs-rt": {
    description: "Collect bounded MTA Bus Time GTFS-RT raw feed snapshots.",
    run: async (args) => {
      const { collectGtfsRtSnapshotsFromCli } = await import("./jobs/collect/collect-gtfs-rt.js");
      return collectGtfsRtSnapshotsFromCli(args);
    },
  },
  "ingest:ace-routes": {
    description: "Fetch ACE route implementation rows.",
    run: async () => {
      const { ingestAceRoutes } = await import("./jobs/ingest/ingest-ace-routes.js");
      return ingestAceRoutes();
    },
  },
  "ingest:gtfs-rt-snapshots": {
    description: "Parse collected GTFS-RT raw snapshots into local DB rows.",
    run: async (args) => {
      const { ingestGtfsRtSnapshotsFromCli } = await import(
        "./jobs/ingest/ingest-gtfs-rt-snapshots.js"
      );
      return ingestGtfsRtSnapshotsFromCli(args);
    },
  },
  "import:gtfs-rt-r2-manifests": {
    description: "Register Worker/R2 GTFS-RT snapshot manifests as a local collection run.",
    run: async (args) => {
      const { importGtfsRtR2ManifestsFromCli } = await import(
        "./jobs/ingest/import-gtfs-rt-r2-manifests.js"
      );
      return importGtfsRtR2ManifestsFromCli(args);
    },
  },
  "pull:gtfs-rt-r2-run": {
    description: "Mirror Worker/R2 GTFS-RT manifests and protobufs through the R2 S3 API.",
    run: async (args) => {
      const { pullGtfsRtR2RunFromCli } = await import("./jobs/ops/pull-gtfs-rt-r2-run.js");
      return pullGtfsRtR2RunFromCli(args);
    },
  },
  "gtfs-rt:preflight": {
    description: "Diagnose GTFS-RT collection, parse, headway, and observed reliability readiness.",
    run: async (args) => {
      const { preflightGtfsRtFromCli } = await import("./jobs/check/gtfs-rt-preflight.js");
      return preflightGtfsRtFromCli(args);
    },
  },
  "gtfs-rt:run-status": {
    description: "Summarize GTFS-RT collection run progress and handoff commands.",
    run: async (args) => {
      const { getGtfsRtRunStatusFromCli } = await import("./jobs/check/gtfs-rt-run-status.js");
      return getGtfsRtRunStatusFromCli(args);
    },
  },
  "check:route-speed-availability": {
    description: "Check latest published MTA route segment speed months.",
    run: async (args) => {
      const { checkRouteSpeedAvailabilityFromCli } = await import(
        "./jobs/check/route-speed-availability.js"
      );
      return checkRouteSpeedAvailabilityFromCli(args);
    },
  },
  "check:bus-observatory-gtfs-rt": {
    description: "Check third-party Bus Observatory GTFS-RT archive availability.",
    run: async (args) => {
      const { checkBusObservatoryAvailabilityFromCli } = await import(
        "./jobs/check/bus-observatory-availability.js"
      );
      return checkBusObservatoryAvailabilityFromCli(args);
    },
  },
  "check:bus-observatory-gtfs-rt-range": {
    description:
      "Check Bus Observatory GTFS-RT availability across a month range (--since YYYY-MM --until YYYY-MM).",
    run: async (args) => {
      const { checkBusObservatoryAvailabilityRangeFromCli } = await import(
        "./jobs/check/bus-observatory-availability-range.js"
      );
      return checkBusObservatoryAvailabilityRangeFromCli(args);
    },
  },
  "import:bus-observatory-gtfs-rt": {
    description: "Import canonical Bus Observatory GTFS-RT CSV rows into local GTFS-RT tables.",
    run: async (args) => {
      const { importBusObservatoryGtfsRtFromCli } = await import(
        "./jobs/ingest/import-bus-observatory-gtfs-rt.js"
      );
      return importBusObservatoryGtfsRtFromCli(args);
    },
  },
  "import:bus-observatory-reliability-summary": {
    description: "Import Bus Observatory recovered observed-reliability summaries.",
    run: async (args) => {
      const { importBusObservatoryReliabilitySummaryFromCli } = await import(
        "./jobs/ingest/import-bus-observatory-reliability-summary.js"
      );
      return importBusObservatoryReliabilitySummaryFromCli(args);
    },
  },
  "backfill:bus-observatory-range": {
    description:
      "End-to-end backfill of Bus Observatory recovered GTFS-RT for a month range (--since YYYY-MM --until YYYY-MM [--concurrency N]). Generates DuckDB SQL, streams parquets from S3, imports samples+snapshots, builds reliability summaries.",
    run: async (args) => {
      const { backfillBusObservatoryRangeFromCli } = await import(
        "./jobs/ingest/backfill-bus-observatory-range.js"
      );
      return backfillBusObservatoryRangeFromCli(args);
    },
  },
  "import:bus-observatory-headway-samples": {
    description: "Import chunked Bus Observatory recovered headway samples and run evidence.",
    run: async (args) => {
      const { importBusObservatoryHeadwaySamplesFromCli } = await import(
        "./jobs/ingest/import-bus-observatory-headway-samples.js"
      );
      return importBusObservatoryHeadwaySamplesFromCli(args);
    },
  },
  "plan:source-refresh": {
    description: "Write production source refresh plan for GTFS-RT and monthly speed data.",
    run: async (args) => {
      const { buildSourceRefreshPlanFromCli } = await import("./jobs/check/source-refresh-plan.js");
      return buildSourceRefreshPlanFromCli(args);
    },
  },
  "backfill:socrata-range": {
    description:
      "Backfill Socrata-backed sources across a month range (--since/--until YYYY-MM --sources nypd-collisions,ace-violations,...).",
    run: async (args) => {
      const { backfillSocrataRangeFromCli } = await import(
        "./jobs/ingest/backfill-socrata-range.js"
      );
      return backfillSocrataRangeFromCli(args);
    },
  },
  "ingest:ace-violations": {
    description: "Fetch monthly ACE violation summaries.",
    run: async (args) => {
      const { ingestAceViolationSummaryFromCli } = await import(
        "./jobs/ingest/ingest-ace-violations.js"
      );
      return ingestAceViolationSummaryFromCli(args);
    },
  },
  "ingest:bus-wait-assessment": {
    description:
      "Fetch monthly MTA Bus Wait Assessment rows (route × dayType × tripType × period).",
    run: async (args) => {
      const { ingestBusWaitAssessmentFromCli } = await import(
        "./jobs/ingest/ingest-bus-wait-assessment.js"
      );
      return ingestBusWaitAssessmentFromCli(args);
    },
  },
  "ingest:dot-traffic-speeds": {
    description: "Capture a current snapshot of NYC DOT real-time traffic speeds per street link.",
    run: async (args) => {
      const { ingestDotTrafficSpeedsFromCli } = await import(
        "./jobs/ingest/ingest-dot-traffic-speeds.js"
      );
      return ingestDotTrafficSpeedsFromCli(args);
    },
  },
  "ingest:dot-street-permits": {
    description:
      "Fetch NYC DOT street construction or opening permits for a month (--kind construction|opening).",
    run: async (args) => {
      const { ingestDotStreetPermitsFromCli } = await import(
        "./jobs/ingest/ingest-dot-street-permits.js"
      );
      return ingestDotStreetPermitsFromCli(args);
    },
  },
  "ingest:noaa-weather": {
    description:
      "Fetch NOAA GHCN-Daily observations for NYC stations (--since YYYY-MM-DD --until YYYY-MM-DD).",
    run: async (args) => {
      const { ingestNoaaWeatherFromCli } = await import("./jobs/ingest/ingest-noaa-weather.js");
      return ingestNoaaWeatherFromCli(args);
    },
  },
  "ingest:dot-traffic-volumes": {
    description:
      "Fetch NYC DOT automated traffic volume counts (per segment × 15-min) for a year+month.",
    run: async (args) => {
      const { ingestDotTrafficVolumesFromCli } = await import(
        "./jobs/ingest/ingest-dot-traffic-volumes.js"
      );
      return ingestDotTrafficVolumesFromCli(args);
    },
  },
  "ingest:nypd-collisions": {
    description: "Fetch NYPD motor vehicle collisions for a month (per crash_date).",
    run: async (args) => {
      const { ingestNypdCollisionsFromCli } = await import(
        "./jobs/ingest/ingest-nypd-collisions.js"
      );
      return ingestNypdCollisionsFromCli(args);
    },
  },
  "ingest:311-service-requests": {
    description:
      "Fetch 311 service requests for a month, filtered to bus-relevant complaint types (--era current|historical).",
    run: async (args) => {
      const { ingest311ServiceRequestsFromCli } = await import(
        "./jobs/ingest/ingest-311-service-requests.js"
      );
      return ingest311ServiceRequestsFromCli(args);
    },
  },
  "ingest:parking-violations": {
    description:
      "Fetch parking violations for a month filtered to bus-relevant codes (--codes 5,14,31,67).",
    run: async (args) => {
      const { ingestParkingViolationsFromCli } = await import(
        "./jobs/ingest/ingest-parking-violations.js"
      );
      return ingestParkingViolationsFromCli(args);
    },
  },
  "check:spatialite": {
    description: "Verify mod_spatialite loads into the local pipeline DB and report its version.",
    run: async (args) => {
      const { checkSpatialiteFromCli } = await import("./jobs/check/check-spatialite.js");
      return checkSpatialiteFromCli(args);
    },
  },
  "build:lion-geometry-index": {
    description: "Materialize LION segment WKT into spatialite geometries with an R-tree index.",
    run: async (args) => {
      const { buildLionGeometryIndexFromCli } = await import(
        "./jobs/build/build-lion-geometry-index.js"
      );
      return buildLionGeometryIndexFromCli(args);
    },
  },
  "build:route-shape-geometry-index": {
    description:
      "Materialize MTA route shapes into spatialite MultiLineStrings with an R-tree index.",
    run: async (args) => {
      const { buildRouteShapeGeometryIndexFromCli } = await import(
        "./jobs/build/build-route-shape-geometry-index.js"
      );
      return buildRouteShapeGeometryIndexFromCli(args);
    },
  },
  "build:route-lion-link": {
    description: "Compute the route ⇄ LION corridor lookup via ST_Buffer + ST_Intersects.",
    run: async (args) => {
      const { buildRouteLionLinkFromCli } = await import("./jobs/build/build-route-lion-link.js");
      return buildRouteLionLinkFromCli(args);
    },
  },
  "geocode:311": {
    description:
      "Attach LION physical_id to 311 service-request rows via lat/lng snap + Geoclient.",
    run: async (args) => {
      const { geocode311FromCli } = await import("./jobs/geocode/geocode-311.js");
      return geocode311FromCli(args);
    },
  },
  "geocode:nypd-collisions": {
    description: "Attach LION physical_id to NYPD collision rows via lat/lng snap + Geoclient.",
    run: async (args) => {
      const { geocodeNypdCollisionsFromCli } = await import(
        "./jobs/geocode/geocode-nypd-collisions.js"
      );
      return geocodeNypdCollisionsFromCli(args);
    },
  },
  "geocode:parking-violations": {
    description: "Attach LION physical_id to parking-violation rows via Geoclient address lookup.",
    run: async (args) => {
      const { geocodeParkingViolationsFromCli } = await import(
        "./jobs/geocode/geocode-parking-violations.js"
      );
      return geocodeParkingViolationsFromCli(args);
    },
  },
  "geocode:permits": {
    description:
      "Attach LION physical_id to DOT street-permit rows via address + intersection lookups.",
    run: async (args) => {
      const { geocodePermitsFromCli } = await import("./jobs/geocode/geocode-permits.js");
      return geocodePermitsFromCli(args);
    },
  },
  "geocode:traffic-volumes": {
    description:
      "Attach LION physical_id to DOT traffic-volume rows via Geoclient intersection lookup.",
    run: async (args) => {
      const { geocodeTrafficVolumesFromCli } = await import(
        "./jobs/geocode/geocode-traffic-volumes.js"
      );
      return geocodeTrafficVolumesFromCli(args);
    },
  },
  "geocode:traffic-speeds": {
    description:
      "Attach LION physical_id to DOT traffic-speed rows via lat/lng snap of link_points.",
    run: async (args) => {
      const { geocodeTrafficSpeedsFromCli } = await import(
        "./jobs/geocode/geocode-traffic-speeds.js"
      );
      return geocodeTrafficSpeedsFromCli(args);
    },
  },
  "build:context-events": {
    description: "Materialize geocoded context-source rows into local_context_event.",
    run: async (args) => {
      const { buildContextEventsFromCli } = await import("./jobs/build/build-context-events.js");
      return buildContextEventsFromCli(args);
    },
  },
  "build:parking-violation-matches": {
    description:
      "Build grouped parking violation location candidates from camera intersections and street-code house ranges.",
    run: async (args) => {
      const { buildParkingViolationMatchesFromCli } = await import(
        "./jobs/build/build-parking-violation-matches.js"
      );
      return buildParkingViolationMatchesFromCli(args);
    },
  },
  "build:context-event-route-touches": {
    description:
      "Materialize detector-facing context-event route touches from direct route refs and route-LION links.",
    run: async (args) => {
      const { buildContextEventRouteTouchesFromCli } = await import(
        "./jobs/build/build-context-event-route-touches.js"
      );
      return buildContextEventRouteTouchesFromCli(args);
    },
  },
  "findings:detect": {
    description:
      "Run the finding-detector matrix against a release month and replace candidate/evidence/coverage rows idempotently.",
    run: async (args) => {
      const { buildFindingsFromCli } = await import("./jobs/build/findings.js");
      return buildFindingsFromCli(args);
    },
  },
  "findings:audit-feedback": {
    description:
      "Summarize structured agent detector-audit results into detector improvement feedback.",
    run: async (args) => {
      const { buildFindingsAuditFeedbackFromCli } = await import(
        "./jobs/build/findings-audit-feedback.js"
      );
      return buildFindingsAuditFeedbackFromCli(args);
    },
  },
  "findings:signal-features": {
    description:
      "Build route/month/window signal features and preview the first context-event detector.",
    run: async (args) => {
      const { buildSignalFeaturesFromCli } = await import("./jobs/build/signal-features.js");
      return buildSignalFeaturesFromCli(args);
    },
  },
  "ingest:lion-centerline": {
    description:
      "Fetch NYC Centerline (LION) active street segments for joins across DOT/311/parking/route street refs.",
    run: async (args) => {
      const { ingestLionCenterlineFromCli } = await import(
        "./jobs/ingest/ingest-lion-centerline.js"
      );
      return ingestLionCenterlineFromCli(args);
    },
  },
  "ingest:bus-lanes": {
    description: "Fetch NYC DOT bus lane rows.",
    run: async () => {
      const { ingestBusLanes } = await import("./jobs/ingest/ingest-bus-lanes.js");
      return ingestBusLanes();
    },
  },
  "ingest:equity-context": {
    description: "Fetch Census ACS equity context.",
    run: async (args) => {
      const { ingestEquityContextFromCli } = await import("./jobs/ingest/ingest-equity-context.js");
      return ingestEquityContextFromCli(args);
    },
  },
  "ingest:route-catalog": {
    description: "Fetch current route and stop catalog rows.",
    run: async (args) => {
      const { ingestRouteCatalogFromCli } = await import("./jobs/ingest/ingest-route-catalog.js");
      return ingestRouteCatalogFromCli(args);
    },
  },
  "ingest:route-coverage": {
    description: "Fetch route/month speed and schedule coverage.",
    run: async (args) => {
      const { ingestRouteMonthCoverageFromCli } = await import(
        "./jobs/ingest/ingest-route-month-coverage.js"
      );
      return ingestRouteMonthCoverageFromCli(args);
    },
  },
  "ingest:route-trends": {
    description: "Fetch route/month speed and ridership trend rows.",
    run: async (args) => {
      const { ingestRouteTrendsFromCli } = await import("./jobs/ingest/ingest-route-trends.js");
      return ingestRouteTrendsFromCli(args);
    },
  },
  "backfill:route-ridership-trends": {
    description: "Backfill missing ridership trend rows.",
    run: async (args) => {
      const { backfillRouteRidershipTrendsFromCli } = await import(
        "./jobs/ingest/backfill-route-ridership-trends.js"
      );
      return backfillRouteRidershipTrendsFromCli(args);
    },
  },
  "route-readiness": {
    description: "Build route readiness artifacts.",
    run: async (args) => {
      const { buildRouteReadinessFromCli } = await import("./jobs/build/route-readiness.js");
      return buildRouteReadinessFromCli(args);
    },
  },
  "route-build-plan": {
    description: "Build route batch planning artifacts.",
    run: async (args) => {
      const { buildRouteBuildPlanFromCli } = await import("./jobs/build/route-build-plan.js");
      return buildRouteBuildPlanFromCli(args);
    },
  },
  "route-reliability-baseline": {
    description: "Build scheduled reliability baseline artifacts.",
    run: async (args) => {
      const { buildRouteReliabilityBaselineFromCli } = await import(
        "./jobs/build/route-reliability-baseline.js"
      );
      return buildRouteReliabilityBaselineFromCli(args);
    },
  },
  "build:observed-headways": {
    description: "Build observed stop events and headway samples from parsed GTFS-RT rows.",
    run: async (args) => {
      const { buildObservedHeadwaysFromCli } = await import("./jobs/build/observed-headways.js");
      return buildObservedHeadwaysFromCli(args);
    },
  },
  "route-observed-reliability": {
    description: "Build route/month observed reliability, bunching, and wait metrics.",
    run: async (args) => {
      const { buildRouteObservedReliabilityFromCli } = await import(
        "./jobs/build/route-observed-reliability.js"
      );
      return buildRouteObservedReliabilityFromCli(args);
    },
  },
  "route-intervention-evaluation": {
    description: "Build route/month descriptive intervention before/after comparisons.",
    run: async (args) => {
      const { buildRouteInterventionEvaluationFromCli } = await import(
        "./jobs/build/route-intervention-evaluation.js"
      );
      return buildRouteInterventionEvaluationFromCli(args);
    },
  },
  "corridor-model": {
    description: "Build deterministic corridor assignments and summaries.",
    run: async (args) => {
      const { buildCorridorModelFromCli } = await import("./jobs/build/corridor-model.js");
      return buildCorridorModelFromCli(args);
    },
  },
  "corridor-shape-review": {
    description: "Review corridor assignments against GTFS route-shape geometry.",
    run: async (args) => {
      const { buildCorridorShapeReviewFromCli } = await import(
        "./jobs/build/corridor-shape-review.js"
      );
      return buildCorridorShapeReviewFromCli(args);
    },
  },
  "evaluation-artifacts": {
    description: "Build static observed reliability and intervention evaluation payloads.",
    run: async (args) => {
      const { buildEvaluationArtifactsFromCli } = await import(
        "./jobs/build/evaluation-artifacts.js"
      );
      return buildEvaluationArtifactsFromCli(args);
    },
  },
  "map-artifacts": {
    description: "Build static map GeoJSON payloads and manifest.",
    run: async (args) => {
      const { buildMapArtifactsFromCli } = await import("./jobs/build/map-artifacts.js");
      return buildMapArtifactsFromCli(args);
    },
  },
  "brief-artifacts": {
    description: "Build route and corridor brief body artifacts.",
    run: async (args) => {
      const { buildBriefArtifactsFromCli } = await import("./jobs/build/brief-artifacts.js");
      return buildBriefArtifactsFromCli(args);
    },
  },
  "build:studio-release": {
    description: "Build Studio REST projection artifacts from D1/R2 serving inputs.",
    run: async (args) => {
      const { buildStudioReleaseFromCli } = await import("./jobs/build/studio-release.js");
      return buildStudioReleaseFromCli(args);
    },
  },
  "audit:studio-coverage": {
    description: "Audit Studio v1 projection coverage versus local D1 route/brief/observed data.",
    run: async (args) => {
      const { auditStudioCoverageFromCli } = await import("./jobs/audit/studio-coverage.js");
      return auditStudioCoverageFromCli(args);
    },
  },
  "audit:source-coverage": {
    description: "Write a source coverage ledger for historical corpus completion planning.",
    run: async (args) => {
      const { buildSourceCoverageLedgerFromCli } = await import(
        "./jobs/audit/source-coverage-ledger.js"
      );
      return buildSourceCoverageLedgerFromCli(args);
    },
  },
  "audit:parking-candidate-quality": {
    description:
      "Audit parking candidate fanout and match weights before any detector-grade promotion.",
    run: async (args) => {
      const { auditParkingCandidateQualityFromCli } = await import(
        "./jobs/audit/parking-candidate-quality.js"
      );
      return auditParkingCandidateQualityFromCli(args);
    },
  },
  "route-equity-context": {
    description: "Build route equity context artifacts.",
    run: async (args) => {
      const { buildRouteEquityContextFromCli } = await import(
        "./jobs/build/route-equity-context.js"
      );
      return buildRouteEquityContextFromCli(args);
    },
  },
  "export:d1": {
    description: "Export D1 schema and seed SQL.",
    run: async (args) => {
      const { exportD1SeedFromCli } = await import("./jobs/export/export-d1.js");
      return exportD1SeedFromCli(args);
    },
  },
  "verify:d1": {
    description: "Verify generated D1 export SQL.",
    run: async (args) => {
      const { verifyD1ExportFromCli } = await import("./jobs/export/verify-d1-export.js");
      return verifyD1ExportFromCli(args);
    },
  },
  "publish:r2-artifacts": {
    description:
      "Idempotently upload release artifacts to R2 via the S3-compatible API (HEAD-then-PUT, parallel, resumable).",
    run: async (args) => {
      const { publishR2ArtifactsFromCli } = await import("./jobs/publish/publish-r2-artifacts.js");
      return publishR2ArtifactsFromCli(args);
    },
  },
  "check:pipeline-v1": {
    description: "Run the full Data Pipeline v1 QA gate.",
    run: async (args) => {
      const { checkPipelineV1FromCli } = await import("./jobs/check/pipeline-v1.js");
      return checkPipelineV1FromCli(args);
    },
  },
  "audit:pipeline-v1": {
    description: "Write a Data Pipeline v1 prompt-to-artifact completion audit.",
    run: async (args) => {
      const { auditPipelineV1FromCli } = await import("./jobs/check/pipeline-v1-audit.js");
      return auditPipelineV1FromCli(args);
    },
  },
  "finalize:pipeline-v1": {
    description: "Run the Data Pipeline v1 finalization chain for an existing route build.",
    run: async (args) => {
      const { finalizePipelineV1FromCli } = await import("./jobs/build/pipeline-v1-finalize.js");
      return finalizePipelineV1FromCli(args);
    },
  },
  "ingest:route-slice": {
    description: "Ingest one route/month slice.",
    run: async (args) => {
      const { ingestRouteSlice, parseRouteSliceCliArgs } = await import(
        "./jobs/ingest/route-slice.js"
      );
      return ingestRouteSlice(parseRouteSliceCliArgs(args));
    },
  },
  "ingest:route-schedules": {
    description: "Ingest route schedule timepoints.",
    run: async (args) => {
      const { ingestRouteSchedulesFromCli } = await import(
        "./jobs/ingest/ingest-route-schedules.js"
      );
      return ingestRouteSchedulesFromCli(args);
    },
  },
  "build:hotspots": {
    description: "Build route hotspot artifacts.",
    run: async (args) => {
      const { buildRouteHotspotsFromCli } = await import("./jobs/build/route-core-artifacts.js");
      return buildRouteHotspotsFromCli(args);
    },
  },
  "build:ridership-profile": {
    description: "Build route ridership profile artifacts.",
    run: async (args) => {
      const { buildRouteRidershipProfileFromCli } = await import("./jobs/build/route-profiles.js");
      return buildRouteRidershipProfileFromCli(args);
    },
  },
  "build:speed-profile": {
    description: "Build route speed profile artifacts.",
    run: async (args) => {
      const { buildRouteSpeedProfileFromCli } = await import("./jobs/build/route-profiles.js");
      return buildRouteSpeedProfileFromCli(args);
    },
  },
  "build:routes": {
    description: "Run the all-routes build graph for explicit routes or --planned selection.",
    run: async (args) => {
      const { buildAllRoutesGraphFromCli } = await import("./jobs/build/route-build-graph.js");
      return buildAllRoutesGraphFromCli(args);
    },
  },
  "build:network": {
    description: "Build all eligible routes for a month and write a completion report.",
    run: async (args) => {
      const { buildRouteNetworkFromCli } = await import("./jobs/build/route-network-build.js");
      return buildRouteNetworkFromCli(args);
    },
  },
  "build:planned-routes": {
    description: "Compatibility alias for build:routes -- --planned.",
    run: async (args) => {
      const { buildAllRoutesGraphFromCli } = await import("./jobs/build/route-build-graph.js");
      return buildAllRoutesGraphFromCli(["--planned", ...args]);
    },
  },
  "compare:routes": {
    description: "Build route comparison artifacts.",
    run: async (args) => {
      const { buildRouteComparisonFromCli } = await import("./jobs/build/route-comparison.js");
      return buildRouteComparisonFromCli(args);
    },
  },
  "route-batch-audit": {
    description: "Audit route batch artifacts.",
    run: async (args) => {
      const { buildRouteBatchAuditFromCli } = await import("./jobs/build/route-batch-audit.js");
      return buildRouteBatchAuditFromCli(args);
    },
  },
  "build:route-brief": {
    description: "Build route brief input artifacts.",
    run: async (args) => {
      const { buildRouteBriefInputFromCli } = await import("./jobs/build/route-core-artifacts.js");
      return buildRouteBriefInputFromCli(args);
    },
  },
  "build:interventions": {
    description: "Build route intervention overlay artifacts.",
    run: async (args) => {
      const { buildRouteInterventionOverlayFromCli } = await import(
        "./jobs/build/route-secondary-artifacts.js"
      );
      return buildRouteInterventionOverlayFromCli(args);
    },
  },
  "build:bus-lanes": {
    description: "Build route bus-lane overlay artifacts.",
    run: async (args) => {
      const { buildRouteBusLaneOverlayFromCli } = await import(
        "./jobs/build/route-secondary-artifacts.js"
      );
      return buildRouteBusLaneOverlayFromCli(args);
    },
  },
  "build:schedules": {
    description: "Build route schedule comparison artifacts.",
    run: async (args) => {
      const { buildRouteScheduleComparisonFromCli } = await import(
        "./jobs/build/route-secondary-artifacts.js"
      );
      return buildRouteScheduleComparisonFromCli(args);
    },
  },
} satisfies Record<string, Command>;

function commandList(): string {
  return Object.entries(commands)
    .map(([name, command]) => `  ${name.padEnd(32)} ${command.description}`)
    .join("\n");
}

function printUsage(): void {
  console.error(["Usage: bun run src/cli.ts <command> [args...]", "", commandList()].join("\n"));
}

const [commandName, ...args] = Bun.argv.slice(2);

if (commandName === undefined || commandName === "--help" || commandName === "-h") {
  printUsage();
  process.exit(commandName === undefined ? 1 : 0);
}

const command = commands[commandName as keyof typeof commands];

if (command === undefined) {
  console.error(`Unknown pipeline command: ${commandName}`);
  printUsage();
  process.exit(1);
}

const result = await command.run(args);

if (result !== undefined) {
  console.log(JSON.stringify(result, null, 2));
}
