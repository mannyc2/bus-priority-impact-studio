import { describe, expect, test } from "bun:test";
import * as d1Schema from "../src/d1/schema.js";
import * as localSchema from "../src/local/schema.js";

type ColumnLike = {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
  dataType: string;
  columnType: string;
  enumValues?: readonly string[];
};

type TableLike = Record<string, unknown>;

type MirroredTablePair = {
  label: string;
  local: TableLike;
  d1: TableLike;
  /**
   * D1 columns that are intentionally derived during seed generation rather
   * than mirrored 1:1 from the local table.
   */
  d1OnlyColumns?: readonly string[];
  /**
   * Local columns that intentionally do not cross into the compact D1 serving table.
   */
  localOnlyColumns?: readonly string[];
};

const mirroredTables: readonly MirroredTablePair[] = [
  {
    label: "route_catalog",
    local: localSchema.localRouteCatalog,
    d1: d1Schema.routeCatalog,
  },
  {
    label: "route_catalog_type",
    local: localSchema.localRouteCatalogType,
    d1: d1Schema.routeCatalogType,
  },
  {
    label: "route_month_coverage",
    local: localSchema.localRouteMonthCoverage,
    d1: d1Schema.routeMonthCoverage,
  },
  {
    label: "route_readiness",
    local: localSchema.localRouteReadiness,
    d1: d1Schema.routeReadiness,
  },
  {
    label: "route_readiness_missing_input",
    local: localSchema.localRouteReadinessMissingInput,
    d1: d1Schema.routeReadinessMissingInput,
    d1OnlyColumns: ["severity", "note"],
  },
  {
    label: "route_build_plan",
    local: localSchema.localRouteBuildPlan,
    d1: d1Schema.routeBuildPlan,
    localOnlyColumns: ["shapeCount", "stopCount", "timepointStopCount"],
  },
  {
    label: "route_reliability_baseline",
    local: localSchema.localRouteReliabilityBaseline,
    d1: d1Schema.routeReliabilityBaseline,
  },
  {
    label: "route_reliability_gap_window",
    local: localSchema.localRouteReliabilityGapWindow,
    d1: d1Schema.routeReliabilityGapWindow,
  },
  {
    label: "route_observed_reliability_summary",
    local: localSchema.localRouteObservedReliabilitySummary,
    d1: d1Schema.routeObservedReliabilitySummary,
  },
  {
    label: "intervention_event",
    local: localSchema.localInterventionEvent,
    d1: d1Schema.interventionEvent,
  },
  {
    label: "route_intervention_comparison",
    local: localSchema.localRouteInterventionComparison,
    d1: d1Schema.routeInterventionComparison,
  },
  {
    label: "route_artifact",
    local: localSchema.localRouteArtifact,
    d1: d1Schema.routeArtifact,
  },
  {
    label: "corridor",
    local: localSchema.localCorridor,
    d1: d1Schema.corridor,
  },
  {
    label: "corridor_artifact",
    local: localSchema.localCorridorArtifact,
    d1: d1Schema.corridorArtifact,
  },
  {
    label: "corridor_route_member",
    local: localSchema.localCorridorRouteMember,
    d1: d1Schema.corridorRouteMember,
  },
  {
    label: "corridor_month_summary",
    local: localSchema.localCorridorMonthSummary,
    d1: d1Schema.corridorMonthSummary,
  },
  {
    label: "corridor_intervention_context",
    local: localSchema.localCorridorInterventionContext,
    d1: d1Schema.corridorInterventionContext,
  },
  {
    label: "corridor_hotspot",
    local: localSchema.localCorridorHotspot,
    d1: d1Schema.corridorHotspot,
  },
  {
    label: "route_month_source_status",
    local: localSchema.localRouteMonthSourceStatus,
    d1: d1Schema.routeMonthSourceStatus,
  },
  {
    label: "route_month_trend",
    local: localSchema.localRouteMonthTrend,
    d1: d1Schema.routeMonthTrend,
  },
  {
    label: "route_equity_context",
    local: localSchema.localRouteEquityContext,
    d1: d1Schema.routeEquityContext,
  },
  {
    label: "route_scorecard",
    local: localSchema.localRouteScorecard,
    d1: d1Schema.routeScorecard,
  },
  {
    label: "route_brief_summary",
    local: localSchema.localRouteBriefSummary,
    d1: d1Schema.routeBriefSummary,
  },
  {
    label: "route_brief_peak_window",
    local: localSchema.localRouteBriefPeakWindow,
    d1: d1Schema.routeBriefPeakWindow,
  },
  {
    label: "route_brief_slowest_window",
    local: localSchema.localRouteBriefSlowestWindow,
    d1: d1Schema.routeBriefSlowestWindow,
  },
  {
    label: "route_comparison_rank",
    local: localSchema.localRouteComparisonRank,
    d1: d1Schema.routeComparisonRank,
  },
  {
    label: "route_batch_status",
    local: localSchema.localRouteBatchStatus,
    d1: d1Schema.routeBatchStatus,
  },
  {
    label: "route_batch_built_route",
    local: localSchema.localRouteBatchBuiltRoute,
    d1: d1Schema.routeBatchBuiltRoute,
  },
  {
    label: "route_batch_issue",
    local: localSchema.localRouteBatchIssue,
    d1: d1Schema.routeBatchIssue,
  },
];

function isColumn(value: unknown): value is ColumnLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { notNull?: unknown }).notNull === "boolean" &&
    typeof (value as { hasDefault?: unknown }).hasDefault === "boolean" &&
    typeof (value as { dataType?: unknown }).dataType === "string" &&
    typeof (value as { columnType?: unknown }).columnType === "string"
  );
}

function columns(table: TableLike): Map<string, ColumnLike> {
  const result = new Map<string, ColumnLike>();
  for (const [propertyName, value] of Object.entries(table)) {
    if (isColumn(value)) result.set(propertyName, value);
  }
  return result;
}

function columnSignature(column: ColumnLike) {
  return {
    name: column.name,
    notNull: column.notNull,
    hasDefault: column.hasDefault,
    dataType: column.dataType,
    columnType: column.columnType,
    enumValues: column.enumValues ?? [],
  };
}

describe("local to D1 mirrored table schema drift", () => {
  test("shared serving columns keep type, nullability, default, and enum parity", () => {
    const failures: string[] = [];

    for (const pair of mirroredTables) {
      const localColumns = columns(pair.local);
      const d1Columns = columns(pair.d1);
      const expectedLocalOnly = new Set(pair.localOnlyColumns ?? []);
      const expectedD1Only = new Set(pair.d1OnlyColumns ?? []);

      for (const [propertyName, localColumn] of localColumns) {
        if (expectedLocalOnly.has(propertyName)) continue;

        const d1Column = d1Columns.get(propertyName);
        if (!d1Column) {
          failures.push(`${pair.label}.${propertyName} exists locally but not in D1`);
          continue;
        }

        expect(columnSignature(d1Column), `${pair.label}.${propertyName}`).toEqual(
          columnSignature(localColumn),
        );
      }

      for (const propertyName of d1Columns.keys()) {
        if (localColumns.has(propertyName) || expectedD1Only.has(propertyName)) continue;
        failures.push(`${pair.label}.${propertyName} exists in D1 but not locally`);
      }
    }

    expect(failures).toEqual([]);
  });
});
