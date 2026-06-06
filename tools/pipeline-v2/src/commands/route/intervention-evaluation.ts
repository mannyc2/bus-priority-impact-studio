import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocumentAnchorEventsForRouteEvaluation,
  defaultInterventionEvaluationComparisonRouteCount,
  defaultInterventionEvaluationMinSampleMonths,
  defaultInterventionEvaluationWindowMonths,
  documentOperationalDateSourceId,
  parseBusLaneOpenDates,
  runRouteInterventionEvaluation as runRouteInterventionEvaluationFromAppliedResearch,
} from "@bp/applied-research/local-db";
import {
  type OperationalDateAssertion,
  OperationalDateAssertionSchema,
} from "@bp/domain/documents/operational-date";
import { arg, defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

type DocumentOperationalDateAssertionsArtifact = {
  rows?: unknown[];
};

const defaultDocumentOperationalDateAssertionsPath = fromRepoRoot(
  join(
    "data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-derived-surfaces-v1",
    "document-operational-date-assertions-v1.json",
  ),
);

export type { RouteInterventionEvaluationResult } from "@bp/applied-research/local-db";
export {
  buildDocumentAnchorEventsForRouteEvaluation,
  documentOperationalDateSourceId,
  parseBusLaneOpenDates,
};

async function loadDocumentOperationalDateAssertions(
  path: string,
): Promise<OperationalDateAssertion[]> {
  if (!existsSync(path)) return [];
  const artifact = (await Bun.file(path).json()) as DocumentOperationalDateAssertionsArtifact;
  const rows = Array.isArray(artifact.rows) ? artifact.rows : [];
  const assertions: OperationalDateAssertion[] = [];
  for (const row of rows) {
    if (
      typeof row !== "object" ||
      row === null ||
      (row as { causalAnchorEligible?: unknown }).causalAnchorEligible !== true
    ) {
      continue;
    }
    const parsed = OperationalDateAssertionSchema.safeParse(row);
    if (parsed.success) assertions.push(parsed.data);
  }
  return assertions;
}

export async function runRouteInterventionEvaluation(
  inputs: Parameters<typeof runRouteInterventionEvaluationFromAppliedResearch>[0] & {
    documentOperationalDateAssertionsPath?: string | undefined;
  },
): ReturnType<typeof runRouteInterventionEvaluationFromAppliedResearch> {
  const documentOperationalDateAssertions = await loadDocumentOperationalDateAssertions(
    inputs.documentOperationalDateAssertionsPath ?? defaultDocumentOperationalDateAssertionsPath,
  );
  return runRouteInterventionEvaluationFromAppliedResearch({
    ...inputs,
    documentOperationalDateAssertions,
  });
}

export default defineCommand({
  path: ["route", "intervention-evaluation"],
  summary:
    "Evaluate route-level before/after for ACE, bus-lane, and document-anchor interventions.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      routeUniverseYear: arg
        .positiveInt()
        .optional()
        .describe("Year for route universe/treatment inventory; defaults to analysis year"),
      routeUniverseMonth: arg
        .positiveInt()
        .optional()
        .describe("Month for route universe/treatment inventory; defaults to analysis month"),
      documentOperationalDateAssertionsPath: z
        .string()
        .optional()
        .describe("Anchor-ready Tier 2 operational-date assertions artifact path"),
      windowMonths: arg
        .positiveInt()
        .default(defaultInterventionEvaluationWindowMonths)
        .describe("Pre/post window length in months"),
      minSampleMonths: arg
        .positiveInt()
        .default(defaultInterventionEvaluationMinSampleMonths)
        .describe("Minimum monthly samples per side"),
      comparisonRouteCount: arg
        .positiveInt()
        .default(defaultInterventionEvaluationComparisonRouteCount)
        .describe("Number of comparison routes for peer adjustment"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    routeUniverseMonth: z.string(),
    routeCount: z.number(),
    eventCount: z.number(),
    comparisonCount: z.number(),
    documentAnchorEventCount: z.number(),
    documentAnchorComparisonCount: z.number(),
    evaluatedComparisonCount: z.number(),
    futureComparisonCount: z.number(),
    insufficientComparisonCount: z.number(),
    sourceGapComparisonCount: z.number(),
  }),
  async run({ ctx, input }) {
    const documentOperationalDateAssertionsPath =
      input.options.documentOperationalDateAssertionsPath === undefined
        ? defaultDocumentOperationalDateAssertionsPath
        : fromCliPath(input.options.documentOperationalDateAssertionsPath);
    return runRouteInterventionEvaluation({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      routeUniverseYear: input.options.routeUniverseYear,
      routeUniverseMonth: input.options.routeUniverseMonth,
      windowMonths: input.options.windowMonths,
      minSampleMonths: input.options.minSampleMonths,
      comparisonRouteCount: input.options.comparisonRouteCount,
      documentOperationalDateAssertionsPath,
    });
  },
});
