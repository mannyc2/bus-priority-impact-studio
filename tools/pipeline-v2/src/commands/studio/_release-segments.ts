import {
  type StudioAiAnalystNote,
  StudioAiAnalystNoteSchema,
  type StudioAiPublicNote,
  StudioAiPublicNoteSchema,
  type StudioRouteSegmentEvidence,
} from "@bp/domain/studio/segment-evidence";
import { complete } from "@earendil-works/pi-ai";
import { openRouterModel } from "../../lib/llm.ts";
import {
  tspMatchMethodForSegment,
  tspStatusForSegment,
  unavailableLaneOverlap,
  unknownTspEvidence,
} from "./_release-geometry.ts";
import type {
  RouteBriefInputArtifact,
  RouteBriefScheduleComparison,
  RouteBriefTopSegment,
  SegmentLaneOverlap,
  SegmentNoteLlmOptions,
  StudioSegment,
  TspEvidence,
} from "./_release-types.ts";

export function comparisonBySegmentId(artifact: RouteBriefInputArtifact | null) {
  return new Map(
    (artifact?.scheduleComparisons ?? []).map((comparison) => [comparison.segmentId, comparison]),
  );
}

function isFiniteNumberValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumberValue(value) && value > 0;
}

export function segmentsForRoute(
  routeId: string,
  artifact: RouteBriefInputArtifact | null,
): RouteBriefTopSegment[] {
  const segments = artifact?.segments ?? artifact?.topSegments ?? [];
  if (segments.length === 0) {
    throw new Error(
      `Missing route-brief segment universe for ${routeId}; hard cutover forbids empty segment projections.`,
    );
  }
  return segments;
}

function scheduledSpeedFrom(
  segment: RouteBriefTopSegment,
  comparison: RouteBriefScheduleComparison | undefined,
): number | null {
  const distanceMiles = segment.averageRoadDistanceMiles;
  const scheduledMinutes = comparison?.scheduledMedianTravelTimeMinutes;
  if (!isPositiveFiniteNumber(distanceMiles) || !isPositiveFiniteNumber(scheduledMinutes)) {
    return null;
  }
  return (distanceMiles / scheduledMinutes) * 60;
}

export function requireScheduledSpeedFrom(
  routeId: string,
  segment: RouteBriefTopSegment,
  comparison: RouteBriefScheduleComparison | undefined,
): number {
  const scheduledSpeedMph = scheduledSpeedFrom(segment, comparison);
  if (scheduledSpeedMph === null) {
    throw new Error(
      `Missing complete scheduled travel-time evidence for ${routeId} segment ${segment.segmentId}; no observed-speed multiplier fallback is allowed.`,
    );
  }
  return scheduledSpeedMph;
}

export function riderDelayHours(
  routeId: string,
  segment: RouteBriefTopSegment,
  comparison: RouteBriefScheduleComparison | undefined,
): number {
  const delayMinutes = comparison?.observedMinusScheduledMinutes;
  const exposure = segment.ridershipExposure;
  if (!isFiniteNumberValue(delayMinutes)) {
    throw new Error(
      `Missing observed-minus-scheduled travel-time evidence for ${routeId} segment ${segment.segmentId}; route-slice delay exposure cannot be synthesized.`,
    );
  }
  if (!isFiniteNumberValue(exposure) || exposure < 0) {
    throw new Error(
      `Missing ridership exposure for ${routeId} segment ${segment.segmentId}; route-slice delay exposure cannot be synthesized.`,
    );
  }
  if (delayMinutes <= 0 || exposure === 0) {
    return 0;
  }
  return (delayMinutes * exposure) / 60;
}

export function routeRiderDelayHours(
  routeId: string,
  artifact: RouteBriefInputArtifact | null,
): number {
  const comparisons = comparisonBySegmentId(artifact);
  return Math.round(
    segmentsForRoute(routeId, artifact).reduce(
      (sum, segment) => sum + riderDelayHours(routeId, segment, comparisons.get(segment.segmentId)),
      0,
    ),
  );
}

export function routeScheduledSpeedMph(
  routeId: string,
  artifact: RouteBriefInputArtifact | null,
): number {
  const comparisons = comparisonBySegmentId(artifact);
  let distanceMiles = 0;
  let scheduledMinutes = 0;

  for (const segment of segmentsForRoute(routeId, artifact)) {
    const distance = segment.averageRoadDistanceMiles;
    const comparison = comparisons.get(segment.segmentId);
    const scheduled = comparison?.scheduledMedianTravelTimeMinutes;
    if (isPositiveFiniteNumber(distance) && isPositiveFiniteNumber(scheduled)) {
      distanceMiles += distance;
      scheduledMinutes += scheduled;
    } else {
      throw new Error(
        `Missing complete scheduled travel-time evidence for ${routeId} segment ${segment.segmentId}; route scheduled speed cannot fall back to observed speed.`,
      );
    }
  }

  if (distanceMiles > 0 && scheduledMinutes > 0) {
    return Number(((distanceMiles / scheduledMinutes) * 60).toFixed(1));
  }

  throw new Error(
    `Missing scheduled travel-time evidence for ${routeId}; route scheduled speed cannot be synthesized.`,
  );
}

export function normalizedHourlyBins(bins: number[] | undefined): number[] {
  if (bins === undefined) {
    return Array.from({ length: 24 }, () => 0);
  }
  return Array.from({ length: 24 }, (_, index) => {
    const value = bins[index] ?? 0;
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Number(Math.max(0, Math.min(1, value)).toFixed(4));
  });
}

function routeDirection(value: string | undefined): StudioSegment["direction"] {
  if (value === "N") return "NB";
  if (value === "S") return "SB";
  if (value === "E") return "EB";
  if (value === "W") return "WB";
  return "NB";
}

export function buildSegments(
  routeSlug: string,
  routeId: string,
  artifact: RouteBriefInputArtifact | null,
  laneOverlaps: ReadonlyMap<string, SegmentLaneOverlap> = new Map(),
  tspEvidence: TspEvidence = unknownTspEvidence(),
): StudioSegment[] {
  const comparisons = comparisonBySegmentId(artifact);
  return segmentsForRoute(routeId, artifact).map((segment, index) => {
    const comparison = comparisons.get(segment.segmentId);
    const scheduledSpeedMph = requireScheduledSpeedFrom(routeId, segment, comparison);
    const laneOverlap = laneOverlaps.get(segment.segmentId) ?? unavailableLaneOverlap();
    const tspStatus = tspStatusForSegment(segment, tspEvidence);
    const tspMatchMethod = tspMatchMethodForSegment(segment, tspEvidence);
    const from = segment.from ?? `Segment ${index + 1}`;
    const to = segment.to ?? "Next timepoint";
    const speedMph = Number((segment.weightedAverageSpeedMph ?? 0).toFixed(1));
    const riderHours = Math.round(riderDelayHours(routeId, segment, comparison));
    const hours = normalizedHourlyBins(segment.hourlySlowWindowBins);
    const ace =
      routeId.includes("+") &&
      (artifact?.interventionStatus?.aceActiveDuringAnalysisPeriod ?? false);
    const flagged = (segment.slowWindowPercent ?? 0) >= 60;
    return {
      id: segment.segmentId,
      routeSlug,
      direction: routeDirection(segment.direction),
      from,
      to,
      speedMph,
      scheduledMph: Number(scheduledSpeedMph.toFixed(1)),
      riderHours,
      lane: laneOverlap.lane,
      laneSource: laneOverlap.laneSource,
      laneOverlapShare: laneOverlap.laneOverlapShare,
      laneMatchedCount: laneOverlap.laneMatchedCount,
      laneTypes: laneOverlap.laneTypes,
      laneOperatingHours: laneOverlap.laneOperatingHours,
      laneOperatingDays: laneOverlap.laneOperatingDays,
      segmentGeometrySource:
        laneOverlap.segmentGeometry === null
          ? "geometry_unavailable"
          : "mta_route_shape_timepoint_slice",
      segmentGeometryMethod:
        laneOverlap.segmentGeometry === null
          ? "geometry_unavailable"
          : "timepoint_stop_projection_to_route_shape",
      segmentGeometry: laneOverlap.segmentGeometry,
      ace,
      tspStatus,
      tspSource: tspEvidence.tspSource,
      tspSourceDate: tspEvidence.tspSourceDate,
      tspSourceUrl: tspEvidence.tspSourceUrl,
      tspCorridor: tspEvidence.tspCorridor,
      tspMatchMethod,
      hours,
      miles: segment.averageRoadDistanceMiles,
      flagged,
    };
  });
}

export function buildRouteSegmentEvidence(
  routeSlug: string,
  routeId: string,
  month: string,
  artifact: RouteBriefInputArtifact | null,
  laneOverlaps: ReadonlyMap<string, SegmentLaneOverlap> = new Map(),
  tspEvidence: TspEvidence = unknownTspEvidence(),
): StudioRouteSegmentEvidence[] {
  const comparisons = comparisonBySegmentId(artifact);
  return segmentsForRoute(routeId, artifact).map((segment, index) => {
    const comparison = comparisons.get(segment.segmentId);
    const scheduledSpeedMph = requireScheduledSpeedFrom(routeId, segment, comparison);
    const laneOverlap = laneOverlaps.get(segment.segmentId) ?? unavailableLaneOverlap();
    const tspStatus = tspStatusForSegment(segment, tspEvidence);
    const tspMatchMethod = tspMatchMethodForSegment(segment, tspEvidence);
    return {
      id: segment.segmentId,
      routeSlug,
      routeId,
      month,
      direction: routeDirection(segment.direction),
      from: segment.from ?? `Segment ${index + 1}`,
      to: segment.to ?? "Next timepoint",
      stopOrder: segment.stopOrder ?? null,
      observedSpeedMph: segment.weightedAverageSpeedMph ?? comparison?.observedSpeedMph ?? null,
      observedTravelTimeMinutes:
        segment.weightedAverageTravelTimeMinutes ?? comparison?.observedTravelTimeMinutes ?? null,
      scheduledMedianTravelTimeMinutes: comparison?.scheduledMedianTravelTimeMinutes ?? null,
      scheduledSpeedMph,
      observedMinusScheduledMinutes: comparison?.observedMinusScheduledMinutes ?? null,
      scheduledSampleCount: comparison?.scheduledSampleCount ?? null,
      observedBusTripCount: comparison?.observedBusTripCount ?? segment.busTripCount ?? null,
      observationCount: segment.observationCount ?? null,
      slowWindowPercent: segment.slowWindowPercent ?? null,
      averageRoadDistanceMiles: segment.averageRoadDistanceMiles ?? null,
      segmentGeometrySource:
        laneOverlap.segmentGeometry === null
          ? "geometry_unavailable"
          : "mta_route_shape_timepoint_slice",
      segmentGeometryMethod:
        laneOverlap.segmentGeometry === null
          ? "geometry_unavailable"
          : "timepoint_stop_projection_to_route_shape",
      segmentGeometry: laneOverlap.segmentGeometry,
      ridershipExposure: segment.ridershipExposure ?? null,
      riderDelayHours: Math.round(riderDelayHours(routeId, segment, comparison)),
      hourlyPassengerDelay: segment.hourlyPassengerDelay ?? [],
      stopBoardings: segment.stopBoardings ?? null,
      segmentBoardings: segment.segmentBoardings ?? null,
      lane: laneOverlap.lane,
      laneSource:
        laneOverlap.laneSource === "dot_bus_lanes_geometry"
          ? "dot_bus_lanes_geometry"
          : "geometry_unavailable",
      laneOverlapShare: laneOverlap.laneOverlapShare,
      laneMatchedCount: laneOverlap.laneMatchedCount,
      laneTypes: laneOverlap.laneTypes,
      laneOperatingHours: laneOverlap.laneOperatingHours,
      laneOperatingDays: laneOverlap.laneOperatingDays,
      tspStatus,
      tspSource: tspEvidence.tspSource,
      tspSourceDate: tspEvidence.tspSourceDate,
      tspSourceUrl: tspEvidence.tspSourceUrl,
      tspCorridor: tspEvidence.tspCorridor,
      tspMatchMethod,
      hotspotScore: segment.hotspotScore ?? comparison?.hotspotScore ?? null,
      riderImpactScore: segment.riderImpactScore ?? comparison?.riderImpactScore ?? null,
    };
  });
}

// ---- deterministic + LLM segment notes ----

export function buildSegmentAnalystNote(input: StudioSegment): StudioAiAnalystNote {
  const speedGap = Number(Math.max(0, input.scheduledMph - input.speedMph).toFixed(1));
  const laneText = segmentNoteLaneText(input);
  const tspText = segmentNoteTspText(input);
  const peakText = segmentNotePeakText(input.hours);
  const exposureText = `${input.riderHours.toLocaleString()} hours of route-slice delay exposure`;
  const gapText =
    speedGap > 0
      ? `${speedGap.toFixed(1)} mph below schedule`
      : "at or above the schedule-implied speed";
  const caveats = [
    "This is a route-slice hotspot segment, not a complete stop-to-stop universe.",
    "Delay exposure uses monthly route/hour ridership exposure, not service-day or stop-level boardings.",
  ];
  const blockedClaims = [
    "Do not describe riderHours as full-route or per-day passenger delay.",
    "Do not treat bus-lane overlap as regulatory lane mileage or proof of operating-hour coverage.",
    "Do not infer current intersection-level TSP equipment from the dated source-status snapshot.",
  ];
  if (input.ace) {
    blockedClaims.push("Do not credit ACE without a detector-side before/after control.");
  }
  const nextChecks = [
    input.lane === "yes"
      ? "Verify the matched lane pieces cover the slow blocks and operating hours."
      : "Inspect whether missing or discontinuous bus-lane coverage lines up with the slow blocks.",
    input.tspStatus === "installed"
      ? "Confirm current intersection-level TSP geometry and activation status."
      : "Check newer DOT/MTA signal-priority sources before treating TSP as absent.",
    input.ace
      ? "Compare ACE violation trends against the slowdown before crediting cameras."
      : "Check whether enforcement geography touches the segment before treating ACE as a gap.",
  ];
  const primaryEvidence: StudioAiAnalystNote["primaryEvidence"] = [
    "observed_vs_scheduled_speed",
    "route_slice_delay_exposure",
    "slow_window_hours",
    "tsp_source_status",
  ];
  if (input.laneSource === "dot_bus_lanes_geometry") {
    primaryEvidence.push("dot_bus_lane_geometry");
  }
  if (input.ace) {
    primaryEvidence.push("ace_route_program");
  }

  return StudioAiAnalystNoteSchema.parse({
    generationMode: "deterministic_evidence_summary",
    headline:
      speedGap > 0
        ? `${speedGap.toFixed(1)} mph speed gap with ${laneText.short}`
        : `Rider exposure with ${laneText.short}`,
    body: `${input.from} to ${input.to} should stay on the review shortlist: observed speed is ${gapText} and the segment contributes ${exposureText}. The treatment picture is ${laneText.long}; ${tspText}. ${peakText}`,
    primaryEvidence,
    caveats,
    nextChecks,
    blockedClaims,
    confidence: input.riderHours > 0 && input.hours.some((hour) => hour >= 0.5) ? "medium" : "low",
  });
}

function segmentNoteLaneText(input: StudioSegment): { short: string; long: string } {
  const percent = `${Math.round(input.laneOverlapShare * 100)}%`;
  if (input.lane === "yes") {
    return {
      short: "strong bus-lane overlap",
      long: `${percent} matched bus-lane overlap across ${input.laneMatchedCount} DOT lane pieces`,
    };
  }
  if (input.lane === "partial") {
    return {
      short: "partial bus-lane overlap",
      long: `${percent} matched bus-lane overlap, so continuity should be checked before assuming protection`,
    };
  }
  if (input.lane === "minimal") {
    return {
      short: "minimal bus-lane evidence",
      long: `${percent} matched bus-lane overlap, which points to a likely treatment-continuity gap`,
    };
  }
  return {
    short: "no matched bus-lane evidence",
    long: "no matched DOT bus-lane geometry in the segment slice",
  };
}

function segmentNoteTspText(input: StudioSegment): string {
  if (input.tspStatus === "installed") {
    const sourceDate = input.tspSourceDate ?? "dated";
    const corridor = input.tspCorridor ?? "matched corridor";
    return `TSP has a ${sourceDate} source-status match for ${corridor} via ${input.tspMatchMethod.replaceAll("_", " ")}`;
  }
  if (input.tspStatus === "candidate") {
    return "TSP is only a candidate in the ingested source-status evidence";
  }
  if (input.tspSource === "nyc_dot_tsp_status_2017") {
    return "TSP is known only at route/source status here, with no positive segment endpoint match";
  }
  return "TSP is unknown because there is no positive match in ingested TSP sources";
}

function segmentNotePeakText(hours: readonly number[]): string {
  const peakHours = hours
    .map((value, hour) => ({ hour, value }))
    .filter((entry) => entry.value >= 0.5)
    .toSorted((left, right) => right.value - left.value || left.hour - right.hour)
    .slice(0, 3)
    .map((entry) => `${String(entry.hour).padStart(2, "0")}:00`);
  if (peakHours.length === 0) {
    return "No hour crosses the 50% slow-window threshold, so review should focus on exposure and source gaps.";
  }
  return `The strongest slow-window hours are ${peakHours.join(", ")}, which makes the next check time-specific rather than corridor-generic.`;
}

function parseLlmJson(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced?.[1] !== undefined) return JSON.parse(fenced[1]);
  }
  return JSON.parse(trimmed);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function segmentSpeedGap(segment: StudioSegment): number {
  return Number(Math.max(0, segment.scheduledMph - segment.speedMph).toFixed(1));
}

function studioSegmentNoteSource(month: string): string {
  return `MTA Bus Speeds + MTA Hourly Ridership · segment-level route slice · ${formatMonthLabel(month)}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthValue] = month.split("-");
  const index = Number(monthValue) - 1;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[index] ?? monthValue} ${year}`;
}

function quantile(values: readonly number[], q: number): number {
  const sorted = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
}

function buildSegmentPublicNote(segment: StudioSegment, month: string): StudioAiPublicNote {
  const gap = segmentSpeedGap(segment);
  const body =
    gap > 0
      ? `In ${formatMonthLabel(month)}, ${segment.from} to ${segment.to} ran ${gap.toFixed(1)} mph below its schedule-implied speed in the segment-level route slice.`
      : `In ${formatMonthLabel(month)}, ${segment.from} to ${segment.to} carried ${segment.riderHours.toLocaleString()} hours of route-slice delay exposure.`;
  return {
    generationMode: "evidence_bound",
    body,
    source: studioSegmentNoteSource(month),
  };
}

function routePublicNoteLimit(segmentCount: number): number {
  return Math.max(1, Math.floor(segmentCount * 0.3));
}

function shouldConsiderPublicSegmentNote(
  segment: StudioSegment,
  gapThreshold: number,
  riderHoursThreshold: number,
): boolean {
  const gap = segmentSpeedGap(segment);
  const worstGapQuartile = gap > 0 && gap >= gapThreshold;
  const treatmentGapMismatch =
    (segment.lane === "yes" || segment.lane === "partial") && worstGapQuartile;
  const unlanedHighExposure =
    (segment.lane === "none" || segment.lane === "minimal") &&
    segment.riderHours > 0 &&
    segment.riderHours >= riderHoursThreshold;
  return worstGapQuartile || treatmentGapMismatch || unlanedHighExposure;
}

export function withSparsePublicSegmentNotes(
  segments: readonly StudioSegment[],
  month: string,
): StudioSegment[] {
  const byRoute = new Map<string, StudioSegment[]>();
  for (const segment of segments) {
    byRoute.set(segment.routeSlug, [...(byRoute.get(segment.routeSlug) ?? []), segment]);
  }

  const publicNoteBySegmentId = new Map<string, StudioAiPublicNote>();
  for (const routeSegments of byRoute.values()) {
    const gapThreshold = quantile(routeSegments.map(segmentSpeedGap), 0.75);
    const riderHoursThreshold = quantile(
      routeSegments.map((segment) => segment.riderHours),
      0.9,
    );
    const selected = routeSegments
      .filter((segment) =>
        shouldConsiderPublicSegmentNote(segment, gapThreshold, riderHoursThreshold),
      )
      .toSorted((left, right) => {
        const leftScore = segmentSpeedGap(left) * Math.log1p(left.riderHours);
        const rightScore = segmentSpeedGap(right) * Math.log1p(right.riderHours);
        return rightScore - leftScore || right.riderHours - left.riderHours;
      })
      .slice(0, routePublicNoteLimit(routeSegments.length));
    for (const segment of selected) {
      publicNoteBySegmentId.set(segment.id, buildSegmentPublicNote(segment, month));
    }
  }

  return segments.map((segment) => {
    const aiNote = publicNoteBySegmentId.get(segment.id);
    return aiNote === undefined ? segment : { ...segment, aiNote };
  });
}

function sentenceCount(value: string): number {
  return value
    .replace(/(\d)\.(\d)/g, "$1·$2")
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}

function validateUsefulLlmSegmentNote(segment: StudioSegment, note: StudioAiPublicNote): void {
  const issues: string[] = [];
  if (note.generationMode !== "llm_assisted_evidence_summary") {
    issues.push("generationMode must be llm_assisted_evidence_summary");
  }
  if (
    segment.aiNote !== undefined &&
    normalizeText(note.body) === normalizeText(segment.aiNote.body)
  ) {
    issues.push("body matches the deterministic scaffold");
  }
  if (/\bslows? to\b/.test(normalizeText(note.body))) {
    issues.push("body looks like the retired speed-template phrasing");
  }
  if (wordCount(note.body) < 12 || wordCount(note.body) > 55) {
    issues.push("body must be one compact public claim");
  }
  if (sentenceCount(note.body) > 1) {
    issues.push("body must contain only one claim sentence");
  }
  if (/\b(check|verify|inspect|do not|analyst|triage|should|warrants)\b/i.test(note.body)) {
    issues.push("body contains analyst-workflow or instruction language");
  }
  if (!note.body.includes(segment.from) || !note.body.includes(segment.to)) {
    issues.push("body must identify the segment endpoints");
  }
  if (note.source !== segment.aiNote?.source) {
    issues.push("source must match the deterministic source line");
  }

  if (issues.length > 0) {
    throw new Error(
      `LLM segment note for ${segment.id} failed usefulness checks: ${issues.join("; ")}`,
    );
  }
}

export function applyStudioLlmSegmentNoteOutput(
  segment: StudioSegment,
  content: string,
): StudioAiPublicNote {
  const parsed = parseLlmJson(content);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`LLM segment note for ${segment.id} was not a JSON object.`);
  }
  const shape = parsed as Record<string, unknown>;
  const note = StudioAiPublicNoteSchema.parse({
    ...shape,
    generationMode: "llm_assisted_evidence_summary",
  });
  validateUsefulLlmSegmentNote(segment, note);
  return note;
}

function buildSegmentNoteLlmPrompt(segment: StudioSegment, previousError?: string): string {
  if (segment.aiNote === undefined) {
    throw new Error(`Cannot author an LLM note for ${segment.id} without a public note scaffold.`);
  }
  return JSON.stringify(
    {
      task: "Rewrite one sparse public AI note for a Bus Priority Impact Studio slow segment.",
      output: {
        body: "one public-facing sentence containing one defensible claim",
        source: segment.aiNote.source,
      },
      rules: [
        "Return JSON only. Do not include markdown.",
        "Return only body and source; no headline, caveats, next checks, blocked claims, evidence badges, or recommendations.",
        "The body must be one sentence and one claim.",
        "The source must exactly match the provided source string.",
        "Use only the provided facts and source statuses.",
        "Do not tell the reader what to do.",
        "Do not use the words check, verify, inspect, should, triage, analyst, or do not.",
        "Do not invent current TSP intersection geometry, regulatory lane mileage, full-route delay, per-day delay, causality, or agency endorsement.",
      ],
      repair: previousError
        ? {
            previousOutputRejectedBecause: previousError,
            instruction:
              "Return a corrected JSON object that satisfies the public note schema and single-claim rule.",
          }
        : undefined,
      segment: {
        id: segment.id,
        routeSlug: segment.routeSlug,
        direction: segment.direction,
        from: segment.from,
        to: segment.to,
        speedMph: segment.speedMph,
        scheduledMph: segment.scheduledMph,
        riderHours: segment.riderHours,
        lane: segment.lane,
        laneSource: segment.laneSource,
        laneOverlapShare: segment.laneOverlapShare,
        laneMatchedCount: segment.laneMatchedCount,
        laneTypes: segment.laneTypes,
        laneOperatingHours: segment.laneOperatingHours,
        laneOperatingDays: segment.laneOperatingDays,
        ace: segment.ace,
        tspStatus: segment.tspStatus,
        tspSource: segment.tspSource,
        tspSourceDate: segment.tspSourceDate,
        tspCorridor: segment.tspCorridor,
        tspMatchMethod: segment.tspMatchMethod,
        slowWindowHours: segment.hours
          .map((value, hour) => ({ hour, value }))
          .filter((entry) => entry.value >= 0.5),
        flagged: segment.flagged ?? false,
        deterministicPublicNote: segment.aiNote,
      },
    },
    null,
    2,
  );
}

async function callOpenRouterSegmentNote(input: {
  segment: StudioSegment;
  options: SegmentNoteLlmOptions;
}): Promise<StudioAiPublicNote> {
  if (input.options.apiKey === undefined || input.options.apiKey.trim().length === 0) {
    throw new Error("OPENROUTER_API_KEY is required for --segment-note-llm.");
  }

  const model = openRouterModel(input.options.model);
  let previousError: string | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= input.options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.options.timeoutMs);
    try {
      const result = await complete(
        model,
        {
          systemPrompt:
            "You write evidence-bounded public transit analysis notes. You improve analyst usefulness without inventing facts or causal claims.",
          messages: [
            {
              role: "user",
              content: buildSegmentNoteLlmPrompt(input.segment, previousError),
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: input.options.apiKey,
          signal: controller.signal,
          maxOutputTokens: input.options.maxTokens,
          providerOptions: { response_format: { type: "json_object" }, temperature: 0.2 },
        },
      );
      const text = result.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text.trim().length === 0) {
        throw new Error(`LLM segment note for ${input.segment.id} returned no text content.`);
      }
      return applyStudioLlmSegmentNoteOutput(input.segment, text);
    } catch (error) {
      const resolvedError = controller.signal.aborted
        ? new Error(
            `OpenRouter segment-note request timed out after ${input.options.timeoutMs}ms for ${input.options.model}.`,
          )
        : error;
      lastError = resolvedError;
      if (attempt >= input.options.maxAttempts) {
        throw resolvedError;
      }
      previousError = describeLlmAttemptError(resolvedError);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`LLM segment note for ${input.segment.id} failed without a readable error.`);
}

function describeLlmAttemptError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 600 ? `${message.slice(0, 600)}...` : message;
}

export async function enhanceSegmentAiNotesWithLlm(
  segments: readonly StudioSegment[],
  options: SegmentNoteLlmOptions,
): Promise<StudioSegment[]> {
  if (!options.enabled) return [...segments];

  const selectedIds = new Set(
    segments
      .filter((segment) => segment.aiNote !== undefined)
      .slice(0, options.limit === null ? undefined : options.limit)
      .map((segment) => segment.id),
  );
  const output: StudioSegment[] = [];
  for (const segment of segments) {
    if (!selectedIds.has(segment.id)) {
      output.push(segment);
      continue;
    }
    try {
      const aiNote = await callOpenRouterSegmentNote({ segment, options });
      output.push({ ...segment, aiNote });
    } catch {
      const { aiNote: _dropped, ...withoutNote } = segment;
      output.push(withoutNote);
    }
  }
  return output;
}
