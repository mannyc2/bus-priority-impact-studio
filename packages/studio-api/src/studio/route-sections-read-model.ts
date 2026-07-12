import type { StudioRouteEvidenceIndexRoute } from "@bp/domain/studio";
import type {
  StudioRouteSection,
  StudioRouteSectionId,
  StudioRouteSectionMetric,
  StudioRouteSectionRow,
} from "@bp/domain/studio/routes";
import type { StudioRouteIndex2Row } from "@bp/domain/studio/snapshots";
import {
  coverageGaps,
  type NormalizedStudioRouteIndexSourceRow,
  supportLevelLabel,
} from "./route-index-read-model.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function metric(input: {
  id: string;
  label: string;
  value: number | null;
  unit?: string | null;
  displayValue?: string;
}): StudioRouteSectionMetric {
  const { value } = input;
  return {
    id: input.id,
    label: input.label,
    value,
    unit: input.unit ?? null,
    displayValue:
      input.displayValue ??
      (value === null
        ? "n/a"
        : Number.isInteger(value)
          ? value.toLocaleString("en-US")
          : value.toFixed(1)),
  };
}

function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

export function metricRows(input: {
  rows: readonly NormalizedStudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
  score: (row: NormalizedStudioRouteIndexSourceRow) => number | null;
  reasons: (row: NormalizedStudioRouteIndexSourceRow) => string[];
  metrics: (row: NormalizedStudioRouteIndexSourceRow) => StudioRouteSectionMetric[];
  scoreLabel: (score: number) => string;
  limit?: number;
}): StudioRouteSectionRow[] {
  return input.rows
    .flatMap((row) => {
      const route = input.routeById.get(row.routeId);
      if (route === undefined) return [];
      const score = input.score(row);
      if (score === null || !Number.isFinite(score) || score <= 0) return [];
      return [
        {
          row,
          route,
          score: Number(score.toFixed(3)),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.row.summary?.routeScore ?? 101) - (right.row.summary?.routeScore ?? 101) ||
        left.route.routeId.localeCompare(right.route.routeId),
    )
    .slice(0, input.limit ?? 12)
    .map((candidate, index) => ({
      rank: index + 1,
      routeId: candidate.route.routeId,
      slug: candidate.route.slug,
      label: candidate.route.label,
      borough: candidate.route.borough,
      supportLevel: supportLevelLabel(candidate.route.capability),
      score: candidate.score,
      scoreLabel: input.scoreLabel(candidate.score),
      reasons: input.reasons(candidate.row),
      metrics: input.metrics(candidate.row),
      movement6mPct: roundPct(candidate.row.historyStats.speedMovement6mPct),
      context12mPct: roundPct(candidate.row.historyStats.speedMovement12mPct),
    }));
}

export function roundPct(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(1));
}

export function section(input: {
  sectionId: StudioRouteSectionId;
  title: string;
  productQuestion: string;
  status: StudioRouteSection["status"];
  rankMeaning: string;
  minCoverageRule: string;
  rows?: StudioRouteSectionRow[];
  caveats?: string[];
  notBuiltReason?: string | null;
}): StudioRouteSection {
  return {
    sectionId: input.sectionId,
    title: input.title,
    productQuestion: input.productQuestion,
    status: input.status,
    rankMeaning: input.rankMeaning,
    minCoverageRule: input.minCoverageRule,
    rows: input.rows ?? [],
    caveats: input.caveats ?? [],
    notBuiltReason: input.notBuiltReason ?? null,
  };
}

export function buildNeedsAttentionRows(input: {
  rows: readonly NormalizedStudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      if (row.summary === null) return null;
      const speedPain = clamp((9 - row.summary.averageSpeedMph) * 8, 0, 40);
      const riderScale = clamp(row.summary.totalRidership / 30_000, 0, 35);
      const hotspotPain = clamp(row.summary.hotspotCount * 4, 0, 25);
      return 100 - row.summary.routeScore + speedPain + riderScale + hotspotPain;
    },
    reasons(row) {
      if (row.summary === null) return [];
      return [
        `Route score ${row.summary.routeScore}`,
        `${row.summary.averageSpeedMph.toFixed(1)} mph observed speed`,
        `${row.summary.hotspotCount} hotspot${row.summary.hotspotCount === 1 ? "" : "s"}`,
        `${compactNumber(row.summary.totalRidership)} monthly riders`,
      ];
    },
    metrics(row) {
      const summary = row.summary;
      return [
        metric({
          id: "route_score",
          label: "Route score",
          value: summary?.routeScore ?? null,
          displayValue: summary === null ? "n/a" : String(summary.routeScore),
        }),
        metric({
          id: "average_speed_mph",
          label: "Observed speed",
          value: summary?.averageSpeedMph ?? null,
          unit: "mph",
        }),
        metric({
          id: "monthly_riders",
          label: "Monthly riders",
          value: summary?.totalRidership ?? null,
          displayValue: summary === null ? "n/a" : compactNumber(summary.totalRidership),
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} attention score`,
  });
}

export function buildWorseningFastRows(input: {
  currentSpeedMonth: string;
  rows: readonly NormalizedStudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      const change = row.historyStats.speedChangeMph;
      if (
        change === null ||
        row.historyCoverage.speedMonthCount < 6 ||
        row.historyStats.latestSpeedMonth !== input.currentSpeedMonth ||
        change >= 0
      ) {
        return null;
      }
      return Math.abs(change) * 25 + clamp(row.historyCoverage.speedMonthCount, 0, 36);
    },
    reasons(row) {
      const { historyStats } = row;
      const change = historyStats.speedChangeMph ?? 0;
      return [
        `${change.toFixed(1)} mph from ${historyStats.firstSpeedMonth} to ${historyStats.latestSpeedMonth}`,
        `${row.historyCoverage.speedMonthCount} speed months`,
      ];
    },
    metrics(row) {
      return [
        metric({
          id: "speed_change_mph",
          label: "Speed change",
          value: row.historyStats.speedChangeMph,
          unit: "mph",
          displayValue:
            row.historyStats.speedChangeMph === null
              ? "n/a"
              : `${row.historyStats.speedChangeMph.toFixed(1)} mph`,
        }),
        metric({
          id: "latest_speed_mph",
          label: "Latest speed",
          value: row.historyStats.latestAverageSpeedMph,
          unit: "mph",
        }),
        metric({
          id: "speed_months",
          label: "Speed months",
          value: row.historyCoverage.speedMonthCount,
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} worsening score`,
  });
}

export function buildTreatmentGapRows(input: {
  rows: readonly NormalizedStudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      if (row.summary === null) return null;
      if (row.summary.totalRidership <= 0 || row.summary.averageSpeedMph <= 0) return null;
      const riderScale = clamp(row.summary.totalRidership / 45_000, 0, 40);
      const speedPain = clamp((8.5 - row.summary.averageSpeedMph) * 9, 0, 35);
      const hotspotPain = clamp(row.summary.hotspotCount * 4, 0, 25);
      const treatmentCredit =
        (row.summary.aceActive ? 20 : 0) + clamp(row.summary.busLaneMatchedLaneCount * 4, 0, 30);
      const score = riderScale + speedPain + hotspotPain - treatmentCredit;
      return score > 5 ? score : null;
    },
    reasons(row) {
      if (row.summary === null) return [];
      const treatment =
        row.summary.aceActive || row.summary.busLaneMatchedLaneCount > 0
          ? `${row.summary.busLaneMatchedLaneCount} lane matches; ACE ${row.summary.aceActive ? "active" : "inactive"}`
          : "No ACE or bus-lane match in summary";
      return [
        `${row.summary.averageSpeedMph.toFixed(1)} mph observed speed`,
        `${compactNumber(row.summary.totalRidership)} monthly riders`,
        treatment,
      ];
    },
    metrics(row) {
      const summary = row.summary;
      return [
        metric({
          id: "average_speed_mph",
          label: "Observed speed",
          value: summary?.averageSpeedMph ?? null,
          unit: "mph",
        }),
        metric({
          id: "bus_lane_matches",
          label: "Lane matches",
          value: summary?.busLaneMatchedLaneCount ?? null,
        }),
        metric({
          id: "ace_active",
          label: "ACE active",
          value: summary?.aceActive === true ? 1 : 0,
          displayValue: summary?.aceActive === true ? "yes" : "no",
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} gap score`,
  });
}

export function buildDataCoverageRows(input: {
  rows: readonly NormalizedStudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      const route = input.routeById.get(row.routeId);
      if (route === undefined) return null;
      const gaps = coverageGaps(route.capability);
      // biome-ignore lint/complexity/useLiteralKeys: capability surfaces are typed as an index signature.
      const noSummary = route.capability.surfaces["condition"]?.state === "insufficient_data";
      return gaps.length === 0 ? null : gaps.length * 10 + (noSummary ? 15 : 0);
    },
    reasons(row) {
      const route = input.routeById.get(row.routeId);
      if (route === undefined) return [];
      return coverageGaps(route.capability).map((gap) => `${gap.label} ${gap.state}`);
    },
    metrics(row) {
      const route = input.routeById.get(row.routeId);
      const missingCoreCount = route === undefined ? 0 : coverageGaps(route.capability).length;
      return [
        metric({
          id: "core_surface_issues",
          label: "Core surface issues",
          value: missingCoreCount,
        }),
        metric({
          id: "history_months",
          label: "History months",
          value: row.historyCoverage.pointCount,
        }),
        metric({
          id: "readiness_score",
          label: "Readiness",
          value: row.readinessScore,
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} coverage issue score`,
  });
}

export function routeEvidenceFactCount(
  route: Pick<StudioRouteEvidenceIndexRoute, "coverage">,
): number {
  return (
    route.coverage.timelineCount +
    route.coverage.interventionCount +
    route.coverage.metricClaimCount +
    route.coverage.projectCount +
    route.coverage.sourceGapCount
  );
}

export function buildEvidenceReadyRows(input: {
  routes: readonly StudioRouteEvidenceIndexRoute[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return input.routes
    .flatMap((evidenceRoute) => {
      const route = input.routeById.get(evidenceRoute.routeId);
      if (route === undefined) return [];
      const factCount = routeEvidenceFactCount(evidenceRoute);
      const score =
        evidenceRoute.coverage.citationCount * 3 +
        evidenceRoute.coverage.timelineCount * 2 +
        evidenceRoute.coverage.interventionCount * 2 +
        evidenceRoute.coverage.metricClaimCount +
        evidenceRoute.coverage.projectCount +
        evidenceRoute.coverage.sourceGapCount +
        (evidenceRoute.wikiRouteRecordId === null ? 0 : 5);
      if (!Number.isFinite(score) || score <= 0) return [];
      return [{ evidenceRoute, factCount, route, score: Number(score.toFixed(3)) }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.evidenceRoute.coverage.citationCount - left.evidenceRoute.coverage.citationCount ||
        left.route.routeId.localeCompare(right.route.routeId),
    )
    .slice(0, 12)
    .map(({ evidenceRoute, factCount, route, score }, index) => ({
      rank: index + 1,
      routeId: route.routeId,
      slug: route.slug,
      label: route.label,
      borough: route.borough,
      supportLevel: "evidence_ready",
      score,
      scoreLabel: `${score.toFixed(0)} evidence score`,
      reasons: [
        `${evidenceRoute.coverage.citationCount.toLocaleString("en-US")} cited evidence reference${evidenceRoute.coverage.citationCount === 1 ? "" : "s"}`,
        `${factCount.toLocaleString("en-US")} wiki evidence row${factCount === 1 ? "" : "s"}`,
        evidenceRoute.wikiRouteRecordId === null
          ? "No canonical wiki route anchor"
          : "Canonical wiki route anchor published",
      ],
      metrics: [
        metric({
          id: "wiki_citations",
          label: "Citations",
          value: evidenceRoute.coverage.citationCount,
        }),
        metric({
          id: "wiki_timeline_events",
          label: "Timeline events",
          value: evidenceRoute.coverage.timelineCount,
        }),
        metric({
          id: "wiki_interventions",
          label: "Interventions",
          value: evidenceRoute.coverage.interventionCount,
        }),
      ],
      // Evidence rows rank source-backed wiki bundles, which carry no route-month trend.
      movement6mPct: null,
      context12mPct: null,
    }));
}
