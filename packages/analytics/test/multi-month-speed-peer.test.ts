import { describe, expect, test } from "bun:test";
import {
  classifyMultiMonthSpeedPeerRoute,
  detectMultiMonthSpeedPeerDeficits,
  type MultiMonthSpeedPeerRouteInput,
  selectMultiMonthSpeedPeerGroup,
} from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "multimonthpeer0123456789abcdef";

const MATCHED_PEER = {
  peerGroupId: "route_family_type:M:Local",
  peerGroupLabel: "M Local routes",
  peerGroupMethod: "route_family_type" as const,
  peerRouteIds: ["M1", "M2", "M3"],
};

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
        ...MATCHED_PEER,
      },
      {
        month: "2026-02",
        hasSpeedTrend: true,
        averageSpeedMph: 5.4,
        speedObservationCount: 520,
        peerMedianSpeedMph: 7.2,
        peerRouteCount: 42,
        ...MATCHED_PEER,
      },
      {
        month: MONTH,
        hasSpeedTrend: true,
        averageSpeedMph: 5.1,
        speedObservationCount: 530,
        peerMedianSpeedMph: 7,
        peerRouteCount: 41,
        ...MATCHED_PEER,
      },
    ],
    ...over,
  };
}

describe("classifyMultiMonthSpeedPeerRoute", () => {
  test("classifies SBS, express, and local routes with boroughs", () => {
    expect(classifyMultiMonthSpeedPeerRoute("M34+")).toEqual({ serviceClass: "sbs", borough: "M" });
    expect(classifyMultiMonthSpeedPeerRoute("BX12+")).toEqual({
      serviceClass: "sbs",
      borough: "BX",
    });
    expect(classifyMultiMonthSpeedPeerRoute("SIM1")).toEqual({
      serviceClass: "express",
      borough: "S",
    });
    expect(classifyMultiMonthSpeedPeerRoute("BXM7")).toEqual({
      serviceClass: "express",
      borough: "BX",
    });
    expect(classifyMultiMonthSpeedPeerRoute("X27")).toEqual({
      serviceClass: "express",
      borough: null,
    });
    expect(classifyMultiMonthSpeedPeerRoute("BX2")).toEqual({
      serviceClass: "local",
      borough: "BX",
    });
    expect(classifyMultiMonthSpeedPeerRoute("T113")).toEqual({
      serviceClass: "local",
      borough: null,
    });
  });
});

describe("selectMultiMonthSpeedPeerGroup", () => {
  const peer = (
    routeId: string,
    averageSpeedMph = 8,
  ): { routeId: string; averageSpeedMph: number } => ({
    routeId,
    averageSpeedMph,
  });
  const sbsPeers = [
    "M14A+",
    "M14D+",
    "M15+",
    "M23+",
    "M34A+",
    "M60+",
    "M79+",
    "M86+",
    "B44+",
    "B46+",
    "BX12+",
    "Q44+",
  ].map((id) => peer(id));
  const localPeers = ["M1", "M2", "M3", "M4", "M5", "B1", "Q1", "QM1", "SIM1"].map((id) =>
    peer(id, 9),
  );

  test("an SBS route's peers are SBS routes only", () => {
    const selection = selectMultiMonthSpeedPeerGroup({
      routeId: "M34+",
      peers: [...sbsPeers, ...localPeers],
    });
    expect(selection.peerGroupMethod).toBe("route_type");
    expect(selection.peerGroupId).toBe("route_type:sbs");
    expect(selection.peerRouteIds.every((id) => id.endsWith("+"))).toBe(true);
    expect(selection.peerRouteIds).not.toContain("M34+");
    expect(selection.peerRouteCount).toBe(12);
  });

  test("uses borough + class when the borough group meets the minimum size", () => {
    const selection = selectMultiMonthSpeedPeerGroup({
      routeId: "M34+",
      peers: [...sbsPeers, ...localPeers],
      minPeerRouteCount: 8,
    });
    expect(selection.peerGroupMethod).toBe("route_family_type");
    expect(selection.peerGroupId).toBe("route_family_type:M:sbs");
    expect(selection.peerRouteIds).toEqual([
      "M14A+",
      "M14D+",
      "M15+",
      "M23+",
      "M34A+",
      "M60+",
      "M79+",
      "M86+",
    ]);
  });

  test("falls back to the system pool when the class group is too small", () => {
    const selection = selectMultiMonthSpeedPeerGroup({
      routeId: "M34+",
      peers: [peer("M15+"), peer("M23+"), ...localPeers],
    });
    expect(selection.peerGroupMethod).toBe("system");
    expect(selection.peerGroupLabel).toBe("System routes");
    expect(selection.peerRouteCount).toBe(11);
  });

  test("computes the median over the selected group only", () => {
    const selection = selectMultiMonthSpeedPeerGroup({
      routeId: "M34+",
      peers: [...sbsPeers.map((p) => ({ ...p, averageSpeedMph: 6 })), ...localPeers],
    });
    expect(selection.peerMedianSpeedMph).toBe(6);
  });
});

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
      peerGroupMethods: ["route_family_type"],
    });
    expect(output.coverage[0]?.outcome as string).toBe("hit");
    expect(output.candidates[0]?.claimText).toBe(
      "Route M15 has a multi-month low-speed pattern below the median of 41 same-class peer routes.",
    );
  });

  test("claim wording is citywide when every month used the system fallback", () => {
    const output = detectMultiMonthSpeedPeerDeficits({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          observations: route().observations.map((observation) => ({
            ...observation,
            peerGroupId: "system",
            peerGroupLabel: "System routes",
            peerGroupMethod: "system" as const,
          })),
        }),
      ],
    });

    expect(output.candidates[0]?.claimText).toBe(
      "Route M15 has a multi-month low-speed pattern below the citywide median route speed (no matched peer group met the minimum size).",
    );
  });

  test("claim wording names both methods when months mix matched and system peers", () => {
    const output = detectMultiMonthSpeedPeerDeficits({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          observations: route().observations.map((observation, index) =>
            index === 0
              ? {
                  ...observation,
                  peerGroupId: "system",
                  peerGroupLabel: "System routes",
                  peerGroupMethod: "system" as const,
                }
              : observation,
          ),
        }),
      ],
    });

    expect(output.candidates[0]?.claimText).toBe(
      "Route M15 has a multi-month low-speed pattern below its peer median (42 same-class peer routes in 2 of 3 months, citywide fallback otherwise).",
    );
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
