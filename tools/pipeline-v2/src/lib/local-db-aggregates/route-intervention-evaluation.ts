import {
  type LocalAceRoute,
  type LocalBusLane,
  type LocalPipelineDb,
  type LocalRouteMonthTrend,
  type LocalRouteStop,
  listAceRoutes,
  listBusLanes,
  listRouteBriefSummaries,
  listRouteMonthTrends,
  listRouteStops,
  replaceRouteInterventionEvaluationRows,
} from "@bp/db/local";
import type { OperationalDateAssertion } from "@bp/domain/documents/operational-date";
import { busLaneMatches } from "../route-briefs/index.ts";

const sourceId = "mta_ace_routes";
const busLaneSourceId = "nyc_dot_bus_lanes";
export const documentOperationalDateSourceId = "mta_wiki_document_operational_date_assertions";
export const defaultInterventionEvaluationWindowMonths = 3;
export const defaultInterventionEvaluationMinSampleMonths = 1;
export const defaultInterventionEvaluationComparisonRouteCount = 10;

const detectorReadyDocumentRouteResolutionTiers = new Set([
  "direct_event_text",
  "source_single_route_context",
]);

export type RouteInterventionEvaluationLocalDb = {
  readonly db: LocalPipelineDb;
};

export type RouteInterventionEvaluationResult = {
  isoMonth: string;
  routeUniverseMonth: string;
  routeCount: number;
  eventCount: number;
  comparisonCount: number;
  documentAnchorEventCount: number;
  documentAnchorComparisonCount: number;
  evaluatedComparisonCount: number;
  futureComparisonCount: number;
  insufficientComparisonCount: number;
  sourceGapComparisonCount: number;
};

type InterventionEventRow = {
  eventId: string;
  routeId: string;
  interventionType: string;
  sourceId: string;
  program: string;
  implementationDate: string;
  implementationMonth: string;
  eventStatus: string;
  description: string;
};

type TrendWindowSummary = {
  months: string[];
  requestedMonthCount: number;
  speedSampleMonthCount: number;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  ridershipSampleMonthCount: number;
  averageMonthlyRidership: number | null;
};

type PeerComparisonSummary = {
  routeIds: string[];
  routeCount: number;
  preAverageSpeedMph: number | null;
  postAverageSpeedMph: number | null;
  speedDeltaMph: number | null;
  adjustedSpeedDeltaMph: number | null;
  preAverageMonthlyRidership: number | null;
  postAverageMonthlyRidership: number | null;
  ridershipDelta: number | null;
  adjustedRidershipDelta: number | null;
};

type ParsedBusLaneOpenDate = {
  sourceValue: string;
  date: string;
  month: string;
};

type BusLaneDateGroup = {
  implementationMonth: string;
  implementationDate: string;
  lanes: LocalBusLane[];
  sourceValues: Set<string>;
};

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function monthIndex(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined)
    throw new Error(`Invalid ISO month: ${month}`);
  return year * 12 + monthNumber - 1;
}

function isoMonthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return isoMonth(year, monthNumber);
}

function normalizeTwoDigitYear(year: number): number {
  return year >= 50 ? 1900 + year : 2000 + year;
}

function utcDateForParts(monthNumber: number, dayOfMonth: number, year: number): string | null {
  const normalizedYear = year < 100 ? normalizeTwoDigitYear(year) : year;
  const date = new Date(Date.UTC(normalizedYear, monthNumber - 1, dayOfMonth));
  if (
    date.getUTCFullYear() !== normalizedYear ||
    date.getUTCMonth() !== monthNumber - 1 ||
    date.getUTCDate() !== dayOfMonth
  ) {
    return null;
  }
  return date.toISOString();
}

function parseBusLaneOpenDateToken(token: string): string | null {
  const trimmed = token.trim();
  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly !== null) return utcDateForParts(1, 1, Number(yearOnly[1]));
  const parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (parts === null) return null;
  const monthNumber = Number(parts[1]);
  if (parts[3] === undefined) return utcDateForParts(monthNumber, 1, Number(parts[2]));
  return utcDateForParts(monthNumber, Number(parts[2]), Number(parts[3]));
}

export function parseBusLaneOpenDates(value: string | undefined): ParsedBusLaneOpenDate[] {
  if (value === undefined || value.trim().length === 0) return [];
  return value
    .split(/[,;&]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => ({ token, parsed: parseBusLaneOpenDateToken(token) }))
    .filter((entry): entry is { token: string; parsed: string } => entry.parsed !== null)
    .map((entry) => ({
      sourceValue: entry.token,
      date: entry.parsed,
      month: implementationMonthFromDate(entry.parsed),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function latestBusLaneOpenDate(lane: LocalBusLane): ParsedBusLaneOpenDate | null {
  return parseBusLaneOpenDates(lane.openDate).at(-1) ?? null;
}

function implementationMonthFromDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = value.match(/^(\d{4})-(\d{2})/);
    if (fallback === null) throw new Error(`Invalid intervention implementation date: ${value}`);
    return `${fallback[1]}-${fallback[2]}`;
  }
  return isoMonth(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1);
}

function eventIdFor(route: LocalAceRoute): string {
  const dateKey = route.implementationDate.slice(0, 10);
  return `ace:${route.routeId}:${route.program}:${dateKey}`;
}

function monthWindow(startIndex: number, endIndex: number): string[] {
  if (endIndex < startIndex) return [];
  const months: string[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) months.push(isoMonthFromIndex(index));
  return months;
}

function trendKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function summarizeTrendWindow(input: {
  routeId: string;
  months: string[];
  trendsByRouteMonth: Map<string, LocalRouteMonthTrend>;
}): TrendWindowSummary {
  const rows = input.months
    .map((month) => input.trendsByRouteMonth.get(trendKey(input.routeId, month)))
    .filter((row): row is LocalRouteMonthTrend => row !== undefined);
  const speedRows = rows.filter(
    (row) => row.hasSpeedTrend && row.averageSpeedMph !== null && row.speedObservationCount > 0,
  );
  const ridershipRows = rows.filter(
    (row) => row.hasRidershipTrend && row.ridership !== null && row.ridership > 0,
  );
  const speedObservationCount = speedRows.reduce((sum, row) => sum + row.speedObservationCount, 0);
  const speedBusTripCount = speedRows.reduce((sum, row) => sum + row.speedBusTripCount, 0);
  const averageSpeedMph =
    speedRows.length === 0
      ? null
      : speedBusTripCount > 0
        ? round(
            speedRows.reduce(
              (sum, row) => sum + (row.averageSpeedMph ?? 0) * row.speedBusTripCount,
              0,
            ) / speedBusTripCount,
          )
        : round(
            speedRows.reduce((sum, row) => sum + (row.averageSpeedMph ?? 0), 0) / speedRows.length,
          );
  const averageMonthlyRidership =
    ridershipRows.length === 0
      ? null
      : round(
          ridershipRows.reduce((sum, row) => sum + (row.ridership ?? 0), 0) / ridershipRows.length,
        );

  return {
    months: input.months,
    requestedMonthCount: input.months.length,
    speedSampleMonthCount: speedRows.length,
    speedObservationCount,
    speedBusTripCount,
    averageSpeedMph,
    ridershipSampleMonthCount: ridershipRows.length,
    averageMonthlyRidership,
  };
}

function weightedAverage(
  entries: readonly { value: number | null; weight: number }[],
): number | null {
  const usable = entries.filter((entry) => entry.value !== null && entry.weight > 0);
  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return null;
  return round(
    usable.reduce((sum, entry) => sum + (entry.value ?? 0) * entry.weight, 0) / totalWeight,
  );
}

function average(values: readonly (number | null)[]): number | null {
  const usable = values.filter((value): value is number => value !== null);
  if (usable.length === 0) return null;
  return round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

function delta(post: number | null, pre: number | null): number | null {
  return post === null || pre === null ? null : round(post - pre);
}

function buildPeerComparison(input: {
  routeId: string;
  candidateRouteIds: readonly string[];
  excludedRouteIds: ReadonlySet<string>;
  preMonths: string[];
  postMonths: string[];
  minSampleMonths: number;
  comparisonRouteCount: number;
  treatedPre: TrendWindowSummary;
  treatedPost: TrendWindowSummary;
  trendsByRouteMonth: Map<string, LocalRouteMonthTrend>;
}): PeerComparisonSummary | null {
  const treatedPreSpeed = input.treatedPre.averageSpeedMph;
  const treatedPostSpeed = input.treatedPost.averageSpeedMph;
  if (treatedPreSpeed === null || treatedPostSpeed === null) return null;
  const treatedRidership = input.treatedPre.averageMonthlyRidership;
  const candidates = input.candidateRouteIds
    .filter((routeId) => routeId !== input.routeId && !input.excludedRouteIds.has(routeId))
    .map((routeId) => {
      const pre = summarizeTrendWindow({
        routeId,
        months: input.preMonths,
        trendsByRouteMonth: input.trendsByRouteMonth,
      });
      const post = summarizeTrendWindow({
        routeId,
        months: input.postMonths,
        trendsByRouteMonth: input.trendsByRouteMonth,
      });
      if (
        pre.speedSampleMonthCount < input.minSampleMonths ||
        post.speedSampleMonthCount < input.minSampleMonths ||
        pre.averageSpeedMph === null ||
        post.averageSpeedMph === null
      ) {
        return null;
      }
      const speedDistance =
        Math.abs(pre.averageSpeedMph - treatedPreSpeed) / Math.max(treatedPreSpeed, 1);
      const ridershipDistance =
        treatedRidership !== null && pre.averageMonthlyRidership !== null
          ? Math.abs(pre.averageMonthlyRidership - treatedRidership) / Math.max(treatedRidership, 1)
          : 0;
      return {
        routeId,
        pre,
        post,
        matchScore: speedDistance + ridershipDistance * 0.25,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        routeId: string;
        pre: TrendWindowSummary;
        post: TrendWindowSummary;
        matchScore: number;
      } => candidate !== null,
    )
    .sort(
      (left, right) =>
        left.matchScore - right.matchScore || left.routeId.localeCompare(right.routeId),
    )
    .slice(0, input.comparisonRouteCount);

  if (candidates.length === 0) return null;

  const preAverageSpeedMph = weightedAverage(
    candidates.map((candidate) => ({
      value: candidate.pre.averageSpeedMph,
      weight: candidate.pre.speedBusTripCount,
    })),
  );
  const postAverageSpeedMph = weightedAverage(
    candidates.map((candidate) => ({
      value: candidate.post.averageSpeedMph,
      weight: candidate.post.speedBusTripCount,
    })),
  );
  const comparisonSpeedDeltaMph = delta(postAverageSpeedMph, preAverageSpeedMph);
  const treatedSpeedDeltaMph = delta(treatedPostSpeed, treatedPreSpeed);
  const preAverageMonthlyRidership = average(
    candidates.map((candidate) => candidate.pre.averageMonthlyRidership),
  );
  const postAverageMonthlyRidership = average(
    candidates.map((candidate) => candidate.post.averageMonthlyRidership),
  );
  const comparisonRidershipDelta = delta(postAverageMonthlyRidership, preAverageMonthlyRidership);
  const treatedRidershipDelta = delta(
    input.treatedPost.averageMonthlyRidership,
    input.treatedPre.averageMonthlyRidership,
  );

  return {
    routeIds: candidates.map((candidate) => candidate.routeId),
    routeCount: candidates.length,
    preAverageSpeedMph,
    postAverageSpeedMph,
    speedDeltaMph: comparisonSpeedDeltaMph,
    adjustedSpeedDeltaMph:
      treatedSpeedDeltaMph === null || comparisonSpeedDeltaMph === null
        ? null
        : round(treatedSpeedDeltaMph - comparisonSpeedDeltaMph),
    preAverageMonthlyRidership,
    postAverageMonthlyRidership,
    ridershipDelta: comparisonRidershipDelta,
    adjustedRidershipDelta:
      treatedRidershipDelta === null || comparisonRidershipDelta === null
        ? null
        : round(treatedRidershipDelta - comparisonRidershipDelta),
  };
}

function caveatFor(input: {
  comparisonStatus: string;
  minSampleMonths: number;
  pre: TrendWindowSummary;
  post: TrendWindowSummary;
  peerComparison: PeerComparisonSummary | null;
}): string {
  if (input.comparisonStatus === "future_intervention")
    return "Implementation is after the analysis month; before/after evaluation is not available yet.";
  if (input.comparisonStatus === "insufficient_pre_data")
    return `Insufficient pre-period monthly speed trend rows: ${input.pre.speedSampleMonthCount} available, ${input.minSampleMonths} required.`;
  if (input.comparisonStatus === "insufficient_post_data")
    return `Insufficient post-period monthly speed trend rows: ${input.post.speedSampleMonthCount} available, ${input.minSampleMonths} required.`;
  if (input.peerComparison !== null && input.peerComparison.routeCount > 0)
    return `Peer-adjusted before/after using ${input.peerComparison.routeCount} public route(s) matched on pre-period speed and ridership; this controls for networkwide seasonal shifts but is not a causal estimate.`;
  return "Descriptive before/after only; not seasonality-adjusted and not matched to comparison routes.";
}

function comparisonStatus(input: {
  implementationMonth: string;
  analysisMonth: string;
  minSampleMonths: number;
  pre: TrendWindowSummary;
  post: TrendWindowSummary;
}): "evaluated" | "future_intervention" | "insufficient_pre_data" | "insufficient_post_data" {
  if (monthIndex(input.implementationMonth) > monthIndex(input.analysisMonth))
    return "future_intervention";
  if (input.pre.speedSampleMonthCount < input.minSampleMonths) return "insufficient_pre_data";
  if (input.post.speedSampleMonthCount < input.minSampleMonths) return "insufficient_post_data";
  return "evaluated";
}

function eventRow(input: {
  route: LocalAceRoute;
  implementationMonth: string;
  analysisMonth: string;
}): InterventionEventRow {
  return {
    eventId: eventIdFor(input.route),
    routeId: input.route.routeId,
    interventionType: "automated_bus_lane_enforcement",
    sourceId,
    program: input.route.program,
    implementationDate: input.route.implementationDate,
    implementationMonth: input.implementationMonth,
    eventStatus:
      monthIndex(input.implementationMonth) <= monthIndex(input.analysisMonth)
        ? "implemented"
        : "future",
    description: `${input.route.program} automated bus lane enforcement for ${input.route.routeId}`,
  };
}

function busLaneSourceGapEventRow(input: {
  routeId: string;
  analysisMonth: string;
  missingDateLaneCount?: number;
  matchedLaneCount?: number;
}): InterventionEventRow {
  const missingDateLaneCount = input.missingDateLaneCount ?? 0;
  const matchedLaneCount = input.matchedLaneCount ?? 0;
  const description =
    matchedLaneCount > 0
      ? `NYC DOT bus lane match for ${input.routeId}; ${missingDateLaneCount} of ${matchedLaneCount} matched segment(s) lack parseable open_dates for before/after comparison.`
      : `NYC DOT bus lane match for ${input.routeId}; route-level implementation date is not available in the current pipeline evidence.`;
  return {
    eventId: `bus-lane-source-gap:${input.routeId}:${input.analysisMonth}`,
    routeId: input.routeId,
    interventionType: "bus_lane_infrastructure",
    sourceId: busLaneSourceId,
    program: "NYC DOT Bus Lanes",
    implementationDate: `${input.analysisMonth}-01T00:00:00.000Z`,
    implementationMonth: input.analysisMonth,
    eventStatus: "source_gap",
    description,
  };
}

function busLaneDatedEventRow(input: {
  routeId: string;
  group: BusLaneDateGroup;
  analysisMonth: string;
}): InterventionEventRow {
  const sourceSample = [...input.group.sourceValues].sort().slice(0, 3).join("; ");
  const sourceSuffix =
    input.group.sourceValues.size > 3 ? `; +${input.group.sourceValues.size - 3} more` : "";
  return {
    eventId: `bus-lane:${input.routeId}:${input.group.implementationMonth}`,
    routeId: input.routeId,
    interventionType: "bus_lane_infrastructure",
    sourceId: busLaneSourceId,
    program: "NYC DOT Bus Lanes",
    implementationDate: input.group.implementationDate,
    implementationMonth: input.group.implementationMonth,
    eventStatus:
      monthIndex(input.group.implementationMonth) <= monthIndex(input.analysisMonth)
        ? "implemented"
        : "future",
    description: `NYC DOT latest matched bus lane opening evidence for ${input.routeId} in ${input.group.implementationMonth}; ${input.group.lanes.length} matched segment(s); source open_dates: ${sourceSample}${sourceSuffix}.`,
  };
}

function documentAnchorInterventionType(family: string): string {
  switch (family) {
    case "busway_or_transitway":
      return "busway";
    case "bus_lane":
    case "offset_or_curbside_bus_lane":
      return "bus_lane_infrastructure";
    case "camera_enforcement":
      return "automated_bus_lane_enforcement";
    case "transit_signal_priority":
      return "transit_signal_priority";
    case "queue_jump":
      return "queue_jump";
    case "select_bus_service":
      return "select_bus_service";
    case "stop_consolidation":
      return "stop_consolidation";
    case "route_redesign_or_service_pattern":
      return "route_redesign_or_service_pattern";
    case "curb_management":
      return "curb_management";
    case "street_design_or_turn_restriction":
      return "street_design_or_turn_restriction";
    default:
      return "documented_bus_priority_intervention";
  }
}

function documentAnchorLabel(row: OperationalDateAssertion): string {
  return (
    row.eventName ??
    row.displayLabel ??
    row.treatmentText ??
    row.locationText ??
    row.interventionFamily
  );
}

function documentAnchorDescription(row: OperationalDateAssertion, routeId: string): string {
  const sourceSummary =
    row.sourceCount > 1 ? `${row.sourceCount} document sources` : (row.sourceTitle ?? row.sourceId);
  return `Document-derived ${row.interventionFamily} anchor for ${routeId}: ${documentAnchorLabel(row)}; source-stated operational date ${row.operationalDate ?? row.effectiveDateStart}; confidence ${row.confidence}; ${sourceSummary}.`;
}

function compareDocumentAnchorRows(
  left: OperationalDateAssertion,
  right: OperationalDateAssertion,
): number {
  return (
    right.confidence - left.confidence ||
    right.sourceCount - left.sourceCount ||
    (left.effectiveDateStart ?? "").localeCompare(right.effectiveDateStart ?? "") ||
    left.surfaceId.localeCompare(right.surfaceId)
  );
}

export function buildDocumentAnchorEventsForRouteEvaluation(input: {
  assertions: readonly OperationalDateAssertion[];
  publicRouteIds: ReadonlySet<string>;
  analysisMonth: string;
}): InterventionEventRow[] {
  const bestByRouteIntervention = new Map<
    string,
    { routeId: string; assertion: OperationalDateAssertion }
  >();

  for (const assertion of input.assertions) {
    if (
      !assertion.causalAnchorEligible ||
      assertion.implementationMonth === null ||
      assertion.effectiveDateStart === null ||
      !detectorReadyDocumentRouteResolutionTiers.has(assertion.routeResolutionTier ?? "")
    ) {
      continue;
    }
    for (const routeId of assertion.routeIds) {
      if (!input.publicRouteIds.has(routeId)) continue;
      const key = `${routeId}|${assertion.interventionId}`;
      const existing = bestByRouteIntervention.get(key);
      if (existing === undefined || compareDocumentAnchorRows(assertion, existing.assertion) < 0) {
        bestByRouteIntervention.set(key, { routeId, assertion });
      }
    }
  }

  return [...bestByRouteIntervention.values()]
    .toSorted((left, right) =>
      `${left.routeId}|${left.assertion.implementationMonth}|${left.assertion.interventionId}`.localeCompare(
        `${right.routeId}|${right.assertion.implementationMonth}|${right.assertion.interventionId}`,
      ),
    )
    .map(({ routeId, assertion }) => ({
      routeId,
      assertion,
      effectiveDateStart: assertion.effectiveDateStart,
      implementationMonth: assertion.implementationMonth,
    }))
    .filter(
      (
        entry,
      ): entry is {
        routeId: string;
        assertion: OperationalDateAssertion;
        effectiveDateStart: string;
        implementationMonth: string;
      } => entry.effectiveDateStart !== null && entry.implementationMonth !== null,
    )
    .map(({ routeId, assertion, effectiveDateStart, implementationMonth }) => ({
      eventId: `doc-anchor:${routeId}:${assertion.interventionId}`,
      routeId,
      interventionType: documentAnchorInterventionType(assertion.interventionFamily),
      sourceId: documentOperationalDateSourceId,
      program: "mta-wiki document operational dates",
      implementationDate: effectiveDateStart,
      implementationMonth,
      eventStatus:
        monthIndex(implementationMonth) <= monthIndex(input.analysisMonth)
          ? "implemented"
          : "future",
      description: documentAnchorDescription(assertion, routeId),
    }));
}

function buildComparison(input: {
  event: InterventionEventRow;
  analysisMonth: string;
  windowMonths: number;
  minSampleMonths: number;
  comparisonRouteCount: number;
  candidateRouteIds: readonly string[];
  excludedComparisonRouteIds: ReadonlySet<string>;
  trendsByRouteMonth: Map<string, LocalRouteMonthTrend>;
}) {
  const implementationIndex = monthIndex(input.event.implementationMonth);
  const analysisIndex = monthIndex(input.analysisMonth);
  const preMonths = monthWindow(implementationIndex - input.windowMonths, implementationIndex - 1);
  const postMonths = monthWindow(
    implementationIndex + 1,
    Math.min(implementationIndex + input.windowMonths, analysisIndex),
  );
  const pre = summarizeTrendWindow({
    routeId: input.event.routeId,
    months: preMonths,
    trendsByRouteMonth: input.trendsByRouteMonth,
  });
  const post = summarizeTrendWindow({
    routeId: input.event.routeId,
    months: postMonths,
    trendsByRouteMonth: input.trendsByRouteMonth,
  });
  const status = comparisonStatus({
    implementationMonth: input.event.implementationMonth,
    analysisMonth: input.analysisMonth,
    minSampleMonths: input.minSampleMonths,
    pre,
    post,
  });
  const peerComparison =
    status === "evaluated"
      ? buildPeerComparison({
          routeId: input.event.routeId,
          candidateRouteIds: input.candidateRouteIds,
          excludedRouteIds: input.excludedComparisonRouteIds,
          preMonths,
          postMonths,
          minSampleMonths: input.minSampleMonths,
          comparisonRouteCount: input.comparisonRouteCount,
          treatedPre: pre,
          treatedPost: post,
          trendsByRouteMonth: input.trendsByRouteMonth,
        })
      : null;
  const evaluationLevel =
    status === "evaluated"
      ? peerComparison === null
        ? "descriptive_before_after"
        : "peer_adjusted_before_after"
      : status === "future_intervention"
        ? "not_evaluated_future"
        : "insufficient_trend_data";

  return {
    routeId: input.event.routeId,
    month: input.analysisMonth,
    eventId: input.event.eventId,
    interventionType: input.event.interventionType,
    sourceId: input.event.sourceId,
    evaluationLevel,
    comparisonStatus: status,
    preStartMonth: pre.months[0] ?? null,
    preEndMonth: pre.months.at(-1) ?? null,
    postStartMonth: post.months[0] ?? null,
    postEndMonth: post.months.at(-1) ?? null,
    requestedPreMonthCount: pre.requestedMonthCount,
    requestedPostMonthCount: post.requestedMonthCount,
    preSampleMonthCount: pre.speedSampleMonthCount,
    postSampleMonthCount: post.speedSampleMonthCount,
    preSpeedObservationCount: pre.speedObservationCount,
    postSpeedObservationCount: post.speedObservationCount,
    preAverageSpeedMph: pre.averageSpeedMph,
    postAverageSpeedMph: post.averageSpeedMph,
    speedDeltaMph:
      pre.averageSpeedMph === null || post.averageSpeedMph === null
        ? null
        : round(post.averageSpeedMph - pre.averageSpeedMph),
    preAverageMonthlyRidership: pre.averageMonthlyRidership,
    postAverageMonthlyRidership: post.averageMonthlyRidership,
    ridershipDelta: delta(post.averageMonthlyRidership, pre.averageMonthlyRidership),
    comparisonRouteCount: peerComparison?.routeCount ?? 0,
    comparisonRouteIds: peerComparison === null ? null : JSON.stringify(peerComparison.routeIds),
    comparisonPreAverageSpeedMph: peerComparison?.preAverageSpeedMph ?? null,
    comparisonPostAverageSpeedMph: peerComparison?.postAverageSpeedMph ?? null,
    comparisonSpeedDeltaMph: peerComparison?.speedDeltaMph ?? null,
    adjustedSpeedDeltaMph: peerComparison?.adjustedSpeedDeltaMph ?? null,
    comparisonPreAverageMonthlyRidership: peerComparison?.preAverageMonthlyRidership ?? null,
    comparisonPostAverageMonthlyRidership: peerComparison?.postAverageMonthlyRidership ?? null,
    comparisonRidershipDelta: peerComparison?.ridershipDelta ?? null,
    adjustedRidershipDelta: peerComparison?.adjustedRidershipDelta ?? null,
    caveat: caveatFor({
      comparisonStatus: status,
      minSampleMonths: input.minSampleMonths,
      pre,
      post,
      peerComparison,
    }),
  };
}

function buildBusLaneSourceGapComparison(input: {
  event: InterventionEventRow;
  analysisMonth: string;
}) {
  return {
    routeId: input.event.routeId,
    month: input.analysisMonth,
    eventId: input.event.eventId,
    interventionType: input.event.interventionType,
    sourceId: input.event.sourceId,
    evaluationLevel: "not_evaluated_source_gap",
    comparisonStatus: "source_gap_missing_implementation_date",
    preStartMonth: null,
    preEndMonth: null,
    postStartMonth: null,
    postEndMonth: null,
    requestedPreMonthCount: 0,
    requestedPostMonthCount: 0,
    preSampleMonthCount: 0,
    postSampleMonthCount: 0,
    preSpeedObservationCount: 0,
    postSpeedObservationCount: 0,
    preAverageSpeedMph: null,
    postAverageSpeedMph: null,
    speedDeltaMph: null,
    preAverageMonthlyRidership: null,
    postAverageMonthlyRidership: null,
    ridershipDelta: null,
    comparisonRouteCount: 0,
    comparisonRouteIds: null,
    comparisonPreAverageSpeedMph: null,
    comparisonPostAverageSpeedMph: null,
    comparisonSpeedDeltaMph: null,
    adjustedSpeedDeltaMph: null,
    comparisonPreAverageMonthlyRidership: null,
    comparisonPostAverageMonthlyRidership: null,
    comparisonRidershipDelta: null,
    adjustedRidershipDelta: null,
    caveat:
      "NYC DOT bus lane geometry is matched to the route, but this pipeline has no route-level implementation date for a before/after comparison.",
  };
}

function groupDatedBusLaneMatches(lanes: readonly LocalBusLane[]): {
  groups: BusLaneDateGroup[];
  missingDateLaneCount: number;
} {
  const groupsByMonth = new Map<string, BusLaneDateGroup>();
  let missingDateLaneCount = 0;
  for (const lane of lanes) {
    const latestOpenDate = latestBusLaneOpenDate(lane);
    if (latestOpenDate === null) {
      missingDateLaneCount += 1;
      continue;
    }
    const existing = groupsByMonth.get(latestOpenDate.month);
    if (existing === undefined) {
      groupsByMonth.set(latestOpenDate.month, {
        implementationMonth: latestOpenDate.month,
        implementationDate: latestOpenDate.date,
        lanes: [lane],
        sourceValues: new Set(lane.openDate === undefined ? [] : [lane.openDate]),
      });
      continue;
    }
    existing.lanes.push(lane);
    if (lane.openDate !== undefined) existing.sourceValues.add(lane.openDate);
    if (latestOpenDate.date < existing.implementationDate)
      existing.implementationDate = latestOpenDate.date;
  }
  return {
    groups: [...groupsByMonth.values()].sort((left, right) =>
      left.implementationMonth.localeCompare(right.implementationMonth),
    ),
    missingDateLaneCount,
  };
}

function buildBusLaneEventsForRoute(input: {
  routeId: string;
  analysisMonth: string;
  busLanes: readonly LocalBusLane[];
  stops: readonly LocalRouteStop[];
}): InterventionEventRow[] {
  const matchedLanes = busLaneMatches([...input.busLanes], [...input.stops]).map(
    (match) => match.lane,
  );
  const { groups, missingDateLaneCount } = groupDatedBusLaneMatches(matchedLanes);
  const latestDatedGroup = groups.at(-1);
  const datedEvents =
    latestDatedGroup === undefined
      ? []
      : [
          busLaneDatedEventRow({
            routeId: input.routeId,
            analysisMonth: input.analysisMonth,
            group: latestDatedGroup,
          }),
        ];
  const needsSourceGap = matchedLanes.length === 0 || missingDateLaneCount > 0;
  const sourceGapArgs =
    matchedLanes.length === 0
      ? {
          routeId: input.routeId,
          analysisMonth: input.analysisMonth,
        }
      : {
          routeId: input.routeId,
          analysisMonth: input.analysisMonth,
          missingDateLaneCount,
          matchedLaneCount: matchedLanes.length,
        };
  const sourceGapEvents = needsSourceGap ? [busLaneSourceGapEventRow(sourceGapArgs)] : [];
  return [...datedEvents, ...sourceGapEvents];
}

export async function runRouteInterventionEvaluation(inputs: {
  local: RouteInterventionEvaluationLocalDb;
  year: number;
  month: number;
  routeUniverseYear?: number | undefined;
  routeUniverseMonth?: number | undefined;
  windowMonths?: number | undefined;
  minSampleMonths?: number | undefined;
  comparisonRouteCount?: number | undefined;
  documentOperationalDateAssertions?: readonly OperationalDateAssertion[] | undefined;
}): Promise<RouteInterventionEvaluationResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const routeUniverseMonth = isoMonth(
    inputs.routeUniverseYear ?? inputs.year,
    inputs.routeUniverseMonth ?? inputs.month,
  );
  const windowMonths = Math.max(
    1,
    Math.round(inputs.windowMonths ?? defaultInterventionEvaluationWindowMonths),
  );
  const minSampleMonths = Math.max(
    1,
    Math.round(inputs.minSampleMonths ?? defaultInterventionEvaluationMinSampleMonths),
  );
  const comparisonRouteCount = Math.max(
    1,
    Math.round(inputs.comparisonRouteCount ?? defaultInterventionEvaluationComparisonRouteCount),
  );

  const [briefs, aceRoutes, trends, busLanes] = await Promise.all([
    listRouteBriefSummaries(inputs.local.db, routeUniverseMonth),
    listAceRoutes(inputs.local.db),
    listRouteMonthTrends(inputs.local.db),
    listBusLanes(inputs.local.db),
  ]);
  const publicRouteIds = new Set(
    briefs.filter((brief) => brief.publicVisible).map((brief) => brief.routeId),
  );
  const busLaneMatchedRouteIds = briefs
    .filter((brief) => brief.publicVisible && brief.busLaneMatchedLaneCount > 0)
    .map((brief) => brief.routeId);
  const relevantAceRoutes = aceRoutes.filter((route) => publicRouteIds.has(route.routeId));
  const documentAnchorEvents = buildDocumentAnchorEventsForRouteEvaluation({
    assertions: inputs.documentOperationalDateAssertions ?? [],
    publicRouteIds,
    analysisMonth: month,
  });
  const excludedComparisonRouteIds = new Set([
    ...relevantAceRoutes
      .filter(
        (route) =>
          monthIndex(implementationMonthFromDate(route.implementationDate)) <= monthIndex(month),
      )
      .map((route) => route.routeId),
    ...documentAnchorEvents
      .filter((event) => monthIndex(event.implementationMonth) <= monthIndex(month))
      .map((event) => event.routeId),
  ]);
  const trendsByRouteMonth = new Map(
    trends.map((trend) => [trendKey(trend.routeId, trend.month), trend]),
  );
  const aceEvents = relevantAceRoutes.map((route) =>
    eventRow({
      route,
      implementationMonth: implementationMonthFromDate(route.implementationDate),
      analysisMonth: month,
    }),
  );
  const aceComparisons = aceEvents.map((event) =>
    buildComparison({
      event,
      analysisMonth: month,
      windowMonths,
      minSampleMonths,
      comparisonRouteCount,
      candidateRouteIds: [...publicRouteIds],
      excludedComparisonRouteIds,
      trendsByRouteMonth,
    }),
  );
  const busLaneEvents: InterventionEventRow[] = [];
  for (const routeId of busLaneMatchedRouteIds) {
    const stops = await listRouteStops(inputs.local.db, routeId, routeUniverseMonth);
    busLaneEvents.push(
      ...buildBusLaneEventsForRoute({
        routeId,
        analysisMonth: month,
        busLanes,
        stops,
      }),
    );
  }
  const busLaneComparisons = busLaneEvents.map((event) =>
    event.eventStatus === "source_gap"
      ? buildBusLaneSourceGapComparison({
          event,
          analysisMonth: month,
        })
      : buildComparison({
          event,
          analysisMonth: month,
          windowMonths,
          minSampleMonths,
          comparisonRouteCount,
          candidateRouteIds: [...publicRouteIds],
          excludedComparisonRouteIds,
          trendsByRouteMonth,
        }),
  );
  const documentAnchorComparisons = documentAnchorEvents.map((event) =>
    buildComparison({
      event,
      analysisMonth: month,
      windowMonths,
      minSampleMonths,
      comparisonRouteCount,
      candidateRouteIds: [...publicRouteIds],
      excludedComparisonRouteIds,
      trendsByRouteMonth,
    }),
  );

  const events = [...aceEvents, ...busLaneEvents, ...documentAnchorEvents];
  const comparisons = [...aceComparisons, ...busLaneComparisons, ...documentAnchorComparisons];

  const aceRows = {
    events: events.filter((event) => event.sourceId === sourceId),
    comparisons: comparisons.filter((comparison) => comparison.sourceId === sourceId),
  };
  const busLaneRows = {
    events: events.filter((event) => event.sourceId === busLaneSourceId),
    comparisons: comparisons.filter((comparison) => comparison.sourceId === busLaneSourceId),
  };
  const documentAnchorRows = {
    events: events.filter((event) => event.sourceId === documentOperationalDateSourceId),
    comparisons: comparisons.filter(
      (comparison) => comparison.sourceId === documentOperationalDateSourceId,
    ),
  };

  await replaceRouteInterventionEvaluationRows(inputs.local.db, month, sourceId, aceRows);
  await replaceRouteInterventionEvaluationRows(
    inputs.local.db,
    month,
    busLaneSourceId,
    busLaneRows,
  );
  await replaceRouteInterventionEvaluationRows(
    inputs.local.db,
    month,
    documentOperationalDateSourceId,
    documentAnchorRows,
  );

  return {
    isoMonth: month,
    routeUniverseMonth,
    routeCount: publicRouteIds.size,
    eventCount: events.length,
    comparisonCount: comparisons.length,
    documentAnchorEventCount: documentAnchorEvents.length,
    documentAnchorComparisonCount: documentAnchorComparisons.length,
    evaluatedComparisonCount: comparisons.filter(
      (comparison) => comparison.comparisonStatus === "evaluated",
    ).length,
    futureComparisonCount: comparisons.filter(
      (comparison) => comparison.comparisonStatus === "future_intervention",
    ).length,
    insufficientComparisonCount: comparisons.filter((comparison) =>
      comparison.comparisonStatus.startsWith("insufficient_"),
    ).length,
    sourceGapComparisonCount: comparisons.filter((comparison) =>
      comparison.comparisonStatus.startsWith("source_gap_"),
    ).length,
  };
}
