import { canonicalServingJson } from "@bp/domain/studio/serving-release";
import { Schema } from "effect";
import {
  type FreshnessSourceDescriptor,
  freshnessLagMonths,
  normalizeFreshnessValue,
} from "./freshness-ledger.ts";

export const FRESHNESS_ALARM_MARKER = "<!-- bp-data-freshness-alarm:v1 -->";
export const FRESHNESS_ALARM_CATCH_UP_COMMAND =
  "bun --filter @bp/pipeline-v2 cli -- audit freshness --db data/local/pipeline.sqlite";

const FreshnessValueSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}(?:-\d{2})?$/u));
const NullableFreshnessValueSchema = Schema.NullOr(FreshnessValueSchema);
const NonNegativeIntSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const FreshnessAlarmRowSchema = Schema.Struct({
  datasetId: Schema.NonEmptyString,
  grain: Schema.Literals(["month", "snapshot", "realtime"]),
  servingCritical: Schema.Boolean,
  assessment: Schema.Literals(["assessed", "not_assessed"]),
  upstreamLatest: NullableFreshnessValueSchema,
  publishedCoverageEnd: NullableFreshnessValueSchema,
  publishLagPeriods: Schema.NullOr(NonNegativeIntSchema),
  coverageEvidence: Schema.Literals(["release_compatibility_fallback", "not_assessed"]),
  attentionReasons: Schema.Array(
    Schema.Literals(["published_behind_upstream", "upstream_probe_unavailable"]),
  ),
});

export const FreshnessAlarmReportSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.freshness-alarm.v1"),
  schemaVersion: Schema.Literal(1),
  checkedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u),
  ),
  status: Schema.Literals(["healthy", "attention"]),
  advisory: Schema.Literal(true),
  release: Schema.Struct({
    releaseId: Schema.NonEmptyString,
    publishedAt: Schema.NonEmptyString,
    coverage: Schema.Struct({
      start: Schema.NullOr(FreshnessValueSchema),
      end: FreshnessValueSchema,
    }),
  }),
  rows: Schema.Array(FreshnessAlarmRowSchema),
  issueMarker: Schema.Literal(FRESHNESS_ALARM_MARKER),
  catchUpCommand: Schema.Literal(FRESHNESS_ALARM_CATCH_UP_COMMAND),
});

export type FreshnessAlarmRow = typeof FreshnessAlarmRowSchema.Type;
export type FreshnessAlarmReport = typeof FreshnessAlarmReportSchema.Type;

export type FreshnessAlarmRelease = FreshnessAlarmReport["release"];

function buildRow(input: {
  descriptor: FreshnessSourceDescriptor;
  upstreamLatest: string | null;
  publishedCoverageEnd: string;
}): FreshnessAlarmRow {
  const { descriptor } = input;
  if (descriptor.upstreamProbe.kind === "none") {
    return {
      datasetId: descriptor.sourceId,
      grain: descriptor.grain,
      servingCritical: descriptor.servingCritical,
      assessment: "not_assessed",
      upstreamLatest: null,
      publishedCoverageEnd: null,
      publishLagPeriods: null,
      coverageEvidence: "not_assessed",
      attentionReasons: [],
    };
  }

  const upstreamLatest = normalizeFreshnessValue(input.upstreamLatest, descriptor.grain);
  const publishedCoverageEnd = normalizeFreshnessValue(
    input.publishedCoverageEnd,
    descriptor.grain,
  );
  const publishLagPeriods = freshnessLagMonths(upstreamLatest, publishedCoverageEnd);
  const attentionReasons: FreshnessAlarmRow["attentionReasons"][number][] = [];
  if (upstreamLatest === null) attentionReasons.push("upstream_probe_unavailable");
  if (publishLagPeriods !== null && publishLagPeriods > 0) {
    attentionReasons.push("published_behind_upstream");
  }
  return {
    datasetId: descriptor.sourceId,
    grain: descriptor.grain,
    servingCritical: descriptor.servingCritical,
    assessment: "assessed",
    upstreamLatest,
    publishedCoverageEnd,
    publishLagPeriods,
    coverageEvidence: "release_compatibility_fallback",
    attentionReasons,
  };
}

export function buildFreshnessAlarmReport(input: {
  checkedAt: string;
  release: FreshnessAlarmRelease;
  descriptors: readonly FreshnessSourceDescriptor[];
  upstreamLatest: ReadonlyMap<string, string | null>;
}): FreshnessAlarmReport {
  const rows = input.descriptors
    .map((descriptor) =>
      buildRow({
        descriptor,
        upstreamLatest: input.upstreamLatest.get(descriptor.sourceId) ?? null,
        publishedCoverageEnd: input.release.coverage.end,
      }),
    )
    .toSorted(
      (left, right) =>
        Number(right.attentionReasons.length > 0) - Number(left.attentionReasons.length > 0) ||
        (right.publishLagPeriods ?? -1) - (left.publishLagPeriods ?? -1) ||
        left.datasetId.localeCompare(right.datasetId),
    );
  const status = rows.some((row) => row.servingCritical && row.attentionReasons.length > 0)
    ? "attention"
    : "healthy";
  return {
    artifactKind: "bp.ops.freshness-alarm.v1",
    schemaVersion: 1,
    checkedAt: input.checkedAt,
    status,
    advisory: true,
    release: input.release,
    rows,
    issueMarker: FRESHNESS_ALARM_MARKER,
    catchUpCommand: FRESHNESS_ALARM_CATCH_UP_COMMAND,
  };
}

function printable(value: string | number | null): string {
  return value === null ? "Not assessed" : String(value);
}

export function renderFreshnessAlarmIssue(report: FreshnessAlarmReport): string {
  const rows = report.rows.map((row) => {
    const notes =
      row.attentionReasons.length === 0
        ? row.assessment === "not_assessed"
          ? "No cheap authoritative upstream probe"
          : "No lag detected"
        : row.attentionReasons.join(", ").replaceAll("_", " ");
    return `| ${row.datasetId} | ${printable(row.upstreamLatest)} | ${printable(row.publishedCoverageEnd)} | ${printable(row.publishLagPeriods)} | ${notes} |`;
  });
  return `${report.issueMarker}
# Data freshness needs attention

This is an advisory scheduled report. It never publishes data or changes the serving pointer.

- Checked: ${report.checkedAt}
- Active release: \`${report.release.releaseId}\`
- Published: ${report.release.publishedAt}
- Decision: **${report.status}**

The current API exposes the reviewed-serving compatibility window, so assessed rows explicitly
label that window as a fallback until Plan 099 publishes dataset-specific coverage.

| Dataset | Upstream latest | Published coverage | Lag periods | Notes |
|---|---:|---:|---:|---|
${rows.join("\n")}

Local investigation command:

\`\`\`sh
${report.catchUpCommand}
\`\`\`
`;
}

export function canonicalFreshnessAlarmJson(report: FreshnessAlarmReport): string {
  return `${canonicalServingJson(report)}\n`;
}
