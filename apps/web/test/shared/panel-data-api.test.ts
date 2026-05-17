import { afterEach, describe, expect, it } from "vitest";
import {
  loadCompareData,
  loadHotspotsData,
  loadRouteProfileData,
} from "../../src/lib/panel-data.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const routeCard = {
  routeId: "B46+",
  shortName: "B46+",
  month: "2026-03",
  rank: 1,
  routeScore: 38,
  averageSpeedMph: 6.4,
  hotspotCount: 9,
  totalRidership: 123456,
  aceActive: true,
  busLaneMatchedLaneCount: 4,
  observedBunchingShare: 0.12,
  observedLongGapShare: 0.2,
  reliabilityStatus: "observed",
  sampleCount: 2500,
  quality: {
    releaseLayer: "observed_release",
    completenessStatus: "complete",
    confidence: "medium",
    caveats: ["Recovered realtime evidence."],
  },
};

describe("API-first panel loaders", () => {
  it("maps API hotspot and route-card payloads into current panel data", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const path = input instanceof Request ? input.url : String(input);
      if (path.includes("/api/v1/hotspots")) {
        return response({
          schemaVersion: 1,
          generatedAt: "2026-05-17T00:00:00.000Z",
          baselineMonth: "2026-03",
          hotspots: [
            {
              corridorId: "corridor-b46",
              corridorName: "Utica Avenue",
              routeId: "B46+",
              month: "2026-03",
              rank: 1,
              routeHotspotRank: 2,
              fromStopName: "DeKalb Av",
              toStopName: "Eastern Pkwy",
              averageSpeedMph: 4.9,
              hotspotScore: 91,
              riderImpactScore: 88,
              quality: {
                releaseLayer: "baseline_release",
                completenessStatus: "complete",
                confidence: "high",
                caveats: [],
              },
            },
          ],
          quality: {
            releaseLayer: "baseline_release",
            completenessStatus: "complete",
            confidence: "high",
            caveats: [],
          },
        });
      }

      return response({
        schemaVersion: 1,
        generatedAt: "2026-05-17T00:00:00.000Z",
        baselineMonth: "2026-03",
        routes: [routeCard],
        quality: {
          releaseLayer: "observed_release",
          completenessStatus: "complete",
          confidence: "medium",
          caveats: [],
        },
      });
    }) as typeof fetch;

    const data = await loadHotspotsData("all");

    expect(data.routes[0]).toEqual(
      expect.objectContaining({
        name: "B46 SBS",
        corridor: "Utica Avenue",
        speed: 4.9,
        bunching: 12,
      }),
    );
  });

  it("maps route profile and compare API payloads", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const path = input instanceof Request ? input.url : String(input);
      if (path.includes("/api/v1/compare")) {
        return response({
          schemaVersion: 1,
          generatedAt: "2026-05-17T00:00:00.000Z",
          baselineMonth: "2026-03",
          routes: [
            routeCard,
            { ...routeCard, routeId: "M15+", routeScore: 54, averageSpeedMph: 7.8 },
          ],
          deltas: {
            routeScore: 16,
            averageSpeedMph: 1.4,
            totalRidership: 0,
            observedBunchingShare: null,
            observedLongGapShare: null,
          },
          quality: {
            releaseLayer: "observed_release",
            completenessStatus: "complete",
            confidence: "medium",
            caveats: [],
          },
        });
      }

      return response({
        schemaVersion: 1,
        generatedAt: "2026-05-17T00:00:00.000Z",
        baselineMonth: "2026-03",
        route: routeCard,
        peakRidership: null,
        slowestWindow: null,
        observedReliability: null,
        artifacts: [],
        quality: routeCard.quality,
      });
    }) as typeof fetch;

    await expect(loadRouteProfileData("b46-sbs")).resolves.toEqual(
      expect.objectContaining({ name: "B46 SBS", speed: 6.4 }),
    );
    await expect(loadCompareData("B46+", "M15+")).resolves.toEqual(
      expect.objectContaining({
        routeA: expect.objectContaining({ name: "B46 SBS" }),
        routeB: expect.objectContaining({ name: "M15 SBS" }),
      }),
    );
  });
});
