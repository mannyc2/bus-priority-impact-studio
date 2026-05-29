import type { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

const SourceRoleSchema = z.enum([
  "baseline",
  "historical",
  "release_context",
  "current_signal",
  "deferred",
]);

const SourceDecisionSchema = z.enum([
  "complete_for_history",
  "backfill_required",
  "release_context_only",
  "current_signal_only",
  "excluded_until_fixed",
]);
const EvidenceRoleSchema = z.enum([
  "primary",
  "context",
  "caveat",
  "missing_data",
  "coverage_audit",
]);
const DetectorEligibilitySchema = z.enum([
  "automatic_primary",
  "manual_review_primary",
  "context_only",
  "current_signal_only",
  "missing_data_only",
  "blocked",
]);

export type SourceRole = z.infer<typeof SourceRoleSchema>;
export type SourceDecision = z.infer<typeof SourceDecisionSchema>;
export type EvidenceRole = z.infer<typeof EvidenceRoleSchema>;
export type DetectorEligibility = z.infer<typeof DetectorEligibilitySchema>;

export type SourceCoverageLedgerEntry = {
  sourceId: string;
  tableName: string;
  role: SourceRole;
  decision: SourceDecision;
  rowCount: number;
  range: {
    min: string | null;
    max: string | null;
    monthCount: number | null;
  };
  geocode: {
    geocodedRows: number | null;
    geocodeRate: number | null;
  };
  join: {
    joinedRows: number | null;
    joinRate: number | null;
  };
  readiness: {
    status: "ready" | "needs_backfill" | "needs_decision" | "blocked" | "sample_only";
    reasons: string[];
  };
  evidence: {
    allowedRoles: EvidenceRole[];
    detectorEligibility: DetectorEligibility;
    primaryEvidenceAllowed: boolean;
    automaticPromotionAllowed: boolean;
    blockers: string[];
  };
};

export type SourceCoverageLedger = {
  generatedAt: string;
  month: string;
  dbPath: string | null;
  summary: {
    sourceCount: number;
    decisionCounts: Record<SourceDecision, number>;
    detectorEligibilityCounts: Record<DetectorEligibility, number>;
    sourcesNeedingAction: number;
  };
  sources: SourceCoverageLedgerEntry[];
};

export type SourceConfig = {
  sourceId: string;
  tableName: string;
  dateExpression: string;
  role: SourceRole;
  targetStartMonth?: string;
  targetEndMonth?: string;
  geocodeColumn?: string;
  joinTable?: string;
  joinSourceId?: string;
  joinSourceIds?: readonly string[];
  minGeocodeRate?: number;
  requiredCoverageColumns?: readonly { columnName: string; label: string }[];
  requireRows?: boolean;
  forceDecision?: SourceDecision;
  forceReason?: string;
  detectorEligibility?: DetectorEligibility;
  allowedEvidenceRoles?: readonly EvidenceRole[];
  automaticPromotionAllowed?: boolean;
};

const DECISIONS: readonly SourceDecision[] = SourceDecisionSchema.options;

const SOURCE_CONFIGS: readonly SourceConfig[] = [
  {
    sourceId: "route_month_trends",
    tableName: "local_route_month_trend",
    dateExpression: "month",
    role: "baseline",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-03",
    requireRows: true,
    requiredCoverageColumns: [
      { columnName: "has_speed_trend", label: "speed trend" },
      { columnName: "has_ridership_trend", label: "ridership trend" },
    ],
  },
  {
    sourceId: "dot_street_permits",
    tableName: "local_dot_street_permit",
    dateExpression: "COALESCE(issued_work_start_date, permit_issue_date)",
    role: "historical",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-04",
    geocodeColumn: "physical_id",
    joinTable: "local_context_event",
    joinSourceIds: ["nyc_dot_street_construction_permits", "nyc_dot_street_opening_permits"],
    minGeocodeRate: 0.9,
    detectorEligibility: "automatic_primary",
  },
  {
    sourceId: "nypd_collisions",
    tableName: "local_nypd_collision",
    dateExpression: "crash_date",
    role: "historical",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-04",
    geocodeColumn: "physical_id",
    joinTable: "local_context_event",
    joinSourceId: "nypd_motor_vehicle_collisions",
    minGeocodeRate: 0.9,
    detectorEligibility: "manual_review_primary",
  },
  {
    sourceId: "ace_violation_summaries",
    tableName: "local_ace_violation_summary",
    dateExpression: "month",
    role: "historical",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-04",
    detectorEligibility: "automatic_primary",
  },
  {
    sourceId: "dot_bus_lanes",
    tableName: "local_bus_lane",
    dateExpression: "NULL",
    role: "release_context",
    requireRows: true,
    forceReason:
      "DOT bus lanes are loaded as a current geometry inventory. Open dates are source fields where present, but lane-overlap claims should use the release geometry snapshot rather than infer a full historical treatment panel.",
    detectorEligibility: "manual_review_primary",
    allowedEvidenceRoles: ["primary", "context", "caveat", "coverage_audit"],
    automaticPromotionAllowed: false,
  },
  {
    sourceId: "observed_reliability",
    tableName: "local_route_observed_reliability_summary",
    dateExpression: "month",
    role: "historical",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-05",
    detectorEligibility: "automatic_primary",
  },
  {
    sourceId: "bus_wait_assessment",
    tableName: "local_bus_wait_assessment",
    dateExpression: "month",
    role: "historical",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-03",
    requireRows: true,
    detectorEligibility: "automatic_primary",
  },
  {
    sourceId: "311_service_requests",
    tableName: "local_311_service_request",
    dateExpression: "created_date",
    role: "historical",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-03",
    geocodeColumn: "physical_id",
    joinTable: "local_context_event",
    joinSourceIds: ["nyc_311_service_requests_current", "nyc_311_service_requests_historical"],
    forceReason:
      "Raw 311 history is loaded for the target window, but route-context use is limited to geocoded/joined rows and must carry join-rate caveats.",
    detectorEligibility: "manual_review_primary",
    automaticPromotionAllowed: false,
  },
  {
    sourceId: "parking_violations",
    tableName: "local_parking_violation",
    dateExpression: "issue_date",
    role: "release_context",
    geocodeColumn: "physical_id",
    joinTable: "local_context_event",
    joinSourceId: "nyc_parking_violations_current",
    forceDecision: "release_context_only",
    forceReason:
      "Parking is raw-complete for the 2023-present window. Dedicated parking location candidates recover route context for many camera and street-code rows, but physical_id geocoding remains low and candidate fanout/confidence must stay visible; use as release context, not detector-grade historical evidence.",
    detectorEligibility: "context_only",
    automaticPromotionAllowed: false,
  },
  {
    sourceId: "dot_traffic_volume_counts",
    tableName: "local_dot_traffic_volume_count",
    dateExpression: "sampled_at",
    role: "release_context",
    geocodeColumn: "physical_id",
    joinTable: "local_context_event",
    joinSourceId: "nyc_dot_automated_traffic_volume_counts",
    forceDecision: "release_context_only",
    forceReason: "Current corpus has a sampled January 2024 window, not full historical coverage.",
    detectorEligibility: "context_only",
    automaticPromotionAllowed: false,
  },
  {
    sourceId: "dot_traffic_speeds",
    tableName: "local_dot_traffic_speed",
    dateExpression: "sampled_at",
    role: "current_signal",
    geocodeColumn: "physical_id",
    joinTable: "local_context_event",
    joinSourceId: "nyc_dot_real_time_traffic_speeds",
    forceDecision: "current_signal_only",
    forceReason:
      "Live DOT traffic speeds are a current snapshot source, not a historical backfill.",
    detectorEligibility: "current_signal_only",
    automaticPromotionAllowed: false,
  },
  {
    sourceId: "weather_observations",
    tableName: "local_weather_observation",
    dateExpression: "date",
    role: "historical",
    targetStartMonth: "2023-04",
    targetEndMonth: "2026-05",
    detectorEligibility: "manual_review_primary",
    automaticPromotionAllowed: false,
  },
  {
    sourceId: "equity_context",
    tableName: "local_route_equity_context",
    dateExpression: "month",
    role: "baseline",
    requireRows: true,
    targetStartMonth: "2026-03",
    targetEndMonth: "2026-03",
    detectorEligibility: "context_only",
    automaticPromotionAllowed: false,
  },
];

const SourceCoverageLedgerEntrySchema = z.object({
  sourceId: z.string().min(1),
  tableName: z.string().min(1),
  role: SourceRoleSchema,
  decision: SourceDecisionSchema,
  rowCount: z.number().int().nonnegative(),
  range: z.object({
    min: z.string().nullable(),
    max: z.string().nullable(),
    monthCount: z.number().int().nonnegative().nullable(),
  }),
  geocode: z.object({
    geocodedRows: z.number().int().nonnegative().nullable(),
    geocodeRate: z.number().nonnegative().nullable(),
  }),
  join: z.object({
    joinedRows: z.number().int().nonnegative().nullable(),
    joinRate: z.number().nonnegative().nullable(),
  }),
  readiness: z.object({
    status: z.enum(["ready", "needs_backfill", "needs_decision", "blocked", "sample_only"]),
    reasons: z.array(z.string()),
  }),
  evidence: z.object({
    allowedRoles: z.array(EvidenceRoleSchema),
    detectorEligibility: DetectorEligibilitySchema,
    primaryEvidenceAllowed: z.boolean(),
    automaticPromotionAllowed: z.boolean(),
    blockers: z.array(z.string()),
  }),
});

export const SourceCoverageLedgerSchema = z.object({
  generatedAt: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dbPath: z.string().nullable(),
  summary: z.object({
    sourceCount: z.number().int().nonnegative(),
    decisionCounts: z.record(SourceDecisionSchema, z.number().int().nonnegative()),
    detectorEligibilityCounts: z.record(DetectorEligibilitySchema, z.number().int().nonnegative()),
    sourcesNeedingAction: z.number().int().nonnegative(),
  }),
  sources: z.array(SourceCoverageLedgerEntrySchema),
});

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizeMonth(value: string | null): string | null {
  return value === null || value.length < 7 ? null : value.slice(0, 7);
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(tableName);
  return (row?.count ?? 0) > 0;
}

function columnExists(sqlite: Database, tableName: string, columnName: string): boolean {
  const rows = sqlite.query<{ name: string }, []>(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function countRows(sqlite: Database, tableName: string): number {
  return (
    sqlite.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
      ?.count ?? 0
  );
}

function countDistinctMonths(sqlite: Database, tableName: string, dateExpression: string): number {
  return (
    sqlite
      .query<{ count: number }, []>(
        `SELECT COUNT(DISTINCT SUBSTR(${dateExpression}, 1, 7)) AS count FROM ${tableName} WHERE ${dateExpression} IS NOT NULL AND TRIM(${dateExpression}) != ''`,
      )
      .get()?.count ?? 0
  );
}

function dateRange(
  sqlite: Database,
  tableName: string,
  dateExpression: string,
): { min: string | null; max: string | null; monthCount: number | null } {
  const row = sqlite
    .query<{ minValue: string | null; maxValue: string | null }, []>(
      `SELECT MIN(${dateExpression}) AS minValue, MAX(${dateExpression}) AS maxValue FROM ${tableName} WHERE ${dateExpression} IS NOT NULL AND TRIM(${dateExpression}) != ''`,
    )
    .get();

  return {
    min: normalizeMonth(row?.minValue ?? null),
    max: normalizeMonth(row?.maxValue ?? null),
    monthCount: countDistinctMonths(sqlite, tableName, dateExpression),
  };
}

function geocodeSummary(
  sqlite: Database,
  config: SourceConfig,
  rowCount: number,
): SourceCoverageLedgerEntry["geocode"] {
  if (
    config.geocodeColumn === undefined ||
    !columnExists(sqlite, config.tableName, config.geocodeColumn)
  ) {
    return { geocodedRows: null, geocodeRate: null };
  }

  const geocodedRows =
    sqlite
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM ${config.tableName} WHERE ${config.geocodeColumn} IS NOT NULL AND ${config.geocodeColumn} != ''`,
      )
      .get()?.count ?? 0;

  return {
    geocodedRows,
    geocodeRate: rowCount === 0 ? null : geocodedRows / rowCount,
  };
}

function joinSummary(
  sqlite: Database,
  config: SourceConfig,
  rowCount: number,
): SourceCoverageLedgerEntry["join"] {
  if (
    config.joinTable === undefined ||
    (config.joinSourceId === undefined && config.joinSourceIds === undefined) ||
    !tableExists(sqlite, config.joinTable)
  ) {
    return { joinedRows: null, joinRate: null };
  }

  const sourceIds = config.joinSourceIds ?? [config.joinSourceId as string];
  const sourceIdList = sourceIds.map(sqlString).join(", ");
  const joinedRows =
    sqlite
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM ${config.joinTable} WHERE source_id IN (${sourceIdList})`,
      )
      .get()?.count ?? 0;

  return {
    joinedRows,
    joinRate: rowCount === 0 ? null : Math.min(1, joinedRows / rowCount),
  };
}

function coverageReasons(sqlite: Database, config: SourceConfig, rowCount: number): string[] {
  if (config.requiredCoverageColumns === undefined || rowCount === 0) {
    return [];
  }

  return config.requiredCoverageColumns.flatMap((coverageColumn) => {
    if (!columnExists(sqlite, config.tableName, coverageColumn.columnName)) {
      return [`${coverageColumn.label} coverage column ${coverageColumn.columnName} is missing`];
    }

    const coveredRows =
      sqlite
        .query<{ count: number }, []>(
          `SELECT COUNT(*) AS count FROM ${config.tableName} WHERE ${coverageColumn.columnName} = 1`,
        )
        .get()?.count ?? 0;

    return coveredRows < rowCount
      ? [`${coverageColumn.label} coverage has ${coveredRows}/${rowCount} rows`]
      : [];
  });
}

function monthSpanInclusive(startMonth: string, endMonth: string): number {
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  if (
    startYear === undefined ||
    startMonthNumber === undefined ||
    endYear === undefined ||
    endMonthNumber === undefined
  ) {
    return 0;
  }
  return (endYear - startYear) * 12 + (endMonthNumber - startMonthNumber) + 1;
}

function hasFullRange(
  range: SourceCoverageLedgerEntry["range"],
  targetStartMonth: string | undefined,
  targetEndMonth: string | undefined,
): boolean {
  if (targetStartMonth === undefined || targetEndMonth === undefined) {
    return true;
  }
  const expectedMonths = monthSpanInclusive(targetStartMonth, targetEndMonth);
  return (
    range.min !== null &&
    range.max !== null &&
    range.min <= targetStartMonth &&
    range.max >= targetEndMonth &&
    range.monthCount !== null &&
    range.monthCount >= expectedMonths
  );
}

function classifySource(input: {
  config: SourceConfig;
  rowCount: number;
  range: SourceCoverageLedgerEntry["range"];
  geocode: SourceCoverageLedgerEntry["geocode"];
  coverageReasons: string[];
}): Pick<SourceCoverageLedgerEntry, "decision" | "readiness"> {
  const { config, rowCount, range, geocode } = input;
  const reasons: string[] = [];
  let hasLowGeocodeRate = false;

  if (config.forceReason !== undefined) {
    reasons.push(config.forceReason);
  }
  if ((config.requireRows ?? false) && rowCount === 0) {
    reasons.push("required source has no local rows");
  }
  if (!hasFullRange(range, config.targetStartMonth, config.targetEndMonth)) {
    reasons.push(
      `loaded range ${range.min ?? "none"}..${range.max ?? "none"} does not cover ${config.targetStartMonth}..${config.targetEndMonth}`,
    );
  }
  if (
    config.minGeocodeRate !== undefined &&
    geocode.geocodeRate !== null &&
    geocode.geocodeRate < config.minGeocodeRate
  ) {
    hasLowGeocodeRate = true;
    reasons.push(
      `geocode rate ${geocode.geocodeRate.toFixed(3)} is below ${config.minGeocodeRate.toFixed(3)}`,
    );
  }
  reasons.push(...input.coverageReasons);

  if (config.forceDecision !== undefined) {
    const status =
      config.forceDecision === "excluded_until_fixed"
        ? "blocked"
        : config.forceDecision === "release_context_only" ||
            config.forceDecision === "current_signal_only"
          ? "sample_only"
          : "ready";
    return {
      decision: config.forceDecision,
      readiness: { status, reasons },
    };
  }

  if (rowCount === 0) {
    return {
      decision: "backfill_required",
      readiness: { status: "blocked", reasons },
    };
  }

  if (
    !hasFullRange(range, config.targetStartMonth, config.targetEndMonth) ||
    input.coverageReasons.length > 0
  ) {
    return {
      decision: "backfill_required",
      readiness: { status: "needs_backfill", reasons },
    };
  }

  if (config.role === "release_context") {
    return {
      decision: "release_context_only",
      readiness: { status: "sample_only", reasons },
    };
  }

  if (config.role === "current_signal") {
    return {
      decision: "current_signal_only",
      readiness: { status: "sample_only", reasons },
    };
  }

  return {
    decision: "complete_for_history",
    readiness: { status: hasLowGeocodeRate ? "needs_decision" : "ready", reasons },
  };
}

function evidenceEligibility(input: {
  config: SourceConfig;
  decision: SourceDecision;
  readiness: SourceCoverageLedgerEntry["readiness"];
}): SourceCoverageLedgerEntry["evidence"] {
  const blockers = [...input.readiness.reasons];
  if (input.readiness.status === "blocked") {
    blockers.unshift("source is blocked for detector use");
  }
  if (input.readiness.status === "needs_backfill") {
    blockers.unshift("source range is incomplete for the target evidence window");
  }
  if (input.readiness.status === "needs_decision") {
    blockers.unshift("source quality needs a manual promotion decision");
  }

  const defaultEligibility: DetectorEligibility =
    input.decision === "complete_for_history"
      ? input.readiness.status === "ready"
        ? "automatic_primary"
        : "manual_review_primary"
      : input.decision === "release_context_only"
        ? "context_only"
        : input.decision === "current_signal_only"
          ? "current_signal_only"
          : input.decision === "excluded_until_fixed"
            ? "blocked"
            : "missing_data_only";
  const detectorEligibility = input.config.detectorEligibility ?? defaultEligibility;
  const defaultRoles: EvidenceRole[] =
    detectorEligibility === "automatic_primary" || detectorEligibility === "manual_review_primary"
      ? ["primary", "context", "caveat", "coverage_audit"]
      : detectorEligibility === "context_only" || detectorEligibility === "current_signal_only"
        ? ["context", "caveat", "coverage_audit"]
        : detectorEligibility === "missing_data_only"
          ? ["missing_data", "coverage_audit"]
          : ["coverage_audit"];
  const allowedRoles = [...(input.config.allowedEvidenceRoles ?? defaultRoles)];
  const primaryEvidenceAllowed = allowedRoles.includes("primary");
  const automaticPromotionAllowed =
    input.config.automaticPromotionAllowed ??
    (detectorEligibility === "automatic_primary" &&
      input.readiness.status === "ready" &&
      input.decision === "complete_for_history");

  return {
    allowedRoles,
    detectorEligibility,
    primaryEvidenceAllowed,
    automaticPromotionAllowed,
    blockers,
  };
}

function emptyDecisionCounts(): Record<SourceDecision, number> {
  return Object.fromEntries(DECISIONS.map((decision) => [decision, 0])) as Record<
    SourceDecision,
    number
  >;
}

function emptyDetectorEligibilityCounts(): Record<DetectorEligibility, number> {
  return Object.fromEntries(
    DetectorEligibilitySchema.options.map((eligibility) => [eligibility, 0]),
  ) as Record<DetectorEligibility, number>;
}

export function sourceCoverageLedgerPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "source-coverage", month, "ledger.json");
}

export function buildSourceCoverageLedger(input: {
  sqlite: Database;
  month: string;
  dbPath?: string | null;
  generatedAt?: string;
  sourceConfigs?: readonly SourceConfig[];
}): SourceCoverageLedger {
  const sources: SourceCoverageLedgerEntry[] = [];

  for (const config of input.sourceConfigs ?? SOURCE_CONFIGS) {
    if (!tableExists(input.sqlite, config.tableName)) {
      const entry: SourceCoverageLedgerEntry = {
        sourceId: config.sourceId,
        tableName: config.tableName,
        role: config.role,
        decision: config.forceDecision ?? "backfill_required",
        rowCount: 0,
        range: { min: null, max: null, monthCount: null },
        geocode: { geocodedRows: null, geocodeRate: null },
        join: { joinedRows: null, joinRate: null },
        readiness: {
          status: config.forceDecision === "excluded_until_fixed" ? "blocked" : "needs_backfill",
          reasons: [`table ${config.tableName} is missing`],
        },
        evidence: evidenceEligibility({
          config,
          decision: config.forceDecision ?? "backfill_required",
          readiness: {
            status: config.forceDecision === "excluded_until_fixed" ? "blocked" : "needs_backfill",
            reasons: [`table ${config.tableName} is missing`],
          },
        }),
      };
      sources.push(entry);
      continue;
    }

    const rowCount = countRows(input.sqlite, config.tableName);
    const range = dateRange(input.sqlite, config.tableName, config.dateExpression);
    const geocode = geocodeSummary(input.sqlite, config, rowCount);
    const join = joinSummary(input.sqlite, config, rowCount);
    const coverage = coverageReasons(input.sqlite, config, rowCount);
    const classification = classifySource({
      config,
      rowCount,
      range,
      geocode,
      coverageReasons: coverage,
    });

    sources.push({
      sourceId: config.sourceId,
      tableName: config.tableName,
      role: config.role,
      decision: classification.decision,
      rowCount,
      range,
      geocode,
      join,
      readiness: classification.readiness,
      evidence: evidenceEligibility({
        config,
        decision: classification.decision,
        readiness: classification.readiness,
      }),
    });
  }

  const decisionCounts = emptyDecisionCounts();
  const detectorEligibilityCounts = emptyDetectorEligibilityCounts();
  for (const source of sources) {
    decisionCounts[source.decision] += 1;
    detectorEligibilityCounts[source.evidence.detectorEligibility] += 1;
  }

  const artifact = {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    month: input.month,
    dbPath: input.dbPath ?? null,
    summary: {
      sourceCount: sources.length,
      decisionCounts,
      detectorEligibilityCounts,
      sourcesNeedingAction: sources.filter(
        (source) =>
          ["backfill_required", "excluded_until_fixed"].includes(source.decision) ||
          ["blocked", "needs_backfill", "needs_decision"].includes(source.readiness.status),
      ).length,
    },
    sources,
  } satisfies SourceCoverageLedger;

  return SourceCoverageLedgerSchema.parse(artifact);
}

export default defineCommand({
  path: ["audit", "source-coverage"],
  summary: "Build the source coverage ledger for a release month.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for ledger JSON"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    month: z.string(),
    outputPath: z.string(),
    sourceCount: z.number().int().nonnegative(),
    sourcesNeedingAction: z.number().int().nonnegative(),
  }),
  async run({ ctx, input }) {
    const month = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? sourceCoverageLedgerPath(artifactRoot, month)
        : fromCliPath(input.options.output);

    const local = localDbFromCtx(ctx);
    const ledger = buildSourceCoverageLedger({
      sqlite: local.sqlite,
      month,
      dbPath: local.path,
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, ledger);

    return {
      month,
      outputPath,
      sourceCount: ledger.summary.sourceCount,
      sourcesNeedingAction: ledger.summary.sourcesNeedingAction,
    };
  },
});
