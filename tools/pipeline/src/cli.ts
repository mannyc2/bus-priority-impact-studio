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
  "ingest:ace-violations": {
    description: "Fetch monthly ACE violation summaries.",
    run: async (args) => {
      const { ingestAceViolationSummaryFromCli } = await import(
        "./jobs/ingest/ingest-ace-violations.js"
      );
      return ingestAceViolationSummaryFromCli(args);
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
  "brief-artifacts": {
    description: "Build route and corridor brief body artifacts.",
    run: async (args) => {
      const { buildBriefArtifactsFromCli } = await import("./jobs/build/brief-artifacts.js");
      return buildBriefArtifactsFromCli(args);
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
  "check:pipeline-v1": {
    description: "Run the full Data Pipeline v1 QA gate.",
    run: async (args) => {
      const { checkPipelineV1FromCli } = await import("./jobs/check/pipeline-v1.js");
      return checkPipelineV1FromCli(args);
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
