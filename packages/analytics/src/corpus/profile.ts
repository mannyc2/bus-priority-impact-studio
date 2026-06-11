export type CorpusProfileObservation = {
  sourceId: string;
  family: string;
  month: string;
  routeId: string | null;
  rowCount: number;
  sampleCount: number | null;
};

export type CorpusProfileSourceStatus =
  | "historical_ready"
  | "historical_ready_missing_release"
  | "release_only"
  | "sparse_history"
  | "outside_window_only";

export type CorpusProfileSourceSummary = {
  sourceId: string;
  family: string;
  firstMonth: string;
  lastMonth: string;
  monthCount: number;
  routeCount: number;
  totalRows: number;
  totalSamples: number | null;
  releaseMonthRows: number;
  releaseMonthRoutes: number;
  historicalMonthsBeforeRelease: number;
  requestedWindowMonthCount: number;
  requestedWindowCoverageShare: number;
  status: CorpusProfileSourceStatus;
};

export type CorpusProfileMonthSummary = {
  month: string;
  sourceCount: number;
  routeCount: number;
  totalRows: number;
  totalSamples: number | null;
};

export type CorpusProfile = {
  releaseMonth: string;
  historyStartMonth: string;
  requestedWindowMonthCount: number;
  summary: {
    sourceCount: number;
    sourceFamilyCount: number;
    routeCount: number;
    monthCount: number;
    totalRows: number;
    historicalReadySourceCount: number;
    releaseOnlySourceCount: number;
    sparseSourceCount: number;
  };
  sources: CorpusProfileSourceSummary[];
  months: CorpusProfileMonthSummary[];
};

export type SummarizeCorpusProfileInput = {
  releaseMonth: string;
  historyStartMonth: string;
  observations: readonly CorpusProfileObservation[];
  minHistoricalMonths?: number;
};

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

function assertIsoMonth(value: string): string {
  if (!ISO_MONTH_RE.test(value)) throw new Error(`Invalid ISO month: ${value}`);
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) throw new Error(`Invalid ISO month: ${value}`);
  return value;
}

function monthOrdinal(month: string): number {
  assertIsoMonth(month);
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function monthCountInclusive(startMonth: string, endMonth: string): number {
  const count = monthOrdinal(endMonth) - monthOrdinal(startMonth) + 1;
  if (count <= 0) throw new Error("historyStartMonth must be before or equal to releaseMonth.");
  return count;
}

function inRequestedWindow(month: string, startMonth: string, releaseMonth: string): boolean {
  return month >= startMonth && month <= releaseMonth;
}

function finiteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number.`);
  }
  return value;
}

function sourceStatus(input: {
  monthCount: number;
  releaseMonthRows: number;
  historicalMonthsBeforeRelease: number;
  requestedWindowCoverageShare: number;
  inWindowMonthCount: number;
  minHistoricalMonths: number;
}): CorpusProfileSourceStatus {
  if (input.inWindowMonthCount === 0) return "outside_window_only";
  if (input.monthCount === 1 && input.releaseMonthRows > 0) return "release_only";
  if (
    input.historicalMonthsBeforeRelease >= input.minHistoricalMonths &&
    input.requestedWindowCoverageShare >= 0.8
  ) {
    return input.releaseMonthRows > 0 ? "historical_ready" : "historical_ready_missing_release";
  }
  return "sparse_history";
}

export function summarizeCorpusProfile(input: SummarizeCorpusProfileInput): CorpusProfile {
  const releaseMonth = assertIsoMonth(input.releaseMonth);
  const historyStartMonth = assertIsoMonth(input.historyStartMonth);
  const requestedWindowMonthCount = monthCountInclusive(historyStartMonth, releaseMonth);
  const minHistoricalMonths = input.minHistoricalMonths ?? 12;

  const sourceGroups = new Map<string, CorpusProfileObservation[]>();
  const monthGroups = new Map<string, CorpusProfileObservation[]>();
  const allRoutes = new Set<string>();
  let totalRows = 0;

  for (const observation of input.observations) {
    const month = assertIsoMonth(observation.month);
    const rowCount = finiteNonNegative(observation.rowCount, "rowCount");
    if (observation.sampleCount !== null) {
      finiteNonNegative(observation.sampleCount, "sampleCount");
    }
    const key = `${observation.sourceId}\u001f${observation.family}`;
    const normalized = { ...observation, month, rowCount };
    sourceGroups.set(key, [...(sourceGroups.get(key) ?? []), normalized]);
    monthGroups.set(month, [...(monthGroups.get(month) ?? []), normalized]);
    if (observation.routeId !== null) allRoutes.add(observation.routeId);
    totalRows += rowCount;
  }

  const sources = [...sourceGroups.entries()]
    .map(([key, observations]) => {
      const [sourceId, family] = key.split("\u001f") as [string, string];
      const months = new Set(observations.map((observation) => observation.month));
      const inWindowMonths = new Set(
        observations
          .map((observation) => observation.month)
          .filter((month) => inRequestedWindow(month, historyStartMonth, releaseMonth)),
      );
      const routes = new Set(
        observations
          .map((observation) => observation.routeId)
          .filter((routeId): routeId is string => routeId !== null),
      );
      const releaseRows = observations
        .filter((observation) => observation.month === releaseMonth)
        .reduce((sum, observation) => sum + observation.rowCount, 0);
      const releaseRoutes = new Set(
        observations
          .filter((observation) => observation.month === releaseMonth)
          .map((observation) => observation.routeId)
          .filter((routeId): routeId is string => routeId !== null),
      );
      const sampleValues = observations
        .map((observation) => observation.sampleCount)
        .filter((value): value is number => value !== null);
      const historicalMonthsBeforeRelease = [...months].filter(
        (month) => month >= historyStartMonth && month < releaseMonth,
      ).length;
      const requestedWindowCoverageShare = inWindowMonths.size / requestedWindowMonthCount;

      return {
        sourceId,
        family,
        firstMonth: [...months].sort()[0]!,
        lastMonth: [...months].sort().at(-1)!,
        monthCount: months.size,
        routeCount: routes.size,
        totalRows: observations.reduce((sum, observation) => sum + observation.rowCount, 0),
        totalSamples:
          sampleValues.length === 0 ? null : sampleValues.reduce((sum, value) => sum + value, 0),
        releaseMonthRows: releaseRows,
        releaseMonthRoutes: releaseRoutes.size,
        historicalMonthsBeforeRelease,
        requestedWindowMonthCount,
        requestedWindowCoverageShare,
        status: sourceStatus({
          monthCount: months.size,
          releaseMonthRows: releaseRows,
          historicalMonthsBeforeRelease,
          requestedWindowCoverageShare,
          inWindowMonthCount: inWindowMonths.size,
          minHistoricalMonths,
        }),
      } satisfies CorpusProfileSourceSummary;
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  const months = [...monthGroups.entries()]
    .map(([month, observations]) => {
      const sourcesPresent = new Set(
        observations.map((observation) => `${observation.sourceId}\u001f${observation.family}`),
      );
      const routes = new Set(
        observations
          .map((observation) => observation.routeId)
          .filter((routeId): routeId is string => routeId !== null),
      );
      const sampleValues = observations
        .map((observation) => observation.sampleCount)
        .filter((value): value is number => value !== null);
      return {
        month,
        sourceCount: sourcesPresent.size,
        routeCount: routes.size,
        totalRows: observations.reduce((sum, observation) => sum + observation.rowCount, 0),
        totalSamples:
          sampleValues.length === 0 ? null : sampleValues.reduce((sum, value) => sum + value, 0),
      } satisfies CorpusProfileMonthSummary;
    })
    .sort((left, right) => left.month.localeCompare(right.month));

  return {
    releaseMonth,
    historyStartMonth,
    requestedWindowMonthCount,
    summary: {
      sourceCount: sources.length,
      sourceFamilyCount: new Set(sources.map((source) => source.family)).size,
      routeCount: allRoutes.size,
      monthCount: new Set(input.observations.map((observation) => observation.month)).size,
      totalRows,
      historicalReadySourceCount: sources.filter(
        (source) =>
          source.status === "historical_ready" ||
          source.status === "historical_ready_missing_release",
      ).length,
      releaseOnlySourceCount: sources.filter((source) => source.status === "release_only").length,
      sparseSourceCount: sources.filter((source) => source.status === "sparse_history").length,
    },
    sources,
    months,
  };
}
