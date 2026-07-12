import { describe, expect, test } from "bun:test";
import {
  aggregateStudyPanel,
  bootstrapSegmentDid,
  eligibleSegmentSeries,
  estimateMatchedDid,
  estimateStudy,
  matchStudyControls,
  monthlyMatchedDifferences,
  mulberry32,
  placeboInTimeGate,
  preTrendGate,
  type StudyPanelCell,
  type StudySpeedSourceRow,
  segmentSeries,
  studyDirection,
  studyWindowMonths,
} from "../../src/lib/study-engine/index.ts";

function sourceRow(input: {
  routeId?: string;
  month: string;
  stopOrder?: number;
  hourOfDay: number;
  speed: number;
  trips: number;
}): StudySpeedSourceRow {
  return {
    routeId: input.routeId ?? "M15",
    month: input.month,
    direction: "N",
    stopOrder: input.stopOrder ?? 1,
    fromStopId: "a",
    toStopId: "b",
    hourOfDay: input.hourOfDay,
    borough: "Manhattan",
    averageSpeedMph: input.speed,
    busTripCount: input.trips,
  };
}

function eligibleSeries(input: {
  segmentId: string;
  routeId: string;
  pre: number;
  post: number;
  preMonths?: readonly string[];
  postMonths?: readonly string[];
}) {
  const preMonths = input.preMonths ?? ["2024-01", "2024-02", "2024-03", "2024-04"];
  const postMonths = input.postMonths ?? ["2024-06", "2024-07", "2024-08", "2024-09"];
  const cells: StudyPanelCell[] = [
    ...preMonths.map((month) => ({
      routeId: input.routeId,
      borough: "Manhattan",
      spineSegmentId: input.segmentId,
      month,
      averageSpeedMph: input.pre,
      busTripCount: 100,
    })),
    ...postMonths.map((month) => ({
      routeId: input.routeId,
      borough: "Manhattan",
      spineSegmentId: input.segmentId,
      month,
      averageSpeedMph: input.post,
      busTripCount: 100,
    })),
  ];
  return {
    routeId: input.routeId,
    borough: "Manhattan",
    spineSegmentId: input.segmentId,
    cells,
    preMonthCount: preMonths.length,
    postMonthCount: postMonths.length,
    preMeanSpeedMph: input.pre,
    postMeanSpeedMph: input.post,
    preTripCount: preMonths.length * 100,
    postTripCount: postMonths.length * 100,
  };
}

describe("study panel", () => {
  test("maps exact source identities to stable spines and trip-weights cells", () => {
    const rows = [
      sourceRow({ month: "2024-01", hourOfDay: 8, speed: 6, trips: 10 }),
      sourceRow({ month: "2024-01", hourOfDay: 9, speed: 10, trips: 30 }),
    ];
    const sourceId = "M15:2024-01:N:1:a:b";
    const result = aggregateStudyPanel({
      rows,
      spineSegmentIdBySourceId: new Map([[sourceId, "m15-n-node-1-node-2"]]),
    });

    expect(result).toMatchObject({ unmatchedSourceRowCount: 0, ignoredSourceRowCount: 0 });
    expect(result.cells).toEqual([
      {
        routeId: "M15",
        borough: "Manhattan",
        spineSegmentId: "m15-n-node-1-node-2",
        month: "2024-01",
        averageSpeedMph: 9,
        busTripCount: 40,
      },
    ]);
  });

  test("requires four non-null months per side", () => {
    const complete = eligibleSeries({ segmentId: "complete", routeId: "M15", pre: 8, post: 9 });
    const incomplete = {
      ...eligibleSeries({ segmentId: "incomplete", routeId: "M15", pre: 8, post: 9 }),
      cells: eligibleSeries({
        segmentId: "incomplete",
        routeId: "M15",
        pre: 8,
        post: 9,
      }).cells.slice(1),
    };
    const result = eligibleSegmentSeries({
      series: segmentSeries([...complete.cells, ...incomplete.cells]),
      preMonths: new Set(["2024-01", "2024-02", "2024-03", "2024-04"]),
      postMonths: new Set(["2024-06", "2024-07", "2024-08", "2024-09"]),
    });

    expect(result.eligible.map((row) => row.spineSegmentId)).toEqual(["complete"]);
    expect(result.droppedInsufficientWindowCount).toBe(1);
  });
});

describe("matched segment DiD", () => {
  test("recovers an injected one-mph effect and produces a deterministic CI", () => {
    const treated = Array.from({ length: 8 }, (_, index) =>
      eligibleSeries({ segmentId: `treated-${index}`, routeId: "M15", pre: 8, post: 9 }),
    );
    const controls = Array.from({ length: 24 }, (_, index) =>
      eligibleSeries({ segmentId: `control-${index}`, routeId: "M1", pre: 8, post: 8 }),
    );
    const matching = matchStudyControls({ treated, candidates: controls });
    const estimate = estimateMatchedDid({
      matches: matching.matches,
      preMonths: new Set(["2024-01", "2024-02", "2024-03", "2024-04"]),
      postMonths: new Set(["2024-06", "2024-07", "2024-08", "2024-09"]),
    });
    if (estimate === null) throw new Error("Expected a matched estimate");
    const first = bootstrapSegmentDid({ segments: estimate.perSegment, eventId: "event-1" });
    const second = bootstrapSegmentDid({ segments: estimate.perSegment, eventId: "event-1" });

    expect(matching.droppedInsufficientControlsCount).toBe(0);
    expect(estimate.effectMph).toBe(1);
    expect(first).toEqual(second);
    expect(first?.lowerMph).toBeGreaterThan(0);
    expect(
      studyDirection({
        effectMph: estimate.effectMph,
        ciLowerMph: first?.lowerMph ?? 0,
        ciUpperMph: first?.upperMph ?? 0,
      }),
    ).toBe("improved");
  });

  test("reports no detectable change when the interval covers zero", () => {
    expect(studyDirection({ effectMph: 0, ciLowerMph: -0.2, ciUpperMph: 0.2 })).toBe(
      "no_detectable_change",
    );
  });

  test("fails the pre-trend and placebo gates on material false effects", () => {
    expect(preTrendGate({ monthlyDifferencesMph: [0, 0.15, 0.3, 0.45], effectMph: 1 }).status).toBe(
      "fail",
    );
    expect(
      placeboInTimeGate({ placeboEffectMph: 0.8, ciLowerMph: 0.6, ciUpperMph: 1.4 }).status,
    ).toBe("fail");
  });

  test("builds deterministic six-month windows and monthly differences", () => {
    const windows = studyWindowMonths({ implementationMonth: "2024-05", analysisMonth: "2024-11" });
    const match = matchStudyControls({
      treated: [eligibleSeries({ segmentId: "t", routeId: "M15", pre: 8, post: 9 })],
      candidates: [
        eligibleSeries({ segmentId: "c1", routeId: "M1", pre: 8, post: 8 }),
        eligibleSeries({ segmentId: "c2", routeId: "M2", pre: 8, post: 8 }),
      ],
    }).matches;
    expect(windows.preMonths).toEqual([
      "2023-11",
      "2023-12",
      "2024-01",
      "2024-02",
      "2024-03",
      "2024-04",
    ]);
    expect(windows.postMonths).toEqual([
      "2024-06",
      "2024-07",
      "2024-08",
      "2024-09",
      "2024-10",
      "2024-11",
    ]);
    expect(monthlyMatchedDifferences(match, ["2024-01", "2024-06"])).toEqual([
      { month: "2024-01", differenceMph: 0 },
      { month: "2024-06", differenceMph: 1 },
    ]);
  });
});

function syntheticStudy(input: {
  seed: number;
  effectMph: number;
  placeboShockMph?: number | undefined;
  peakEffectMph?: number | undefined;
}) {
  const random = mulberry32(input.seed);
  const months = Array.from({ length: 25 }, (_, index) => {
    const absolute = 2023 * 12 + 6 + index;
    return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, "0")}`;
  });
  const implementationMonth = "2025-01";
  const mainPost = new Set(["2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07"]);
  const placeboPost = new Set(["2024-02", "2024-03", "2024-04", "2024-05", "2024-06", "2024-07"]);
  const cells: StudyPanelCell[] = [];
  const treatedSegmentIds = new Set<string>();
  for (let segmentIndex = 0; segmentIndex < 40; segmentIndex += 1) {
    const treated = segmentIndex < 10;
    const spineSegmentId = `${treated ? "treated" : "control"}-${segmentIndex}`;
    if (treated) treatedSegmentIds.add(spineSegmentId);
    const routeId = treated ? "M15" : `M${segmentIndex + 20}`;
    const intercept = (random() - 0.5) * 0.6;
    for (const [monthIndexValue, month] of months.entries()) {
      const commonMonthEffect = Math.sin(monthIndexValue / 3) * 0.2;
      const noise = (random() + random() + random() + random() - 2) * 0.2;
      const treatmentEffect = treated && mainPost.has(month) ? input.effectMph : 0;
      const placeboEffect = treated && placeboPost.has(month) ? (input.placeboShockMph ?? 0) : 0;
      cells.push({
        routeId,
        borough: "Manhattan",
        spineSegmentId,
        month,
        averageSpeedMph:
          8 + intercept + commonMonthEffect + noise + treatmentEffect + placeboEffect,
        busTripCount: 100,
      });
    }
  }
  const peakCells = cells.map((cell) => ({
    ...cell,
    averageSpeedMph:
      cell.routeId === "M15" && mainPost.has(cell.month)
        ? cell.averageSpeedMph + (input.peakEffectMph ?? input.effectMph) - input.effectMph
        : cell.averageSpeedMph,
  }));
  return estimateStudy({
    eventId: `synthetic-${input.seed}-${input.effectMph}-${input.placeboShockMph ?? 0}`,
    routeId: "M15",
    implementationMonth,
    analysisMonth: "2025-07",
    boroughs: ["Manhattan"],
    cells,
    peakCells,
    treatedSegmentIds,
    excludedControlRouteIds: new Set(),
  });
}

describe("known-answer study estimator fixtures", () => {
  test("recovers an injected one-mph effect for three seeded noisy panels", () => {
    for (const seed of [11, 29, 47]) {
      const result = syntheticStudy({ seed, effectMph: 1 });
      expect(result.allDay.estimate?.effectMph ?? 0).toBeWithin(0.6, 1.4);
      expect(result.allDay.confidenceInterval?.lowerMph ?? 0).toBeGreaterThan(0);
    }
  });

  test("returns no detectable change for an exact null panel", () => {
    const result = syntheticStudy({ seed: 101, effectMph: 0 });
    const interval = result.allDay.confidenceInterval;
    expect(interval).not.toBeNull();
    expect(interval?.lowerMph ?? 1).toBeLessThanOrEqual(0);
    expect(interval?.upperMph ?? -1).toBeGreaterThanOrEqual(0);
    expect(result.direction).toBe("no_detectable_change");
  });

  test("passes a clean placebo and fails when an earlier fake shock is injected", () => {
    const clean = syntheticStudy({ seed: 211, effectMph: 1 });
    const shocked = syntheticStudy({ seed: 211, effectMph: 1, placeboShockMph: 1 });
    expect(clean.gates.placeboInTime.status).toBe("pass");
    expect(shocked.gates.placeboInTime.status).toBe("fail");
  });

  test("runs the peak companion and required congestion-pricing sensitivity", () => {
    const result = syntheticStudy({ seed: 307, effectMph: 1, peakEffectMph: 2 });
    expect(result.peakHours.estimate?.effectMph ?? 0).toBeWithin(1.6, 2.4);
    expect(result.gates.congestionPricingOverlap.status).toBe("fail");
    expect(result.sensitivityEstimates.congestionPricing).not.toBeNull();
    expect(result.sensitivityEstimates.congestionPricing?.excludedMonths).toEqual([
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
    ]);
  });
});
