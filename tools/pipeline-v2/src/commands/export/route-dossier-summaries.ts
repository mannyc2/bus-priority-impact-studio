import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { routeSpeedHistoryArtifactPath } from "@bp/analytics/artifacts";
import {
  buildRouteDossierSummaries,
  type RouteDossierInputRow,
  type RouteDossierWorstSegmentMonth,
} from "@bp/analytics/evaluation";
import { decodePreserve } from "@bp/domain/decode";
import { type RouteDossierEvent, routeDossierSummaryKey } from "@bp/domain/studio";
import type { CoverageWindow } from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { routeIdToSlug } from "../studio/_release-routes.ts";
import type { D1CanonicalInputs } from "./d1-inputs.ts";

/**
 * Builds the per-route dossier summaries (frontend §7.2 / hard-cutover C2) from the
 * rows the `export d1` flow already assembled in `readLocalD1Inputs`, plus the
 * per-route speed-history artifacts on disk (for the worst-segment persistence
 * series). The pure projection lives in `@bp/analytics/evaluation`; this module is the
 * join — same split as ./route-capability-manifest.ts.
 */

// Minimal read-schema for the per-route speed-history artifact: only the fields the
// worst-segment derivation needs.
const SpeedHistoryForWorstSegmentSchema = Schema.Struct({
  dimensions: Schema.Struct({
    segments: Schema.Array(
      Schema.Struct({
        segmentId: Schema.String,
        direction: Schema.String,
        label: Schema.String,
      }),
    ),
  }),
  cells: Schema.Array(
    Schema.Struct({
      segmentId: Schema.String,
      month: Schema.String,
      averageSpeedMph: Schema.NullOr(Schema.Number),
    }),
  ),
});

/**
 * Per month, the route's slowest segment by mean observed speed across dayparts.
 * Months where no segment has an observed speed are skipped.
 */
export function worstSegmentMonthsFromSpeedHistory(
  artifact: typeof SpeedHistoryForWorstSegmentSchema.Type,
): RouteDossierWorstSegmentMonth[] {
  const segmentMeta = new Map(
    artifact.dimensions.segments.map((segment) => [segment.segmentId, segment]),
  );
  const byMonth = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const cell of artifact.cells) {
    if (cell.averageSpeedMph === null) continue;
    const segments = byMonth.get(cell.month) ?? new Map();
    const aggregate = segments.get(cell.segmentId) ?? { sum: 0, count: 0 };
    aggregate.sum += cell.averageSpeedMph;
    aggregate.count += 1;
    segments.set(cell.segmentId, aggregate);
    byMonth.set(cell.month, segments);
  }

  const months: RouteDossierWorstSegmentMonth[] = [];
  for (const [month, segments] of byMonth) {
    let worst: { segmentId: string; mean: number } | null = null;
    for (const [segmentId, { sum, count }] of segments) {
      const mean = sum / count;
      if (
        worst === null ||
        mean < worst.mean ||
        (mean === worst.mean && segmentId < worst.segmentId)
      ) {
        worst = { segmentId, mean };
      }
    }
    if (worst === null) continue;
    const meta = segmentMeta.get(worst.segmentId);
    months.push({
      month,
      segmentId: worst.segmentId,
      direction: meta?.direction ?? "",
      label: meta?.label ?? worst.segmentId,
      averageSpeedMph: Number(worst.mean.toFixed(2)),
    });
  }
  return months.sort((left, right) => left.month.localeCompare(right.month));
}

function isAceEvent(interventionType: string): boolean {
  return interventionType.toLowerCase().includes("ace");
}

export async function toRouteDossierInputRows(
  d1Inputs: Pick<
    D1CanonicalInputs,
    | "routeCatalog"
    | "routeMonthTrends"
    | "routeBriefSummaries"
    | "interventionEvents"
    | "routeSpeedHistoryCoverage"
  >,
  options: { artifactRoot: string },
): Promise<RouteDossierInputRow[]> {
  const slugByRouteId = new Map(
    d1Inputs.routeSpeedHistoryCoverage.map((row) => [row.routeId, row.routeSlug]),
  );

  const trendsByRoute = new Map<string, RouteDossierInputRow["trend"][number][]>();
  for (const trend of d1Inputs.routeMonthTrends) {
    const rows = trendsByRoute.get(trend.routeId) ?? [];
    rows.push({
      month: trend.month,
      averageSpeedMph: trend.averageSpeedMph,
      ridership: trend.ridership,
    });
    trendsByRoute.set(trend.routeId, rows);
  }

  const summaryByRoute = new Map(d1Inputs.routeBriefSummaries.map((row) => [row.routeId, row]));

  const eventsByRoute = new Map<string, RouteDossierEvent[]>();
  const aceSinceByRoute = new Map<string, string>();
  for (const event of d1Inputs.interventionEvents) {
    const events = eventsByRoute.get(event.routeId) ?? [];
    events.push({
      date: event.implementationDate,
      kind: event.interventionType,
      label: event.description,
    });
    eventsByRoute.set(event.routeId, events);
    if (isAceEvent(event.interventionType)) {
      const existing = aceSinceByRoute.get(event.routeId);
      if (existing === undefined || event.implementationDate < existing) {
        aceSinceByRoute.set(event.routeId, event.implementationDate);
      }
    }
  }

  const rows: RouteDossierInputRow[] = [];
  for (const catalogRow of d1Inputs.routeCatalog) {
    const routeId = catalogRow.routeId;
    const routeSlug = slugByRouteId.get(routeId) ?? routeIdToSlug(routeId);
    const summary = summaryByRoute.get(routeId);

    let worstSegmentByMonth: RouteDossierWorstSegmentMonth[] = [];
    const historyPath = routeSpeedHistoryArtifactPath({
      artifactRoot: options.artifactRoot,
      routeSlug,
    });
    const historyFile = Bun.file(historyPath);
    if (await historyFile.exists()) {
      const artifact = decodePreserve(SpeedHistoryForWorstSegmentSchema)(
        JSON.parse(await historyFile.text()),
      );
      worstSegmentByMonth = worstSegmentMonthsFromSpeedHistory(artifact);
    }

    rows.push({
      routeId,
      routeSlug,
      trend: trendsByRoute.get(routeId) ?? [],
      worstSegmentByMonth,
      treatment: {
        aceActive: summary?.aceActive ?? false,
        aceSince: (summary?.aceActive ?? false) ? (aceSinceByRoute.get(routeId) ?? null) : null,
        busLaneMatchedLaneCount: summary?.busLaneMatchedLaneCount ?? 0,
        events: eventsByRoute.get(routeId) ?? [],
        dataAsOf: summary?.month ?? null,
      },
    });
  }
  return rows;
}

export async function buildAndWriteRouteDossierSummaries(input: {
  d1Inputs: Parameters<typeof toRouteDossierInputRows>[0];
  artifactRoot: string;
  releaseId: string;
  publishedAt: string;
  coverage: CoverageWindow;
  generatedAt: string;
}): Promise<{ routeCount: number }> {
  const rows = await toRouteDossierInputRows(input.d1Inputs, {
    artifactRoot: input.artifactRoot,
  });
  const summaries = buildRouteDossierSummaries({
    generatedAt: input.generatedAt,
    releaseId: input.releaseId,
    publishedAt: input.publishedAt,
    coverage: input.coverage,
    rows,
  });
  for (const summary of summaries) {
    const outputPath = join(input.artifactRoot, routeDossierSummaryKey(summary.routeSlug));
    await mkdir(dirname(outputPath), { recursive: true });
    await Bun.write(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  }
  return { routeCount: summaries.length };
}
