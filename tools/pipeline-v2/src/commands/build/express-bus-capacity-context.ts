import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type NormalizedExpressBusCapacity,
  NormalizedExpressBusCapacitySchema,
} from "@bp/sources/adapters/mta/express-bus-capacity";
import { defineCommand, z } from "@liche/core";
import { writeJson } from "../../lib/json.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { defaultExpressBusCapacityNormalizedPath } from "../ingest/express-bus-capacity.ts";

const staticPeriod = "2023-04-2023-09";

export type BuildExpressBusCapacityContextArgs = {
  inputPath?: string;
  outputPath?: string;
  generatedAt?: Date;
};

type RouteHourSummary = {
  routeId: string;
  direction: string;
  dayType: string;
  hourOfDay: number;
  weekCount: number;
  totalTripsWithApc: number;
  weightedLoadPercentage: number | null;
  peakLoadPercentage: number;
  lowSample: boolean;
};

export type BuildExpressBusCapacityContextResult = {
  outputPath: string;
  rowCount: number;
  summaryCount: number;
  routeCount: number;
};

const NormalizedRowsArtifactSchema = z
  .object({
    rows: z.array(NormalizedExpressBusCapacitySchema),
  })
  .passthrough();

const defaultOutputPath = () =>
  fromRepoRoot(
    join("data/artifacts/express-bus-capacity", `route-hour-summary-${staticPeriod}.json`),
  );

function groupKey(row: NormalizedExpressBusCapacity): string {
  return [row.routeId, row.direction, row.dayType, row.hourOfDay].join("|");
}

function roundLoad(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function summarizeExpressBusCapacityRows(
  rows: NormalizedExpressBusCapacity[],
): RouteHourSummary[] {
  const groups = new Map<
    string,
    {
      first: NormalizedExpressBusCapacity;
      weeks: Set<string>;
      trips: number;
      weightedLoad: number;
      peakLoadPercentage: number;
    }
  >();

  for (const row of rows) {
    const key = groupKey(row);
    const current = groups.get(key) ?? {
      first: row,
      weeks: new Set<string>(),
      trips: 0,
      weightedLoad: 0,
      peakLoadPercentage: row.loadPercentage,
    };

    current.weeks.add(row.weekStartDate);
    current.trips += row.tripsWithApc;
    current.weightedLoad += row.loadPercentage * row.tripsWithApc;
    current.peakLoadPercentage = Math.max(current.peakLoadPercentage, row.loadPercentage);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      routeId: group.first.routeId,
      direction: group.first.direction,
      dayType: group.first.dayType,
      hourOfDay: group.first.hourOfDay,
      weekCount: group.weeks.size,
      totalTripsWithApc: group.trips,
      weightedLoadPercentage:
        group.trips === 0 ? null : roundLoad(group.weightedLoad / group.trips),
      peakLoadPercentage: roundLoad(group.peakLoadPercentage),
      lowSample: group.trips < 10,
    }))
    .sort(
      (a, b) =>
        a.routeId.localeCompare(b.routeId) ||
        a.direction.localeCompare(b.direction) ||
        a.dayType.localeCompare(b.dayType) ||
        a.hourOfDay - b.hourOfDay,
    );
}

export async function buildExpressBusCapacityContext(
  args: BuildExpressBusCapacityContextArgs = {},
): Promise<BuildExpressBusCapacityContextResult> {
  const inputPath = args.inputPath ?? defaultExpressBusCapacityNormalizedPath();
  const outputPath = args.outputPath ?? defaultOutputPath();
  const generatedAt = args.generatedAt ?? new Date();
  const input = NormalizedRowsArtifactSchema.parse(await Bun.file(inputPath).json());
  const summaries = summarizeExpressBusCapacityRows(input.rows);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, {
    schemaVersion: 1,
    sourceId: "mta_express_bus_capacity_2023",
    period: staticPeriod,
    generatedAt: generatedAt.toISOString(),
    caveats: [
      "Express bus routes only.",
      "Load is measured at each route's maximum load point.",
      "Rows do not identify stop boardings, alightings, local/SBS loads, or M15 SBS passenger load.",
      "Low-sample summaries have fewer than 10 APC trips across the grouped weeks.",
    ],
    rows: summaries,
  });

  return {
    outputPath,
    rowCount: input.rows.length,
    summaryCount: summaries.length,
    routeCount: new Set(input.rows.map((row) => row.routeId)).size,
  };
}

export default defineCommand({
  path: ["build", "express-bus-capacity-context"],
  summary: "Aggregate the normalized Express Bus Capacity rows into a route/hour summary artifact.",
  input: {
    options: z.object({
      input: z.string().optional().describe("Path to normalized rows artifact"),
      output: z.string().optional().describe("Output path for the summary artifact"),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    rowCount: z.number(),
    summaryCount: z.number(),
    routeCount: z.number(),
  }),
  async run({ input }) {
    return buildExpressBusCapacityContext({
      ...(input.options.input === undefined ? {} : { inputPath: input.options.input }),
      ...(input.options.output === undefined ? {} : { outputPath: input.options.output }),
    });
  },
});
