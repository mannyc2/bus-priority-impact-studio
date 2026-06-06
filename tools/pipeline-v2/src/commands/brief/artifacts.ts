import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type BriefFile,
  type BriefFileMetadata,
  briefFileMetadata,
  buildObservedReliabilityWindows,
  type CorridorBriefArtifactContext,
  corridorBriefFiles,
  type RouteBriefArtifactContext,
  routeBriefArtifactNames,
  routeBriefFiles,
} from "@bp/applied-research/route-briefs";
import type {
  LocalCorridorArtifact,
  LocalCorridorHotspot,
  LocalCorridorInterventionContext,
  LocalCorridorRouteMember,
  LocalGtfsRtFeedSnapshot,
  LocalObservedHeadwaySample,
  LocalRouteArtifact,
  LocalRouteInterventionComparison,
} from "@bp/db/local";
import {
  listCorridorHotspots,
  listCorridorInterventionContexts,
  listCorridorMonthSummaries,
  listCorridorRouteMembers,
  listCorridors,
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listObservedHeadwaySamples,
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteHotspots,
  listRouteInterventionComparisons,
  listRouteObservedReliabilitySummaries,
  listRouteReliabilityBaselines,
  replaceCorridorArtifacts,
  replaceRouteArtifactsForMonth,
  replaceRouteBatch,
} from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

const topObservedWindowLimit = 5;

type BriefArtifactsResult = {
  isoMonth: string;
  routeBriefCount: number;
  corridorBriefCount: number;
  routeArtifactCount: number;
  corridorArtifactCount: number;
  totalByteLength: number;
};

type BriefData = {
  routes: RouteBriefArtifactContext[];
  corridors: CorridorBriefArtifactContext[];
};

async function writeBriefFile(file: BriefFile, artifactRoot: string): Promise<BriefFileMetadata> {
  const path = join(artifactRoot, file.artifactKey);
  const metadata = briefFileMetadata(file);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, file.content);

  return metadata;
}

async function readBriefData(args: {
  local: OpenLocalPipelineDb;
  month: string;
  generatedAt: string;
}): Promise<BriefData> {
  const local = args.local;
  {
    const [
      routeSummaries,
      routeCatalog,
      observedReliability,
      scheduledReliability,
      interventionComparisons,
      collectionRuns,
      corridors,
      corridorSummaries,
      corridorMembers,
      corridorHotspots,
      corridorInterventionContexts,
    ] = await Promise.all([
      listRouteBriefSummaries(local.db, args.month),
      listRouteCatalog(local.db),
      listRouteObservedReliabilitySummaries(local.db, args.month),
      listRouteReliabilityBaselines(local.db, args.month),
      listRouteInterventionComparisons(local.db, args.month),
      listGtfsRtCollectionRuns(local.db),
      listCorridors(local.db),
      listCorridorMonthSummaries(local.db, args.month),
      listCorridorRouteMembers(local.db, args.month),
      listCorridorHotspots(local.db, args.month),
      listCorridorInterventionContexts(local.db, args.month),
    ]);
    const catalogByRoute = new Map(routeCatalog.map((row) => [row.routeId, row]));
    const reliabilityByRoute = new Map(observedReliability.map((row) => [row.routeId, row]));
    const scheduledByRoute = new Map(scheduledReliability.map((row) => [row.routeId, row]));
    const collectionRunIds = new Set(observedReliability.map((row) => row.runId));
    const collectionByRun = new Map(
      collectionRuns
        .filter((row) => collectionRunIds.has(row.runId))
        .map((row) => [row.runId, row]),
    );
    const feedSnapshotsByRun = new Map<string, LocalGtfsRtFeedSnapshot[]>();
    await Promise.all(
      [...collectionRunIds].map(async (runId) => {
        feedSnapshotsByRun.set(runId, await listGtfsRtFeedSnapshots(local.db, runId));
      }),
    );
    const observedSamplesByRun = new Map<string, LocalObservedHeadwaySample[]>();
    await Promise.all(
      [...collectionRunIds].map(async (runId) => {
        observedSamplesByRun.set(runId, await listObservedHeadwaySamples(local.db, runId));
      }),
    );
    const interventionsByRoute = new Map<string, LocalRouteInterventionComparison[]>();
    for (const row of interventionComparisons) {
      const group = interventionsByRoute.get(row.routeId) ?? [];
      group.push(row);
      interventionsByRoute.set(row.routeId, group);
    }

    const routes: RouteBriefArtifactContext[] = [];
    for (const summary of routeSummaries.filter((row) => row.publicVisible)) {
      const reliability = reliabilityByRoute.get(summary.routeId) ?? null;
      const collection = reliability === null ? undefined : collectionByRun.get(reliability.runId);
      routes.push({
        summary,
        catalog: catalogByRoute.get(summary.routeId) ?? null,
        hotspots: await listRouteHotspots(local.db, summary.routeId, args.month),
        reliability,
        reliabilityCollection:
          reliability === null || collection === undefined
            ? null
            : {
                run: collection,
                feedSnapshots: feedSnapshotsByRun.get(reliability.runId) ?? [],
              },
        reliabilityWindows:
          reliability === null
            ? { topLongGapWindows: [], topBunchingWindows: [] }
            : buildObservedReliabilityWindows({
                reliability,
                samples: observedSamplesByRun.get(reliability.runId) ?? [],
                limit: topObservedWindowLimit,
              }),
        scheduledReliability: scheduledByRoute.get(summary.routeId) ?? null,
        interventions: interventionsByRoute.get(summary.routeId) ?? [],
        generatedAt: args.generatedAt,
      });
    }

    const corridorsById = new Map(corridors.map((row) => [row.corridorId, row]));
    const membersByCorridor = new Map<string, LocalCorridorRouteMember[]>();
    for (const row of corridorMembers) {
      const group = membersByCorridor.get(row.corridorId) ?? [];
      group.push(row);
      membersByCorridor.set(row.corridorId, group);
    }
    const hotspotsByCorridor = new Map<string, LocalCorridorHotspot[]>();
    for (const row of corridorHotspots) {
      const group = hotspotsByCorridor.get(row.corridorId) ?? [];
      group.push(row);
      hotspotsByCorridor.set(row.corridorId, group);
    }
    const interventionContextsByCorridor = new Map<string, LocalCorridorInterventionContext[]>();
    for (const row of corridorInterventionContexts) {
      const group = interventionContextsByCorridor.get(row.corridorId) ?? [];
      group.push(row);
      interventionContextsByCorridor.set(row.corridorId, group);
    }

    return {
      routes,
      corridors: corridorSummaries.map((summary) => {
        const corridor = corridorsById.get(summary.corridorId);
        if (corridor === undefined) {
          throw new Error(`Missing corridor row for ${summary.corridorId}`);
        }

        return {
          corridor,
          summary,
          members: membersByCorridor.get(summary.corridorId) ?? [],
          hotspots: hotspotsByCorridor.get(summary.corridorId) ?? [],
          interventionContext: interventionContextsByCorridor.get(summary.corridorId) ?? [],
          generatedAt: args.generatedAt,
        };
      }),
    };
  }
}

export type BriefArtifactsInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  artifactRoot?: string | undefined;
};

export async function runBriefArtifacts(
  inputs: BriefArtifactsInputs,
): Promise<BriefArtifactsResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const generatedAt = new Date().toISOString();
  const data = await readBriefData({
    local: inputs.local,
    month,
    generatedAt,
  });
  const routeArtifacts: LocalRouteArtifact[] = [];
  const corridorArtifacts: LocalCorridorArtifact[] = [];

  for (const route of data.routes) {
    for (const artifact of routeBriefFiles(route)) {
      const written = await writeBriefFile(artifact, artifactRoot);
      routeArtifacts.push({
        routeId: route.summary.routeId,
        month: route.summary.month,
        artifactName: written.name,
        artifactKey: written.artifactKey,
        contentType: written.contentType,
        byteLength: written.byteLength,
        sha256: written.sha256,
      });
    }
  }

  for (const corridor of data.corridors) {
    for (const artifact of corridorBriefFiles(corridor)) {
      const written = await writeBriefFile(artifact, artifactRoot);
      corridorArtifacts.push({
        corridorId: corridor.summary.corridorId,
        month: corridor.summary.month,
        artifactName: written.name,
        artifactKey: written.artifactKey,
        contentType: written.contentType,
        byteLength: written.byteLength,
        sha256: written.sha256,
      });
    }
  }

  await replaceRouteArtifactsForMonth(inputs.local.db, month, routeArtifacts);
  await replaceCorridorArtifacts(inputs.local.db, month, corridorArtifacts);

  const allRouteBriefs = await listRouteBriefSummaries(inputs.local.db, month);
  const routeArtifactCounts = new Map<string, number>();
  for (const artifact of routeArtifacts) {
    routeArtifactCounts.set(artifact.routeId, (routeArtifactCounts.get(artifact.routeId) ?? 0) + 1);
  }
  const batchIssues = allRouteBriefs
    .filter(
      (route) =>
        route.publicVisible &&
        (routeArtifactCounts.get(route.routeId) ?? 0) < routeBriefArtifactNames.length,
    )
    .map((route, index) => ({
      month,
      issueRank: index + 1,
      routeId: route.routeId,
      severity: "error",
      issueCode: "route_brief_artifacts_incomplete",
      message: `Route ${route.routeId} has ${routeArtifactCounts.get(route.routeId) ?? 0}/${routeBriefArtifactNames.length} generated brief artifacts.`,
    }));
  await replaceRouteBatch(inputs.local.db, {
    status: {
      month,
      generatedAt,
      status: batchIssues.length === 0 ? "pass" : "fail",
      routeCount: allRouteBriefs.length,
      artifactCount: routeArtifacts.length + corridorArtifacts.length,
      missingArtifactCount: batchIssues.length,
      hashMismatchCount: 0,
      byteLengthMismatchCount: 0,
      totalByteLength: [...routeArtifacts, ...corridorArtifacts].reduce(
        (sum, artifact) => sum + artifact.byteLength,
        0,
      ),
      issueCount: batchIssues.length,
    },
    builtRoutes: [...allRouteBriefs]
      .sort((left, right) => {
        if (left.routeScore !== right.routeScore) return left.routeScore - right.routeScore;
        if (left.averageSpeedMph !== right.averageSpeedMph) {
          return left.averageSpeedMph - right.averageSpeedMph;
        }
        return left.routeId.localeCompare(right.routeId);
      })
      .map((route, index) => ({
        month,
        routeRank: index + 1,
        routeId: route.routeId,
        artifactCount: routeArtifactCounts.get(route.routeId) ?? 0,
        status: "built",
      })),
    issues: batchIssues,
  });

  return {
    isoMonth: month,
    routeBriefCount: data.routes.length,
    corridorBriefCount: data.corridors.length,
    routeArtifactCount: routeArtifacts.length,
    corridorArtifactCount: corridorArtifacts.length,
    totalByteLength: [...routeArtifacts, ...corridorArtifacts].reduce(
      (sum, artifact) => sum + artifact.byteLength,
      0,
    ),
  };
}

export default defineCommand({
  path: ["brief", "artifacts"],
  summary: "Build per-route and per-corridor brief artifacts (JSON, Markdown, HTML).",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    routeBriefCount: z.number(),
    corridorBriefCount: z.number(),
    routeArtifactCount: z.number(),
    corridorArtifactCount: z.number(),
    totalByteLength: z.number(),
  }),
  async run({ ctx, input }) {
    return runBriefArtifacts({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
    });
  },
});
