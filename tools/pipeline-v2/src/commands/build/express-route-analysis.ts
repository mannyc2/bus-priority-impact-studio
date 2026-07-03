import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expressRouteAnalysisAuditPath, expressRouteAnalysisPath } from "@bp/analytics/artifacts";
import {
  buildExpressRouteAnalysisArtifact,
  buildExpressRouteAnalysisAuditArtifact,
  type ExpressRouteAnalysisArtifact,
  ExpressRouteAnalysisArtifactSchema,
  summarizeExpressRouteCapacityRows,
} from "@bp/analytics/feature-history";
import { NormalizedExpressBusCapacitySchema } from "@bp/sources/adapters/mta/express-bus-capacity";
import { getSocrataSource, type SocrataManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { defineCommand, z } from "@liche/core";
import { writeJson } from "../../lib/json.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
  soqlIn,
} from "../../lib/soda3.ts";
import { defaultExpressBusCapacityNormalizedPath } from "../ingest/express-bus-capacity.ts";

export type BuildExpressRouteAnalysisArgs = {
  inputPath?: string;
  outputPath?: string;
  routes?: string[];
  generatedAt?: Date;
  fetcher?: SocrataFetch;
  manifestText?: string;
};

export type BuildExpressRouteAnalysisResult = {
  outputPath: string;
  routeCount: number;
  windowCount: number;
  matchedSpeedWindowCount: number;
  candidateWindowCount: number;
};

export type AuditExpressRouteAnalysisArgs = {
  inputPath?: string;
  outputPath?: string;
  generatedAt?: Date;
};

const NormalizedRowsArtifactSchema = z
  .object({
    rows: z.array(NormalizedExpressBusCapacitySchema),
  })
  .passthrough();

const defaultOutputPath = () =>
  fromRepoRoot(expressRouteAnalysisPath({ artifactRoot: "data/artifacts" }));

const defaultAuditOutputPath = () =>
  fromRepoRoot(expressRouteAnalysisAuditPath({ artifactRoot: "data/artifacts" }));

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchSpeedRows(input: {
  source: SocrataManifestSource;
  routeIds: string[];
  months: string[];
  fetcher?: SocrataFetch;
}): Promise<SocrataRow[]> {
  const rows: SocrataRow[] = [];
  const routeChunks = chunkArray(input.routeIds, 25);

  for (const month of input.months) {
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
      throw new Error(`Invalid ISO month: ${month}`);
    }

    for (const routeChunk of routeChunks) {
      const query: Soda3SoqlQuery = {
        select:
          "route_id,year,month,direction,day_of_week,hour_of_day,count(*) as observation_count,sum(bus_trip_count) as bus_trip_count,avg(average_road_speed) as average_speed_mph",
        where: [
          `year = ${year}`,
          `month = ${monthNumber}`,
          "route_type = 'Express'",
          soqlIn("route_id", routeChunk),
        ].join(" AND "),
        group: "route_id,year,month,direction,day_of_week,hour_of_day",
        order: "route_id,year,month,direction,day_of_week,hour_of_day",
      };
      rows.push(
        ...(await fetchSoda3RowsForSource(input.source, query, {
          fetcher: input.fetcher,
          pageSize: 50_000,
        })),
      );
    }
  }

  return rows;
}

async function readManifest(args: BuildExpressRouteAnalysisArgs): Promise<string> {
  return (
    args.manifestText ?? (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text())
  );
}

export async function buildExpressRouteAnalysis(
  args: BuildExpressRouteAnalysisArgs = {},
): Promise<BuildExpressRouteAnalysisResult> {
  const inputPath = args.inputPath ?? defaultExpressBusCapacityNormalizedPath();
  const outputPath = args.outputPath ?? defaultOutputPath();
  const generatedAt = args.generatedAt ?? new Date();
  const routeFilter = args.routes === undefined ? null : new Set(args.routes);
  const input = NormalizedRowsArtifactSchema.parse(await Bun.file(inputPath).json());
  const capacityInputRows =
    routeFilter === null ? input.rows : input.rows.filter((row) => routeFilter.has(row.routeId));
  const capacityRows = summarizeExpressRouteCapacityRows(capacityInputRows);
  const routeIds = [...new Set(capacityRows.map((row) => row.routeId))].sort();
  const months = [...new Set(capacityRows.map((row) => row.isoMonth))].sort();
  const manifest = loadSourceManifestYaml(await readManifest(args));
  const speedSource = getSocrataSource(manifest, "bus_segment_speeds_2023_2024");
  const rawSpeedRows =
    routeIds.length === 0
      ? []
      : await fetchSpeedRows({
          source: speedSource,
          routeIds,
          months,
          ...(args.fetcher === undefined ? {} : { fetcher: args.fetcher }),
        });
  const artifact = buildExpressRouteAnalysisArtifact({
    capacityRows: capacityInputRows,
    speedRows: rawSpeedRows,
    generatedAt: generatedAt.toISOString(),
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);

  return {
    outputPath,
    routeCount: routeIds.length,
    windowCount: artifact.rows.length,
    matchedSpeedWindowCount: artifact.rows.filter((row) => row.speed !== null).length,
    candidateWindowCount: artifact.rows.filter((row) => row.screening.highLoadSlowSpeedCandidate)
      .length,
  };
}

export async function auditExpressRouteAnalysis(args: AuditExpressRouteAnalysisArgs = {}) {
  const inputPath = args.inputPath ?? defaultOutputPath();
  const outputPath = args.outputPath ?? defaultAuditOutputPath();
  const generatedAt = args.generatedAt ?? new Date();
  const artifact = ExpressRouteAnalysisArtifactSchema.parse(await Bun.file(inputPath).json());
  const result = buildExpressRouteAnalysisAuditArtifact({
    artifact: artifact as ExpressRouteAnalysisArtifact,
    inputPath,
    generatedAt: generatedAt.toISOString(),
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, result);

  if (result.errorCount > 0) {
    throw new Error(`Express route analysis audit failed with ${result.errorCount} error(s).`);
  }

  return result;
}

export default defineCommand({
  path: ["build", "express-route-analysis"],
  summary:
    "Join express capacity and segment speed rows into a screening-grade load/speed context artifact.",
  input: {
    options: z.object({
      input: z.string().optional().describe("Path to normalized rows artifact"),
      output: z.string().optional().describe("Output path for the artifact"),
      routes: z.string().optional().describe("Comma-separated route ids to include"),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    routeCount: z.number(),
    windowCount: z.number(),
    matchedSpeedWindowCount: z.number(),
    candidateWindowCount: z.number(),
  }),
  async run({ input }) {
    const routes =
      input.options.routes === undefined
        ? undefined
        : input.options.routes
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
    return buildExpressRouteAnalysis({
      ...(input.options.input === undefined ? {} : { inputPath: input.options.input }),
      ...(input.options.output === undefined ? {} : { outputPath: input.options.output }),
      ...(routes === undefined ? {} : { routes }),
    });
  },
});
