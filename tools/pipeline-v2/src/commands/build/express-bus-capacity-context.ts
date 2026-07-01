import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expressBusCapacityContextPath } from "@bp/analytics/artifacts";
import {
  buildExpressBusCapacityContextArtifact,
  summarizeExpressBusCapacityRows,
} from "@bp/analytics/feature-history";
import { NormalizedExpressBusCapacitySchema } from "@bp/sources/adapters/mta/express-bus-capacity";
import { defineCommand, z } from "@liche/core";
import { writeJson } from "../../lib/json.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { defaultExpressBusCapacityNormalizedPath } from "../ingest/express-bus-capacity.ts";

export type BuildExpressBusCapacityContextArgs = {
  inputPath?: string;
  outputPath?: string;
  generatedAt?: Date;
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
  fromRepoRoot(expressBusCapacityContextPath({ artifactRoot: "data/artifacts" }));

export { summarizeExpressBusCapacityRows };

export async function buildExpressBusCapacityContext(
  args: BuildExpressBusCapacityContextArgs = {},
): Promise<BuildExpressBusCapacityContextResult> {
  const inputPath = args.inputPath ?? defaultExpressBusCapacityNormalizedPath();
  const outputPath = args.outputPath ?? defaultOutputPath();
  const generatedAt = args.generatedAt ?? new Date();
  const input = NormalizedRowsArtifactSchema.parse(await Bun.file(inputPath).json());
  const artifact = buildExpressBusCapacityContextArtifact({
    rows: input.rows,
    generatedAt: generatedAt.toISOString(),
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);

  return {
    outputPath,
    rowCount: input.rows.length,
    summaryCount: artifact.rows.length,
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
