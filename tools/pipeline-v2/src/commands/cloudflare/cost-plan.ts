import { stat } from "node:fs/promises";
import { relative } from "node:path";
import { defineCommand, z } from "@liche/core";
import {
  type CloudflareCostSummary,
  estimateD1PaidCost,
} from "../../lib/cloudflare-costs.ts";

export type D1SqlFileEstimate = {
  path: string;
  byteLength: number;
  statementCount: number;
  insertStatementCount: number;
  deleteStatementCount: number;
  updateStatementCount: number;
  ddlStatementCount: number;
};

export type D1SqlCostPlan = {
  schemaVersion: 1;
  operation: "d1-sql";
  generatedAt: string;
  files: D1SqlFileEstimate[];
  summaryFiles: string[];
  usageEstimate: {
    insertedRowsLowerBound: number;
    replacementRowsWrittenEstimate: number;
    deleteStatementCount: number;
    ddlStatementCount: number;
    exactRowsWrittenKnownBeforeExecution: false;
  };
  cost: CloudflareCostSummary;
  notes: string[];
};

function countMatches(sql: string, pattern: RegExp): number {
  return sql.match(pattern)?.length ?? 0;
}

function countStatements(sql: string): number {
  return sql
    .split(/;|-->\s*statement-breakpoint/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("-->")).length;
}

async function estimateSqlFile(path: string): Promise<D1SqlFileEstimate> {
  const [fileStat, sql] = await Promise.all([stat(path), Bun.file(path).text()]);
  return {
    path,
    byteLength: fileStat.size,
    statementCount: countStatements(sql),
    insertStatementCount: countMatches(sql, /\binsert\s+into\b/gi),
    deleteStatementCount: countMatches(sql, /\bdelete\s+from\b/gi),
    updateStatementCount: countMatches(sql, /\bupdate\b/gi),
    ddlStatementCount: countMatches(sql, /\b(create|alter|drop)\s+(table|index)\b/gi),
  };
}

async function readSummaryInsertedRows(path: string): Promise<number | null> {
  const summary = (await Bun.file(path).json()) as Record<string, unknown>;
  let total = 0;
  let found = false;
  for (const [key, value] of Object.entries(summary)) {
    if (!key.endsWith("RowCount") || typeof value !== "number") continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

export async function runCloudflareCostPlan(opts: {
  d1SqlPaths: readonly string[];
  summaryPaths?: readonly string[] | undefined;
}): Promise<D1SqlCostPlan> {
  if (opts.d1SqlPaths.length === 0) {
    throw new Error("runCloudflareCostPlan: at least one d1Sql path is required.");
  }
  const summaryPaths = opts.summaryPaths ?? [];
  const [files, summaryRowCounts] = await Promise.all([
    Promise.all(opts.d1SqlPaths.map((p) => estimateSqlFile(p))),
    Promise.all(summaryPaths.map((p) => readSummaryInsertedRows(p))),
  ]);
  const summaryInsertedRows = summaryRowCounts.reduce<number | null>((sum, value) => {
    if (value === null) return sum;
    return (sum ?? 0) + value;
  }, null);
  const insertStatementCount = files.reduce((sum, file) => sum + file.insertStatementCount, 0);
  const insertedRowsLowerBound =
    summaryInsertedRows === null
      ? insertStatementCount
      : Math.max(summaryInsertedRows, insertStatementCount);
  const deleteStatementCount = files.reduce((sum, file) => sum + file.deleteStatementCount, 0);
  const ddlStatementCount = files.reduce((sum, file) => sum + file.ddlStatementCount, 0);
  const replacementRowsWrittenEstimate =
    insertedRowsLowerBound + (deleteStatementCount > 0 ? insertedRowsLowerBound : 0);

  return {
    schemaVersion: 1,
    operation: "d1-sql",
    generatedAt: new Date().toISOString(),
    files,
    summaryFiles: [...summaryPaths],
    usageEstimate: {
      insertedRowsLowerBound,
      replacementRowsWrittenEstimate,
      deleteStatementCount,
      ddlStatementCount,
      exactRowsWrittenKnownBeforeExecution: false,
    },
    cost: estimateD1PaidCost({ rowsWritten: replacementRowsWrittenEstimate }, [
      "D1 SQL dry-runs do not execute against Cloudflare. The rows-written estimate uses export summary row counts when available, otherwise insert statement count.",
      "DELETE and DDL costs are not exactly knowable before remote execution; wrangler --json results, D1 query meta, or the Cloudflare dashboard are authoritative after execution.",
    ]),
    notes: [
      "replacementRowsWrittenEstimate assumes this publish replaces roughly the same number of existing table rows that it inserts.",
      "A first-time seed may write closer to insertedRowsLowerBound because scoped DELETE statements can affect zero existing rows.",
      "Indexes can increase D1 rows written beyond table-row counts.",
    ],
  };
}

const FileEstimateSchema = z.object({
  path: z.string(),
  byteLength: z.number(),
  statementCount: z.number(),
  insertStatementCount: z.number(),
  deleteStatementCount: z.number(),
  updateStatementCount: z.number(),
  ddlStatementCount: z.number(),
});

const CostLineSchema = z.object({
  metric: z.string(),
  quantity: z.number(),
  includedMonthly: z.number(),
  unit: z.string(),
  billableUnitSize: z.number(),
  pricePerBillableUnitUsd: z.number(),
  notes: z.array(z.string()).optional(),
  billableQuantityFromZero: z.number(),
  estimatedOverageUsdFromZero: z.number(),
  withinIncludedFromZero: z.boolean(),
});

export default defineCommand({
  path: ["cloudflare", "cost-plan"],
  summary: "Estimate Cloudflare D1 paid-plan overage from a SQL file (no Cloudflare API).",
  input: {
    options: z.object({
      operation: z.literal("d1-sql").default("d1-sql"),
      d1Sql: z.string().min(1).describe("Path to a D1 SQL file (e.g. seed.sql)"),
      summary: z
        .string()
        .optional()
        .describe("Optional export-summary.json whose *RowCount keys sum to row totals"),
    }),
  },
  output: z.object({
    schemaVersion: z.literal(1),
    operation: z.literal("d1-sql"),
    generatedAt: z.string(),
    files: z.array(FileEstimateSchema),
    summaryFiles: z.array(z.string()),
    usageEstimate: z.object({
      insertedRowsLowerBound: z.number(),
      replacementRowsWrittenEstimate: z.number(),
      deleteStatementCount: z.number(),
      ddlStatementCount: z.number(),
      exactRowsWrittenKnownBeforeExecution: z.literal(false),
    }),
    cost: z.object({
      schemaVersion: z.literal(1),
      pricingAsOf: z.string(),
      accountPlan: z.string(),
      incrementalBaseSubscriptionUsd: z.literal(0),
      estimatedOverageUsdFromZero: z.number(),
      overageLikelyFromThisOperationAlone: z.boolean(),
      lines: z.array(CostLineSchema),
      notes: z.array(z.string()),
    }),
    notes: z.array(z.string()),
  }),
  async run({ ctx, input }) {
    const plan = await runCloudflareCostPlan({
      d1SqlPaths: [input.options.d1Sql],
      summaryPaths: input.options.summary === undefined ? undefined : [input.options.summary],
    });
    if (!ctx.isTty) {
      const display = relative(process.cwd(), plan.files[0]?.path ?? "");
      console.error(
        `cloudflare-cost-plan d1-sql: ${display} rowsWrittenEstimate=${plan.usageEstimate.replacementRowsWrittenEstimate} overageFromZero=$${plan.cost.estimatedOverageUsdFromZero.toFixed(2)}`,
      );
    }
    return plan;
  },
});
