import { describe, expect, test } from "bun:test";
import { routeDossierArchetype } from "../../src/components/route/route-archetype";
import type {
  RouteDossierSummaryForDetail,
  RouteSurfaceCapability,
  StudioRouteCapability,
} from "../../src/studio/api-contract";

function surface(
  state: RouteSurfaceCapability["state"],
  monthsCovered = 0,
): RouteSurfaceCapability {
  return {
    state,
    reason: state === "ready" ? null : `because ${state}`,
    depth: monthsCovered > 0 ? { monthsCovered, grains: ["route_month"] } : null,
    dataAsOf: state === "not_applicable" ? null : "2026-03",
    freshness: "current",
  };
}

function capability(
  overallState: StudioRouteCapability["overallState"],
  surfaces: Record<string, RouteSurfaceCapability>,
): StudioRouteCapability {
  return { overallState, surfaces, caveats: [] };
}

function dossier(months: number): RouteDossierSummaryForDetail {
  return {
    artifactKind: "studio_route_dossier_summary",
    schemaVersion: 2,
    generatedAt: "2026-06-10T00:00:00.000Z",
    routeId: "M15+",
    routeSlug: "m15-sbs",
    releaseId: "pub_20260610T000000000Z",
    publishedAt: "2026-06-10T00:00:00.000Z",
    coverage: { start: null, end: "2026-03" },
    dataAsOf: "2026-03",
    speed: {
      current: 6.9,
      movement6mPct: -8,
      peerPercentile: 12,
      sparkline: Array.from({ length: months }, (_, index) => ({
        month: `2024-${String((index % 12) + 1).padStart(2, "0")}`,
        value: 6.9 + index * 0.01,
      })),
      dataAsOf: "2026-03",
    },
    ridership: {
      current: 42000,
      movement6mPct: 3.5,
      peerPercentile: 96,
      sparkline: [],
      dataAsOf: "2026-03",
    },
    worstSegment: null,
    treatmentPosture: {
      aceActive: false,
      aceSince: null,
      busLaneMatchedLaneCount: 0,
      latestEvents: [],
      dataAsOf: "2026-03",
    },
  };
}

describe("route dossier archetype", () => {
  test("labels legacy routes without a capability manifest", () => {
    expect(routeDossierArchetype({ capability: null, dossier: null })).toMatchObject({
      id: "legacy",
      label: "Legacy route",
      completeSurfaceCount: 0,
    });
  });

  test("labels manifest-light routes as sparse", () => {
    expect(
      routeDossierArchetype({
        capability: capability("building", {
          condition: surface("ready"),
          speedHistory: surface("insufficient_data"),
          ridership: surface("insufficient_data"),
        }),
        dossier: null,
      }),
    ).toMatchObject({
      id: "sparse",
      label: "Sparse route",
      completeSurfaceCount: 1,
    });
  });

  test("labels supported but shallow routes as standard", () => {
    expect(
      routeDossierArchetype({
        capability: capability("ready", {
          condition: surface("ready"),
          speedHistory: surface("partial"),
          detectorFindings: surface("checked_clean"),
          ridership: surface("ready"),
          scheduleBaseline: surface("ready"),
        }),
        dossier: dossier(6),
      }),
    ).toMatchObject({
      id: "standard",
      label: "Standard route",
      completeSurfaceCount: 5,
      deepSurfaceCount: 0,
    });
  });

  test("labels broad multi-year routes as flagship", () => {
    expect(
      routeDossierArchetype({
        capability: capability("ready", {
          condition: surface("ready"),
          map: surface("ready"),
          speedHistory: surface("ready", 36),
          detectorFindings: surface("ready"),
          reliability: surface("checked_clean"),
          ridership: surface("ready", 36),
          treatment: surface("ready"),
          scheduleBaseline: surface("ready"),
        }),
        dossier: dossier(36),
      }),
    ).toMatchObject({
      id: "flagship",
      label: "Flagship route",
      completeSurfaceCount: 8,
      deepSurfaceCount: 3,
    });
  });
});
