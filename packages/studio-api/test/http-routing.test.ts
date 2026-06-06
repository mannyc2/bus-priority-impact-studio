import { describe, expect, test } from "bun:test";
import { StudioSnapshotResponseSchema } from "@bp/domain/studio/snapshots";
import { isApiPath, isStudioApiPath, studioRouteTemplate } from "@bp/studio-api/contracts";
import { handleStudioApiRequest } from "@bp/studio-api/server";
import { studioProjectionKey, studioProjectionPrefix } from "../src/studio/projections.js";
import { handleStudioReadRequest } from "../src/studio/read-handlers.js";

const quality = {
  releaseLayer: "baseline_release",
  completenessStatus: "complete",
  confidence: "high",
  caveats: [],
} as const;

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15 SBS",
  corridor: "First Avenue / Second Avenue",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 7.2,
  scheduledMph: 8.4,
  weightedAvgSpeed: 7.2,
  speedPercentile: 12,
  dailyRiders: 30_000,
  ridersYoyPct: 0,
  riderHoursLost: 0,
  laneCoverage: 65,
  aceStatus: "active",
  aceSince: "2024",
  tspCoverage: "none",
  reliability: "High attention route",
  observedReliability: null,
  diagnosis: "M15 SBS has slow segments and active treatment evidence.",
  spark: [7.2, 7.4, 7.1],
  termini: { north: "East Harlem", south: "South Ferry" },
  miles: 8.1,
  stops: 42,
  flags: ["ACE active"],
  peerSlug: null,
  interventions: [],
} as const;

function r2Bucket(payloads: Record<string, unknown>): R2Bucket {
  return {
    get: async (key: string) => {
      const payload = payloads[key];
      if (payload === undefined) return null;
      return {
        json: async () => payload,
      };
    },
  } as unknown as R2Bucket;
}

describe("Studio API HTTP helpers", () => {
  test("classifies API and Studio API paths", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/v1/studio/routes")).toBe(true);
    expect(isApiPath("/studio/routes")).toBe(false);

    expect(isStudioApiPath("/api/v1/studio")).toBe(true);
    expect(isStudioApiPath("/api/v1/studio/routes/m15-sbs")).toBe(true);
    expect(isStudioApiPath("/api/v1/routes")).toBe(false);
  });

  test("returns stable route templates for Studio resources", () => {
    expect(studioRouteTemplate("/api/v1/studio/routes")).toBe("/api/v1/studio/routes");
    expect(studioRouteTemplate("/api/v1/studio/routes/sections")).toBe(
      "/api/v1/studio/routes/sections",
    );
    expect(studioRouteTemplate("/api/v1/studio/routes/m15-sbs")).toBe(
      "/api/v1/studio/routes/:routeId",
    );
    expect(studioRouteTemplate("/api/v1/studio/routes/m15-sbs/ladder")).toBe(
      "/api/v1/studio/routes/:routeId/ladder",
    );
    expect(studioRouteTemplate("/api/v1/studio/briefs/brief-m15/draft/blocks")).toBe(
      "/api/v1/studio/briefs/:briefId/draft/blocks",
    );
    expect(studioRouteTemplate("/api/v1/studio/unknown")).toBe("/api/v1/studio/*");
  });

  test("builds projection keys from the configured release artifact", () => {
    expect(studioProjectionPrefix({})).toBe("studio/v1");
    expect(studioProjectionKey({}, "routes/index.json")).toBe("studio/v1/routes/index.json");

    const env = { STUDIO_RELEASE_KEY: "studio/v2/releases/2026-06-05/release.json" };
    expect(studioProjectionPrefix(env)).toBe("studio/v2/releases/2026-06-05");
    expect(studioProjectionKey(env, "routes/m15-sbs.json")).toBe(
      "studio/v2/releases/2026-06-05/routes/m15-sbs.json",
    );
  });

  test("serves projection-backed read responses with Studio release headers", async () => {
    const url = new URL("https://example.test/api/v1/studio/methods");
    const response = await handleStudioReadRequest(new Request(url), url, {
      ARTIFACTS: r2Bucket({
        "studio/v1/methods.json": {
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          datasets: [
            {
              name: "MTA Bus Speeds",
              publisher: "MTA",
              grain: "route-month",
              cadence: "monthly",
            },
          ],
          quality,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Studio-Release")).toBe("studio/v1");
    expect(response.headers.get("Cache-Control")).toContain("stale-while-revalidate=86400");

    const body = (await response.json()) as { datasets: Array<{ name: string }> };
    expect(body.datasets[0]?.name).toBe("MTA Bus Speeds");
  });

  test("routes OpenAPI through the package API facade", async () => {
    const response = await handleStudioApiRequest(
      new Request("https://example.test/api/openapi.json"),
      {},
    );
    const body = (await response?.json()) as { paths?: Record<string, unknown> };

    expect(response?.status).toBe(200);
    expect(body.paths).toEqual(
      expect.objectContaining({
        "/api/v1/studio/snapshot": expect.any(Object),
      }),
    );
  });

  test("serves a compact Studio snapshot manifest with content hash headers", async () => {
    const response = await handleStudioApiRequest(
      new Request("https://example.test/api/v1/studio/snapshot"),
      {
        ARTIFACTS: r2Bucket({
          "studio/v1/routes.json": {
            schemaVersion: 1,
            generatedAt: "2026-06-05T00:00:00.000Z",
            routes: [route],
            quality,
          },
          "studio/v1/findings.json": {
            schemaVersion: 1,
            generatedAt: "2026-06-05T00:00:00.000Z",
            findings: [],
            quality,
          },
          "studio/v1/briefs.json": {
            schemaVersion: 1,
            generatedAt: "2026-06-05T00:00:00.000Z",
            briefs: [],
            quality,
          },
          "studio/v1/methods.json": {
            schemaVersion: 1,
            generatedAt: "2026-06-05T00:00:00.000Z",
            datasets: [
              {
                name: "MTA Bus Speeds",
                publisher: "MTA",
                grain: "route-month",
                cadence: "monthly",
              },
            ],
            quality,
          },
          "studio/v1/docs.json": {
            schemaVersion: 1,
            generatedAt: "2026-06-05T00:00:00.000Z",
            sections: [{ title: "Quickstart", body: ["Use the API."] }],
            endpoints: [{ method: "GET", path: "/api/v1/studio/routes", body: "List routes." }],
            quality,
          },
        }),
      },
    );
    const body = StudioSnapshotResponseSchema.parse(await response?.json());

    expect(response?.status).toBe(200);
    expect(response?.headers.get("ETag")).toMatch(/^"studio-[a-f0-9]{8}"$/);
    expect(response?.headers.get("X-Studio-Content-Hash")).toMatch(/^[a-f0-9]{8}$/);
    expect(body.releaseId).toBe("studio/v1");
    expect(body.counts).toEqual(
      expect.objectContaining({
        routes: 1,
        findings: 0,
        briefs: 0,
        methods: 1,
        docsSections: 1,
        docsEndpoints: 1,
      }),
    );
    expect(body.projections.map((projection) => projection.path)).toContain(
      "studio/v1/routes.json",
    );
  });
});
