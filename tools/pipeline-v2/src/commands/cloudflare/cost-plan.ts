import { Effect } from "effect";
import { stat } from "node:fs/promises";
import { relative } from "node:path";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { type CloudflareCostSummary, estimateD1PaidCost } from "../../lib/cloudflare-costs.ts";

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

const FileEstimateSchema = Schema.Struct({
  path: Schema.String,
  byteLength: Schema.Number,
  statementCount: Schema.Number,
  insertStatementCount: Schema.Number,
  deleteStatementCount: Schema.Number,
  updateStatementCount: Schema.Number,
  ddlStatementCount: Schema.Number,
});

const CostLineSchema = Schema.Struct({
  metric: Schema.String,
  quantity: Schema.Number,
  includedMonthly: Schema.Number,
  unit: Schema.String,
  billableUnitSize: Schema.Number,
  pricePerBillableUnitUsd: Schema.Number,
  notes: Schema.optionalKey(Schema.Array(Schema.String)),
  billableQuantityFromZero: Schema.Number,
  estimatedOverageUsdFromZero: Schema.Number,
  withinIncludedFromZero: Schema.Boolean,
});

export default defineCommand({
  path: ["cloudflare", "cost-plan"],
  summary: "Estimate Cloudflare D1 paid-plan overage from a SQL file (no Cloudflare API).",
  input: {
    options: Schema.Struct({
      operation: Schema.Literal("d1-sql").pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed("d1-sql")),
      ),
      d1Sql: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Path to a D1 SQL file (e.g. seed.sql)",
      }),
      summary: Schema.optionalKey(Schema.String).annotate({
        description: "Optional export-summary.json whose *RowCount keys sum to row totals",
      }),
    }),
  },
  output: Schema.Struct({
    schemaVersion: Schema.Literal(1),
    operation: Schema.Literal("d1-sql"),
    generatedAt: Schema.String,
    files: Schema.Array(FileEstimateSchema),
    summaryFiles: Schema.Array(Schema.String),
    usageEstimate: Schema.Struct({
      insertedRowsLowerBound: Schema.Number,
      replacementRowsWrittenEstimate: Schema.Number,
      deleteStatementCount: Schema.Number,
      ddlStatementCount: Schema.Number,
      exactRowsWrittenKnownBeforeExecution: Schema.Literal(false),
    }),
    cost: Schema.Struct({
      schemaVersion: Schema.Literal(1),
      pricingAsOf: Schema.String,
      accountPlan: Schema.String,
      incrementalBaseSubscriptionUsd: Schema.Literal(0),
      estimatedOverageUsdFromZero: Schema.Number,
      overageLikelyFromThisOperationAlone: Schema.Boolean,
      lines: Schema.Array(CostLineSchema),
      notes: Schema.Array(Schema.String),
    }),
    notes: Schema.Array(Schema.String),
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
