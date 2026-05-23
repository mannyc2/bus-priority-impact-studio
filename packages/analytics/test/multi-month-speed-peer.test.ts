import { describe, expect, test } from "bun:test";
import {
  detectMultiMonthSpeedPeerDeficits,
  type MultiMonthSpeedPeerRouteInput,
} from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "multimonthpeer0123456789abcdef";

function route(over: Partial<MultiMonthSpeedPeerRouteInput> = {}): MultiMonthSpeedPeerRouteInput {
  return {
    routeId: "M15",
    observations: [
      {
        month: "2026-01",
        hasSpeedTrend: true,
        averageSpeedMph: 5.2,
        speedObservationCount: 500,
        peerMedianSpeedMph: 7.1,
        peerRouteCount: 40,
      },
      {
        month: "2026-02",
        hasSpeedTrend: true,
        averageSpeedMph: 5.4,
        speedObservationCount: 520,
        peerMedianSpeedMph: 7.2,
        peerRouteCount: 42,
      },
      {
        month: MONTH,
        hasSpeedTrend: true,
        averageSpeedMph: 5.1,
        speedObservationCount: 530,
        peerMedianSpeedMph: 7,
        peerRouteCount: 41,
      },
    ],
    ...over,
  };
}

describe("detectMultiMonthSpeedPeerDeficits", () => {
  test("emits a route candidate when multi-month speed is below the peer median", () => {
    const output = detectMultiMonthSpeedPeerDeficits({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [route()],
    });

    expect(output.candidates).toHaveLength(1);
    expect(output.candidates[0]?.detectorId as string).toBe("multi_month_speed_peer");
    expect(output.candidates[0]?.reasonCode as string).toBe("multi_month_peer_speed_deficit");
    expect(output.evidence).toHaveLength(2);
    expect(output.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(JSON.parse(output.evidence[0]?.evidenceRef ?? "{}")).toMatchObject({
      observedMonthCount: 3,
      averagePeerDeficitMph: 1.87,
    });
    expect(output.coverage[0]?.outcome as string).toBe("hit");
  });

  test("skips when the current month is missing from supported trend observations", () => {
    const output = detectMultiMonthSpeedPeerDeficits({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          observations: route().observations.map((observation) =>
            observation.month === MONTH
              ? { ...observation, hasSpeedTrend: false, averageSpeedMph: null }
              : observation,
          ),
        }),
      ],
    });

    expect(output.candidates).toHaveLength(0);
    expect(output.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(output.coverage[0]?.reasonCode as string).toBe("insufficient_trend_months");
  });

  test("emits clean coverage when speed is not low versus peers", () => {
    const output = detectMultiMonthSpeedPeerDeficits({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          observations: route().observations.map((observation) => ({
            ...observation,
            averageSpeedMph: 6.8,
          })),
        }),
      ],
    });

    expect(output.candidates).toHaveLength(0);
    expect(output.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });
});
