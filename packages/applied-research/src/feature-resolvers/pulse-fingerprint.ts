import type { PulseFingerprintSourceRow } from "../local-db/pulse-fingerprint-rows";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const PULSE_FINGERPRINT_V1_ID = "pulse_fingerprint_v1" as const;
export const ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID = "route_hour_of_week_pulse_panel_v1" as const;

export type PulseFingerprintSpec = {
  readonly panelId: typeof ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly minCellHistoryMonths: number;
  readonly minReleaseTripCount: number;
  readonly routeId?: string;
};

export type PulseFingerprintPattern =
  | "rush_hour_pulse"
  | "off_peak_pulse"
  | "weekend_pulse"
  | "worst_hour_of_week"
  | "flat_or_weak_signal";

export type PulseFingerprintRow = {
  readonly routeId: string;
  readonly direction: string;
  readonly month: string;
  readonly pattern: PulseFingerprintPattern;
  readonly reviewQuestion: string;
  readonly pulseCell: {
    readonly dayOfWeek: string;
    readonly hourOfDay: number;
  } | null;
  readonly speedResidualMph: number | null;
  readonly releaseSpeedMph: number | null;
  readonly baselineSpeedMph: number | null;
  readonly releaseTripCount: number | null;
  readonly releaseSegmentHourRows: number;
  readonly routeCellCount: number;
  readonly supportedCellCount: number;
  readonly cellHistoryMonthCount: number;
  readonly weeklyCycleStrengthMph: number | null;
  readonly evidence: {
    readonly primary: readonly string[];
    readonly counter: readonly string[];
    readonly caveats: readonly string[];
  };
  readonly reviewDisposition: "internal_lab";
  readonly publicClaimAllowed: false;
};

export type PulseFingerprintArtifactV1 = {
  readonly artifactKind: typeof PULSE_FINGERPRINT_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly panelSpec: PulseFingerprintSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly panelRowCount: number;
    readonly routeCount: number;
    readonly supportedPulseRowCount: number;
    readonly patternCounts: Record<string, number>;
    readonly publicClaimAllowedCount: 0;
  };
  readonly rows: readonly PulseFingerprintRow[];
};

type Point = {
  routeId: string;
  month: string;
  dayOfWeek: string;
  hourOfDay: number;
  direction: string;
  segmentHourRowCount: number;
  tripCount: number;
  averageSpeedMph: number | null;
};

type CandidateCell = {
  dayOfWeek: string;
  hourOfDay: number;
  speedResidualMph: number;
  releaseSpeedMph: number;
  baselineSpeedMph: number;
  releaseTripCount: number;
  releaseSegmentHourRows: number;
  cellHistoryMonthCount: number;
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function quantile(values: readonly number[], q: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index] ?? null;
}

function countValues(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function point(row: PulseFingerprintSourceRow): Point {
  return {
    routeId: row.route_id,
    month: row.month,
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    direction: row.direction,
    segmentHourRowCount: row.segment_hour_row_count,
    tripCount: row.trip_count,
    averageSpeedMph: numberValue(row.average_speed_mph),
  };
}

function cellKey(input: { dayOfWeek: string; hourOfDay: number }): string {
  return `${input.dayOfWeek}|${input.hourOfDay}`;
}

function routeDirectionKey(input: { routeId: string; direction: string }): string {
  return `${input.routeId}|${input.direction}`;
}

function isWeekend(dayOfWeek: string): boolean {
  return dayOfWeek.toLowerCase().startsWith("sat") || dayOfWeek.toLowerCase().startsWith("sun");
}

function isRushHour(hourOfDay: number): boolean {
  return (hourOfDay >= 6 && hourOfDay <= 9) || (hourOfDay >= 16 && hourOfDay <= 19);
}

function classify(cell: CandidateCell | null): PulseFingerprintPattern {
  if (cell === null || cell.speedResidualMph > -1) return "flat_or_weak_signal";
  if (isWeekend(cell.dayOfWeek)) return "weekend_pulse";
  if (isRushHour(cell.hourOfDay)) return "rush_hour_pulse";
  if (cell.hourOfDay >= 10 && cell.hourOfDay <= 15) return "off_peak_pulse";
  return "worst_hour_of_week";
}

function reviewQuestion(input: {
  routeId: string;
  direction: string;
  pattern: PulseFingerprintPattern;
  cell: CandidateCell | null;
}): string {
  if (input.cell === null || input.pattern === "flat_or_weak_signal") {
    return `No strong recurring hour-of-week speed pulse fired for ${input.routeId} ${input.direction}.`;
  }
  const when = `${input.cell.dayOfWeek} ${input.cell.hourOfDay}:00`;
  if (input.pattern === "weekend_pulse") return `Why does ${input.routeId} ${input.direction} dip on ${when}?`;
  if (input.pattern === "off_peak_pulse") {
    return `Why does ${input.routeId} ${input.direction} show an off-peak speed dip on ${when}?`;
  }
  if (input.pattern === "rush_hour_pulse") {
    return `Is ${input.routeId} ${input.direction}'s ${when} dip normal rush pressure or a specific recurring constraint?`;
  }
  return `What recurring condition explains ${input.routeId} ${input.direction}'s ${when} speed pulse?`;
}

function evidence(input: {
  cell: CandidateCell | null;
  weeklyCycleStrengthMph: number | null;
  routeCellCount: number;
  supportedCellCount: number;
}): PulseFingerprintRow["evidence"] {
  const caveats = [
    "Pulse fingerprints are internal lab hypotheses, not public findings.",
    "The artifact compares release-month hour-of-week speed with prior-month medians for the same route-direction cell.",
    "This aggregate data can identify recurring timing patterns but not the external cause.",
  ];
  if (input.cell === null) caveats.push("No hour-of-week cell had enough historical support for a strong pulse.");
  return {
    primary:
      input.cell === null
        ? ["pulse_cell=missing", "speed_residual_mph=missing"]
        : [
            `pulse_cell=${input.cell.dayOfWeek}_${input.cell.hourOfDay}`,
            `speed_residual_mph=${input.cell.speedResidualMph}`,
            `release_speed_mph=${input.cell.releaseSpeedMph}`,
            `baseline_speed_mph=${input.cell.baselineSpeedMph}`,
          ],
    counter: [
      `weekly_cycle_strength_mph=${input.weeklyCycleStrengthMph ?? "missing"}`,
      `supported_cell_count=${input.supportedCellCount}`,
      `route_cell_count=${input.routeCellCount}`,
    ],
    caveats,
  };
}

export function pulseFingerprintPanelSpecV1(input: PulseFingerprintSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + direction + release_month",
    timeKey: "release_month",
    entityKeys: ["route_id", "direction"],
    measures: [
      "speed_residual_mph",
      "release_speed_mph",
      "baseline_speed_mph",
      "weekly_cycle_strength_mph",
      "release_trip_count",
    ],
    joins: ["local_route_segment_speed"],
    coverage: ["route_cell_count", "supported_cell_count", "cell_history_month_count"],
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    },
    releaseFilter: { month: input.releaseMonth },
    requiredProducts: [
      {
        productId: "local_route_segment_speed_history",
        state: "available",
        role: "source",
        reason: "Provides route-direction hour-of-week speed cells by month.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "minimum_cell_history_months",
        description: "Each pulse cell needs enough prior months for release-versus-history comparison.",
        threshold: input.minCellHistoryMonths,
      },
      {
        ruleId: "minimum_release_trip_count",
        description: "Each pulse cell needs enough release-month trips to avoid overnight or tiny-sample artifacts.",
        threshold: input.minReleaseTripCount,
      },
    ],
    negativeMeaning:
      "A flat-or-weak-signal row means no configured hour-of-week pulse fired; it does not rule out date-specific events or non-speed causes.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

export function buildPulseFingerprintArtifactV1(input: {
  readonly rows: readonly PulseFingerprintSourceRow[];
  readonly spec: PulseFingerprintSpec;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): PulseFingerprintArtifactV1 {
  const byRouteDirection = new Map<string, Point[]>();
  for (const raw of input.rows) {
    const next = point(raw);
    if (next.month < input.spec.historyStartMonth || next.month > input.spec.releaseMonth) continue;
    if (input.spec.routeId !== undefined && next.routeId !== input.spec.routeId) continue;
    const key = routeDirectionKey(next);
    const current = byRouteDirection.get(key) ?? [];
    current.push(next);
    byRouteDirection.set(key, current);
  }

  const rows: PulseFingerprintRow[] = [];
  for (const [key, points] of [...byRouteDirection.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const [routeId, direction] = key.split("|");
    if (routeId === undefined || direction === undefined) continue;
    const releasePoints = points.filter((candidate) => candidate.month === input.spec.releaseMonth);
    if (releasePoints.length === 0) continue;
    const history = points.filter((candidate) => candidate.month < input.spec.releaseMonth);
    const historyByCell = new Map<string, Point[]>();
    for (const candidate of history) {
      const current = historyByCell.get(cellKey(candidate)) ?? [];
      current.push(candidate);
      historyByCell.set(cellKey(candidate), current);
    }

    const cells: CandidateCell[] = [];
    for (const release of releasePoints) {
      if (release.averageSpeedMph === null) continue;
      if (release.tripCount < input.spec.minReleaseTripCount) continue;
      const cellHistory = historyByCell.get(cellKey(release)) ?? [];
      const historicalSpeeds = cellHistory
        .map((candidate) => candidate.averageSpeedMph)
        .filter((value): value is number => value !== null);
      if (historicalSpeeds.length < input.spec.minCellHistoryMonths) continue;
      const baseline = median(historicalSpeeds);
      if (baseline === null) continue;
      cells.push({
        dayOfWeek: release.dayOfWeek,
        hourOfDay: release.hourOfDay,
        speedResidualMph: round(release.averageSpeedMph - baseline),
        releaseSpeedMph: round(release.averageSpeedMph),
        baselineSpeedMph: round(baseline),
        releaseTripCount: release.tripCount,
        releaseSegmentHourRows: release.segmentHourRowCount,
        cellHistoryMonthCount: historicalSpeeds.length,
      });
    }

    const worstCell =
      cells.length === 0
        ? null
        : [...cells].sort(
            (left, right) =>
              left.speedResidualMph - right.speedResidualMph ||
              right.releaseTripCount - left.releaseTripCount ||
              left.dayOfWeek.localeCompare(right.dayOfWeek) ||
              left.hourOfDay - right.hourOfDay,
          )[0] ?? null;
    const releaseSpeeds = releasePoints
      .map((candidate) => candidate.averageSpeedMph)
      .filter((value): value is number => value !== null);
    const p90 = quantile(releaseSpeeds, 0.9);
    const p10 = quantile(releaseSpeeds, 0.1);
    const weeklyCycleStrengthMph = p90 === null || p10 === null ? null : round(p90 - p10);
    const pattern = classify(worstCell);
    rows.push({
      routeId,
      direction,
      month: input.spec.releaseMonth,
      pattern,
      reviewQuestion: reviewQuestion({ routeId, direction, pattern, cell: worstCell }),
      pulseCell:
        worstCell === null
          ? null
          : { dayOfWeek: worstCell.dayOfWeek, hourOfDay: worstCell.hourOfDay },
      speedResidualMph: worstCell?.speedResidualMph ?? null,
      releaseSpeedMph: worstCell?.releaseSpeedMph ?? null,
      baselineSpeedMph: worstCell?.baselineSpeedMph ?? null,
      releaseTripCount: worstCell?.releaseTripCount ?? null,
      releaseSegmentHourRows: worstCell?.releaseSegmentHourRows ?? 0,
      routeCellCount: releasePoints.length,
      supportedCellCount: cells.length,
      cellHistoryMonthCount: worstCell?.cellHistoryMonthCount ?? 0,
      weeklyCycleStrengthMph,
      evidence: evidence({
        cell: worstCell,
        weeklyCycleStrengthMph,
        routeCellCount: releasePoints.length,
        supportedCellCount: cells.length,
      }),
      reviewDisposition: "internal_lab",
      publicClaimAllowed: false,
    });
  }

  const panelManifest: PanelManifest = {
    panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: pulseFingerprintPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "local_table",
        refId: "local_route_segment_speed",
        role: "route_direction_hour_of_week_speed_history",
        path: "data/local/pipeline.sqlite",
      },
    ],
    summary: {
      sourceRowCount: input.rows.length,
      supportedRowCount: rows.filter((row) => row.pattern !== "flat_or_weak_signal").length,
      panelRowCount: rows.length,
      routeCount: new Set(rows.map((row) => row.routeId)).size,
      entityCount: rows.length,
      monthCount: rows.length > 0 ? 1 : 0,
    },
    limitations: [
      "This is a route-direction internal lab pattern artifact, not a public finding surface.",
      "Hour-of-week fingerprints are descriptive release-versus-history comparisons, not causal estimates.",
      "The source is monthly aggregate route segment speed, so date-specific pulses and external causes require additional event/source joins.",
    ],
  };

  return {
    artifactKind: PULSE_FINGERPRINT_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    releaseMonth: input.spec.releaseMonth,
    historyWindow: {
      startMonth: input.spec.historyStartMonth,
      endMonth: input.spec.releaseMonth,
    },
    panelSpec: input.spec,
    panelManifest,
    summary: {
      panelRowCount: rows.length,
      routeCount: new Set(rows.map((row) => row.routeId)).size,
      supportedPulseRowCount: rows.filter((row) => row.pattern !== "flat_or_weak_signal").length,
      patternCounts: countValues(rows.map((row) => row.pattern)),
      publicClaimAllowedCount: 0,
    },
    rows,
  };
}
