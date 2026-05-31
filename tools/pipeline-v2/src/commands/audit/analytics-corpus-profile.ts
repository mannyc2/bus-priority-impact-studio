import type { Database } from "bun:sqlite";
import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import {
  summarizeCorpusProfile,
  type CorpusProfile,
  type CorpusProfileObservation,
} from "@bp/analytics/corpus";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export type AnalyticsCorpusProfileArtifact = CorpusProfile & {
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  doctrine: {
    releaseMonthUse: string;
    historicalCorpusUse: string;
  };
};

type QueryObservationConfig = {
  sourceId: string;
  family: string;
  sql: string;
};

type RawObservationRow = {
  month: unknown;
  route_id?: unknown;
  row_count: unknown;
  sample_count?: unknown;
};

const OBSERVATION_QUERIES: readonly QueryObservationConfig[] = [
  {
    sourceId: "route_month_trends_speed",
    family: "speed",
    sql: `
      SELECT month, route_id, 1 AS row_count, speed_observation_count AS sample_count
      FROM local_route_month_trend
      WHERE has_speed_trend = 1
    `,
  },
  {
    sourceId: "route_month_trends_ridership",
    family: "ridership",
    sql: `
      SELECT month, route_id, 1 AS row_count, NULL AS sample_count
      FROM local_route_month_trend
      WHERE has_ridership_trend = 1
    `,
  },
  {
    sourceId: "route_hourly_ridership",
    family: "ridership",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, NULL AS sample_count
      FROM local_route_hourly_ridership
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "route_segment_speed",
    family: "speed",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, SUM(bus_trip_count) AS sample_count
      FROM local_route_segment_speed
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "observed_reliability_summary",
    family: "reliability",
    sql: `
      SELECT month, route_id, 1 AS row_count, sample_count
      FROM local_route_observed_reliability_summary
    `,
  },
  {
    sourceId: "observed_headway_samples",
    family: "reliability",
    sql: `
      SELECT
        strftime('%Y-%m', observed_timestamp, 'unixepoch') AS month,
        route_id,
        COUNT(*) AS row_count,
        COUNT(*) AS sample_count
      FROM local_observed_headway_sample
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "bus_wait_assessment",
    family: "reliability",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, SUM(scheduled_trips) AS sample_count
      FROM local_bus_wait_assessment
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "intervention_comparisons",
    family: "intervention",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, NULL AS sample_count
      FROM local_route_intervention_comparison
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "context_events",
    family: "context",
    sql: `
      SELECT substr(occurred_at, 1, 7) AS month, route_id, COUNT(*) AS row_count, COUNT(*) AS sample_count
      FROM local_context_event
      WHERE route_id IS NOT NULL AND length(substr(occurred_at, 1, 7)) = 7
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "context_route_touches",
    family: "context",
    sql: `
      SELECT substr(occurred_at, 1, 7) AS month, route_id, COUNT(*) AS row_count, COUNT(*) AS sample_count
      FROM local_context_event_route_touch
      WHERE length(substr(occurred_at, 1, 7)) = 7
      GROUP BY month, route_id
    `,
  },
];

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function loadAnalyticsCorpusObservations(
  sqlite: Database,
): CorpusProfileObservation[] {
  const observations: CorpusProfileObservation[] = [];

  for (const config of OBSERVATION_QUERIES) {
    const rows = sqlite.query(config.sql).all() as RawObservationRow[];
    for (const row of rows) {
      const month = textValue(row.month);
      if (month === null) continue;
      observations.push({
        sourceId: config.sourceId,
        family: config.family,
        month,
        routeId: textValue(row.route_id ?? null),
        rowCount: numberValue(row.row_count),
        sampleCount: row.sample_count === undefined || row.sample_count === null
          ? null
          : numberValue(row.sample_count),
      });
    }
  }

  return observations;
}

export function analyticsCorpusProfilePath(artifactRoot: string, releaseMonth: string): string {
  return join(artifactRoot, "analytics-corpus-profile", releaseMonth, "profile.json");
}

export function buildAnalyticsCorpusProfile(input: {
  sqlite: Database;
  releaseMonth: string;
  historyStartMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  minHistoricalMonths?: number;
}): AnalyticsCorpusProfileArtifact {
  const profile = summarizeCorpusProfile({
    releaseMonth: input.releaseMonth,
    historyStartMonth: input.historyStartMonth,
    observations: loadAnalyticsCorpusObservations(input.sqlite),
    ...(input.minHistoricalMonths === undefined
      ? {}
      : { minHistoricalMonths: input.minHistoricalMonths }),
  });

  return {
    ...profile,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    doctrine: {
      releaseMonthUse:
        "Use the release month as the public serving snapshot and current evidence scope.",
      historicalCorpusUse:
        "Use the historical window for baselines, calibration, trend context, false-positive analysis, and detector idea generation.",
    },
  };
}

export default defineCommand({
  path: ["audit", "analytics-corpus-profile"],
  summary: "Profile historical analytics corpus coverage for detector design and calibration.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Release calendar year"),
      month: arg.positiveInt().default(3).describe("Release calendar month, 1-12"),
      historyStartMonth: z.string().default("2023-04").describe("Start month for historical detector-learning window"),
      minHistoricalMonths: arg.positiveInt().default(12).describe("Minimum prior months for historical-ready source status"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for profile JSON"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    historyStartMonth: z.string(),
    outputPath: z.string(),
    sourceCount: z.number().int().nonnegative(),
    historicalReadySourceCount: z.number().int().nonnegative(),
    releaseOnlySourceCount: z.number().int().nonnegative(),
    sparseSourceCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? analyticsCorpusProfilePath(artifactRoot, releaseMonth)
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let profile: AnalyticsCorpusProfileArtifact;
    try {
      profile = buildAnalyticsCorpusProfile({
        sqlite,
        releaseMonth,
        historyStartMonth: input.options.historyStartMonth,
        minHistoricalMonths: input.options.minHistoricalMonths,
        generatedAt: new Date().toISOString(),
        dbPath,
        artifactPath: outputPath,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, profile);

    return {
      releaseMonth,
      historyStartMonth: input.options.historyStartMonth,
      outputPath,
      sourceCount: profile.summary.sourceCount,
      historicalReadySourceCount: profile.summary.historicalReadySourceCount,
      releaseOnlySourceCount: profile.summary.releaseOnlySourceCount,
      sparseSourceCount: profile.summary.sparseSourceCount,
    };
  },
});
