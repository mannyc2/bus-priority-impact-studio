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
  "ingest:ace-routes": {
    description: "Fetch ACE route implementation rows.",
    run: async () => {
      const { ingestAceRoutes } = await import("./jobs/ingest/ingest-ace-routes.js");
      return ingestAceRoutes();
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
  "ingest:m1": {
    description: "Ingest one route slice; defaults to M1.",
    run: async (args) => {
      const { ingestM1RouteSlice, parseM1SliceCliArgs } = await import("./jobs/ingest/m1-slice.js");
      return ingestM1RouteSlice(parseM1SliceCliArgs(args));
    },
  },
  "ingest:m1-schedules": {
    description: "Ingest route schedule timepoints; defaults to M1.",
    run: async (args) => {
      const { ingestM1SchedulesFromCli } = await import("./jobs/ingest/ingest-m1-schedules.js");
      return ingestM1SchedulesFromCli(args);
    },
  },
  "hotspots:m1": {
    description: "Build route hotspot artifacts; defaults to M1.",
    run: async (args) => {
      const { buildM1HotspotsFromCli } = await import("./jobs/build/m1-hotspots.js");
      return buildM1HotspotsFromCli(args);
    },
  },
  "ridership-profile:m1": {
    description: "Build route ridership profile artifacts; defaults to M1.",
    run: async (args) => {
      const { buildM1RidershipProfileFromCli } = await import(
        "./jobs/build/m1-ridership-profile.js"
      );
      return buildM1RidershipProfileFromCli(args);
    },
  },
  "speed-profile:m1": {
    description: "Build route speed profile artifacts; defaults to M1.",
    run: async (args) => {
      const { buildM1SpeedProfileFromCli } = await import("./jobs/build/m1-speed-profile.js");
      return buildM1SpeedProfileFromCli(args);
    },
  },
  "build:routes": {
    description: "Build route slice artifacts for a batch.",
    run: async (args) => {
      const { buildRouteBatchArtifactsFromCli } = await import(
        "./jobs/build/route-slice-pipeline.js"
      );
      return buildRouteBatchArtifactsFromCli(args);
    },
  },
  "build:planned-routes": {
    description: "Build routes selected by the route build plan.",
    run: async (args) => {
      const { buildPlannedRouteBatchFromCli } = await import("./jobs/build/planned-route-batch.js");
      return buildPlannedRouteBatchFromCli(args);
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
  "route-brief:m1": {
    description: "Build route brief input artifacts; defaults to M1.",
    run: async (args) => {
      const { buildM1RouteBriefInputFromCli } = await import(
        "./jobs/build/m1-route-brief-input.js"
      );
      return buildM1RouteBriefInputFromCli(args);
    },
  },
  "interventions:m1": {
    description: "Build route intervention overlay artifacts; defaults to M1.",
    run: async (args) => {
      const { buildM1InterventionOverlayFromCli } = await import(
        "./jobs/build/m1-intervention-overlay.js"
      );
      return buildM1InterventionOverlayFromCli(args);
    },
  },
  "bus-lanes:m1": {
    description: "Build route bus-lane overlay artifacts; defaults to M1.",
    run: async (args) => {
      const { buildM1BusLaneOverlayFromCli } = await import("./jobs/build/m1-bus-lane-overlay.js");
      return buildM1BusLaneOverlayFromCli(args);
    },
  },
  "schedules:m1": {
    description: "Build route schedule comparison artifacts; defaults to M1.",
    run: async (args) => {
      const { buildM1ScheduleComparisonFromCli } = await import(
        "./jobs/build/m1-schedule-comparison.js"
      );
      return buildM1ScheduleComparisonFromCli(args);
    },
  },
  "artifacts:m1": {
    description: "Build route artifact manifest; defaults to M1.",
    run: async (args) => {
      const { buildM1ArtifactManifestFromCli } = await import(
        "./jobs/build/m1-artifact-manifest.js"
      );
      return buildM1ArtifactManifestFromCli(args);
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
