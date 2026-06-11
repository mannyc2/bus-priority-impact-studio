import type { Database, SQLQueryBindings } from "bun:sqlite";
import { listFeatureContracts, type FeatureContract } from "@bp/analytics/features";
import type { FeatureGrainMaterializationRowInput } from "../evaluation";

export type FeatureGrainMaterializationCoverageLocalDbQuery = {
  readonly sqlite: Database;
  readonly releaseMonth: string;
  readonly runId: string;
};

type TableRequirement = {
  readonly tableName: string;
  readonly columns: readonly string[];
};

type FleetUniverseResult = {
  readonly count: number | null;
  readonly notes: readonly string[];
};

type CountSpec = {
  readonly required: readonly TableRequirement[];
  readonly sql: string | null;
  readonly params: readonly SQLQueryBindings[];
  readonly fleetUniverse?: (
    input: FeatureGrainMaterializationCoverageLocalDbQuery,
  ) => FleetUniverseResult;
  readonly note?: string;
};

type CountRow = {
  count?: unknown;
};

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

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function tableColumns(sqlite: Database, tableName: string): Set<string> {
  if (!tableExists(sqlite, tableName)) return new Set();
  const rows = sqlite
    .query(`PRAGMA table_info(${quotedIdentifier(tableName)})`)
    .all() as { name?: unknown }[];
  return new Set(
    rows
      .map((row) => textValue(row.name))
      .filter((column): column is string => column !== null),
  );
}

function missingRequirementNotes(
  sqlite: Database,
  required: readonly TableRequirement[],
): string[] {
  const notes: string[] = [];
  for (const requirement of required) {
    if (!tableExists(sqlite, requirement.tableName)) {
      notes.push(`Missing required table: ${requirement.tableName}.`);
      continue;
    }
    const columns = tableColumns(sqlite, requirement.tableName);
    const missingColumns = requirement.columns.filter((column) => !columns.has(column));
    if (missingColumns.length > 0) {
      notes.push(
        `Missing required columns on ${requirement.tableName}: ${missingColumns.join(", ")}.`,
      );
    }
  }
  return notes;
}

function countQuery(
  sqlite: Database,
  sql: string,
  params: readonly SQLQueryBindings[],
): number {
  const row = sqlite.query(sql).get(...params) as CountRow | null;
  return Math.max(0, Math.trunc(numberValue(row?.count)));
}

function routeCatalogUniverse(
  input: FeatureGrainMaterializationCoverageLocalDbQuery,
): FleetUniverseResult {
  const notes = missingRequirementNotes(input.sqlite, [
    { tableName: "local_route_catalog", columns: ["route_id"] },
  ]);
  if (notes.length > 0) return { count: null, notes };
  return {
    count: countQuery(
      input.sqlite,
      `
        SELECT COUNT(*) AS count
        FROM (
          SELECT DISTINCT route_id
          FROM local_route_catalog
          WHERE route_id IS NOT NULL
        )
      `,
      [],
    ),
    notes: [],
  };
}

function artifactSupportNote(contract: FeatureContract): string | undefined {
  if (contract.materializationKind !== "artifact") return undefined;
  return `Artifact-backed resolver ${contract.resolverId} is counted from current local DB support rows; artifact schema and field validity remain resolver-specific.`;
}

function withOptionalNote(spec: Omit<CountSpec, "note">, note: string | undefined): CountSpec {
  if (note === undefined) return spec;
  return { ...spec, note };
}

function unsupportedSpec(contract: FeatureContract): CountSpec {
  return {
    required: [],
    sql: null,
    params: [],
    note: `No DB count spec is registered for ${contract.featureGrain}; materialization coverage stays explicit missing until this resolver exposes an enumerable local or artifact manifest surface.`,
  };
}

function countSpecFor(
  contract: FeatureContract,
  input: FeatureGrainMaterializationCoverageLocalDbQuery,
): CountSpec {
  switch (contract.featureGrain) {
    case "customer_journey":
      return {
        required: [
          {
            tableName: "local_bus_customer_journey_metric",
            columns: ["month", "route_id", "trip_type", "period"],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT route_id, trip_type, period
            FROM local_bus_customer_journey_metric
            WHERE month = ?
              AND route_id IS NOT NULL
              AND trip_type IS NOT NULL
              AND period IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
      };
    case "segment_daypart":
      return {
        required: [
          {
            tableName: "local_route_segment_speed",
            columns: [
              "month",
              "route_id",
              "direction",
              "timepoint_stop_id",
              "next_timepoint_stop_id",
              "hour_of_day",
            ],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT
              route_id,
              direction,
              timepoint_stop_id,
              next_timepoint_stop_id,
              CASE
                WHEN CAST(hour_of_day AS INTEGER) BETWEEN 6 AND 9 THEN 'am_peak'
                WHEN CAST(hour_of_day AS INTEGER) BETWEEN 10 AND 15 THEN 'midday'
                WHEN CAST(hour_of_day AS INTEGER) BETWEEN 16 AND 19 THEN 'pm_peak'
                ELSE 'off_peak'
              END AS daypart
            FROM local_route_segment_speed
            WHERE month = ?
              AND route_id IS NOT NULL
              AND direction IS NOT NULL
              AND timepoint_stop_id IS NOT NULL
              AND next_timepoint_stop_id IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
      };
    case "feed_health":
      return {
        required: [
          {
            tableName: "local_finding_coverage_audit",
            columns: ["month", "detector_id", "scope_kind", "scope_id"],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT detector_id, scope_kind, scope_id
            FROM local_finding_coverage_audit
            WHERE month = ?
              AND detector_id IS NOT NULL
              AND scope_kind IS NOT NULL
              AND scope_id IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
      };
    case "route_segment_month":
      return {
        required: [
          {
            tableName: "local_route_segment_speed",
            columns: [
              "month",
              "route_id",
              "direction",
              "timepoint_stop_id",
              "next_timepoint_stop_id",
            ],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT route_id, direction, timepoint_stop_id, next_timepoint_stop_id
            FROM local_route_segment_speed
            WHERE month = ?
              AND route_id IS NOT NULL
              AND direction IS NOT NULL
              AND timepoint_stop_id IS NOT NULL
              AND next_timepoint_stop_id IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
      };
    case "route_month":
      return withOptionalNote(
        {
          required: [{ tableName: "local_route_month_coverage", columns: ["route_id", "month"] }],
          sql: `
            SELECT COUNT(*) AS count
            FROM (
              SELECT DISTINCT route_id
              FROM local_route_month_coverage
              WHERE month = ?
                AND route_id IS NOT NULL
            )
          `,
          params: [input.releaseMonth],
          fleetUniverse: routeCatalogUniverse,
        },
        artifactSupportNote(contract),
      );
    case "route_reliability_month":
      return {
        required: [
          {
            tableName: "local_route_observed_reliability_summary",
            columns: ["route_id", "month", "run_id"],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT route_id
            FROM local_route_observed_reliability_summary
            WHERE month = ?
              AND run_id = ?
              AND route_id IS NOT NULL
          )
        `,
        params: [input.releaseMonth, input.runId],
        fleetUniverse: routeCatalogUniverse,
      };
    case "stop_direction_hour":
      return withOptionalNote(
        {
          required: [
            {
              tableName: "local_observed_headway_sample",
              columns: ["run_id", "route_id", "direction_id", "stop_id", "observed_timestamp"],
            },
          ],
          sql: `
            SELECT COUNT(*) AS count
            FROM (
              SELECT DISTINCT
                route_id,
                direction_id,
                stop_id,
                CAST(observed_timestamp / 3600 AS INTEGER) AS observed_hour
              FROM local_observed_headway_sample
              WHERE run_id = ?
                AND route_id IS NOT NULL
                AND direction_id IS NOT NULL
                AND stop_id IS NOT NULL
                AND observed_timestamp IS NOT NULL
            )
          `,
          params: [input.runId],
        },
        artifactSupportNote(contract),
      );
    case "rider_weighted_excess_wait":
      return withOptionalNote(
        {
          required: [
            {
              tableName: "local_observed_headway_sample",
              columns: ["run_id", "route_id", "direction_id", "stop_id", "observed_timestamp"],
            },
            {
              tableName: "local_route_hourly_ridership",
              columns: ["route_id", "month"],
            },
          ],
          sql: `
            SELECT COUNT(*) AS count
            FROM (
              SELECT DISTINCT
                h.route_id,
                h.direction_id,
                h.stop_id,
                CAST(h.observed_timestamp / 3600 AS INTEGER) AS observed_hour
              FROM local_observed_headway_sample h
              WHERE h.run_id = ?
                AND h.route_id IS NOT NULL
                AND h.direction_id IS NOT NULL
                AND h.stop_id IS NOT NULL
                AND h.observed_timestamp IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM local_route_hourly_ridership r
                  WHERE r.route_id = h.route_id
                    AND r.month = ?
                )
            )
          `,
          params: [input.runId, input.releaseMonth],
        },
        artifactSupportNote(contract),
      );
    case "route_metric_history":
      return {
        required: [{ tableName: "local_route_month_trend", columns: ["route_id", "month"] }],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT route_id
            FROM local_route_month_trend
            WHERE month = ?
              AND route_id IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
        fleetUniverse: routeCatalogUniverse,
        note: "Coverage count is release-month row support only; history-depth sufficiency remains resolver-specific.",
      };
    case "intervention_window":
      return {
        required: [
          {
            tableName: "local_route_intervention_comparison",
            columns: ["route_id", "month", "event_id"],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT route_id, event_id
            FROM local_route_intervention_comparison
            WHERE month = ?
              AND route_id IS NOT NULL
              AND event_id IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
      };
    case "intervention_panel":
      return withOptionalNote(
        {
          required: [
            {
              tableName: "local_route_intervention_comparison",
              columns: ["month", "event_id"],
            },
          ],
          sql: `
            SELECT COUNT(*) AS count
            FROM (
              SELECT DISTINCT event_id
              FROM local_route_intervention_comparison
              WHERE month = ?
                AND event_id IS NOT NULL
            )
          `,
          params: [input.releaseMonth],
        },
        artifactSupportNote(contract),
      );
    case "context_source_month":
      return {
        required: [
          {
            tableName: "local_context_event_route_touch",
            columns: ["route_id", "source_id", "event_kind", "occurred_at"],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT route_id, source_id, event_kind
            FROM local_context_event_route_touch
            WHERE substr(occurred_at, 1, 7) = ?
              AND route_id IS NOT NULL
              AND source_id IS NOT NULL
              AND event_kind IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
      };
    case "source_coverage":
      return {
        required: [
          {
            tableName: "local_route_month_source_status",
            columns: ["route_id", "month", "source_scope", "source_id"],
          },
        ],
        sql: `
          SELECT COUNT(*) AS count
          FROM (
            SELECT DISTINCT source_scope, source_id, route_id
            FROM local_route_month_source_status
            WHERE month = ?
              AND source_scope IS NOT NULL
              AND source_id IS NOT NULL
              AND route_id IS NOT NULL
          )
        `,
        params: [input.releaseMonth],
      };
    case "positive_deviance":
      return withOptionalNote(
        {
          required: [{ tableName: "local_route_month_trend", columns: ["route_id", "month"] }],
          sql: `
            SELECT COUNT(*) AS count
            FROM (
              SELECT DISTINCT route_id
              FROM local_route_month_trend
              WHERE month = ?
                AND route_id IS NOT NULL
            )
          `,
          params: [input.releaseMonth],
          fleetUniverse: routeCatalogUniverse,
        },
        artifactSupportNote(contract),
      );
    default:
      return unsupportedSpec(contract);
  }
}

function materializationRow(
  input: FeatureGrainMaterializationCoverageLocalDbQuery,
  contract: FeatureContract,
): FeatureGrainMaterializationRowInput {
  const spec = countSpecFor(contract, input);
  const notes = [spec.note].filter((note): note is string => note !== undefined);
  const missingNotes = missingRequirementNotes(input.sqlite, spec.required);
  notes.push(...missingNotes);

  const scopesMaterialized =
    missingNotes.length > 0 || spec.sql === null
      ? 0
      : countQuery(input.sqlite, spec.sql, spec.params);

  let fleetUniverse: number | null = null;
  if (spec.fleetUniverse === undefined) {
    notes.push("Fleet universe is not yet enumerated for this grain.");
  } else {
    const universe = spec.fleetUniverse(input);
    fleetUniverse = universe.count;
    notes.push(...universe.notes);
  }

  const row = {
    featureGrain: contract.featureGrain,
    scopesMaterialized,
    fleetUniverse,
  };
  if (notes.length === 0) return row;
  return { ...row, note: notes.join(" ") };
}

export function loadFeatureGrainMaterializationCoverageRows(
  input: FeatureGrainMaterializationCoverageLocalDbQuery,
): FeatureGrainMaterializationRowInput[] {
  return listFeatureContracts().map((contract) => materializationRow(input, contract));
}
