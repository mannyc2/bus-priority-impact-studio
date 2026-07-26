import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import { StudioSnapshotResponseSchema } from "@bp/domain/studio/snapshots";
import {
  findRouteSpec,
  isApiPath,
  isStudioApiPath,
  matchRouteSpec,
  studioApiRoutes,
  studioRouteTemplate,
} from "@bp/studio-api/contracts";
import { studioOpenApiDocument } from "@bp/studio-api/contracts/openapi";
import { handleStudioApiRequest } from "@bp/studio-api/server";
import { studioProjectionKey, studioProjectionPrefix } from "../src/studio/projections.js";
import { studioReadHandlerRouteIds } from "../src/studio/read-handlers.js";

const quality = {
  releaseLayer: "published_release",
  completenessStatus: "complete",
  confidence: "high",
  caveats: [],
} as const;

function openApiOperationCount(): number {
  return Object.values(studioOpenApiDocument.paths).reduce(
    (sum, pathItem) =>
      sum +
      (["get", "post", "put", "patch", "delete"] as const).filter(
        (method) => pathItem[method] !== undefined,
      ).length,
    0,
  );
}

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
    expect(studioRouteTemplate("/api/v1/studio/unknown")).toBe("/api/v1/studio/*");
  });

  test("finds the most specific route spec for method and path", () => {
    expect(findRouteSpec("GET", "/api/v1/studio/routes")?.id).toBe("studio.routes");
    expect(findRouteSpec("GET", "/api/v1/studio/routes/sections")?.id).toBe("studio.routeSections");
    expect(findRouteSpec("GET", "/api/v1/studio/routes/m15-sbs")?.id).toBe("studio.route");
    expect(findRouteSpec("POST", "/api/v1/rum")?.id).toBe("observability.rum");
    expect(findRouteSpec("POST", "/api/v1/studio/routes")).toBeNull();
    expect(findRouteSpec("GET", "/api/v1/studio/unknown")).toBeNull();
    expect(matchRouteSpec("GET", "/api/v1/studio/routes/m15-sbs/history")).toEqual(
      expect.objectContaining({
        spec: expect.objectContaining({ id: "studio.routeHistory" }),
        params: { routeId: "m15-sbs" },
      }),
    );
  });

  test("keeps Studio registry routes and read handlers complete", () => {
    const registryRouteIds = studioApiRoutes
      .filter((route) => route.tags.some((tag) => tag === "Studio"))
      .map((route) => route.id)
      .toSorted();

    expect(studioReadHandlerRouteIds).toEqual(registryRouteIds);
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

  test("routes OpenAPI through the package API facade", async () => {
    const response = await handleStudioApiRequest(
      new Request("https://example.test/api/openapi.json"),
      {},
    );
    const body = (await response?.json()) as { paths?: Record<string, unknown> };

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=86400",
    );
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
            schemaVersion: 2,
            generatedAt: "2026-06-05T00:00:00.000Z",
            releaseId: "pub_20260605T000000000Z",
            publishedAt: "2026-06-05T00:00:00.000Z",
            coverage: { start: null, end: "2026-03" },
            routes: [route],
            quality,
          },
          "studio/v1/methods.json": {
            schemaVersion: 1,
            generatedAt: "2026-06-05T00:00:00.000Z",
            datasets: [
              {
                sourceId: "route_month_trends",
                name: "MTA Bus Speeds",
                publisher: "MTA",
                grain: "route-month",
                cadence: "monthly",
                description: "Route/month speed and ridership summary rows.",
                rowCount: 120,
                rowLabel: "route-month rows",
                period: "2026-03",
                schemaKeys: ["route_id", "month", "average_speed_mph"],
                method: "route-month-trends",
                sourceRefCount: 1,
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
    const body = decodeStrict(StudioSnapshotResponseSchema)(await response?.json());

    expect(response?.status).toBe(200);
    expect(response?.headers.get("ETag")).toMatch(/^"studio-[a-f0-9]{8}"$/);
    expect(response?.headers.get("X-Studio-Content-Hash")).toMatch(/^[a-f0-9]{8}$/);
    expect(body.release).toEqual(
      decodeStrict(ReleaseIdentitySchema)({
        releaseId: "pub_20260605T000000000Z",
        publishedAt: "2026-06-05T00:00:00.000Z",
        coverage: { start: null, end: "2026-03" },
      }),
    );
    expect(body.counts).toEqual(
      expect.objectContaining({
        routes: 1,
        methods: 1,
        docsSections: 1,
        docsEndpoints: openApiOperationCount(),
      }),
    );
    expect(body.projections.map((projection) => projection.path)).toContain(
      "studio/v1/routes.json",
    );
  });
});
