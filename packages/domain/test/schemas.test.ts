import { describe, expect, test } from "bun:test";
import * as z from "zod";
import {
  HealthResponseSchema,
  healthResponseJsonSchema,
  RouteIdCodec,
  RouteScorecardSchema,
  StudioReleasePayloadSchema,
  studioReleasePayloadJsonSchema,
} from "../src/index.js";

describe("domain schemas", () => {
  test("normalizes route IDs at the boundary with a Zod codec", () => {
    const normalizedRouteId: string = z.decode(RouteIdCodec, " m1 ");

    expect(normalizedRouteId).toBe("M1");
  });

  test("rejects scorecards without citations", () => {
    expect(() =>
      RouteScorecardSchema.parse({
        schemaVersion: 1,
        routeId: "M1",
        month: "2026-01",
        routeScore: 82,
        coverageStatus: "full",
        averageSpeedMph: 7.5,
        hotspotCount: 3,
        citations: [],
      }),
    ).toThrow();
  });

  test("exports JSON Schema for generated docs and contracts", () => {
    expect(healthResponseJsonSchema).toEqual(
      expect.objectContaining({
        $schema: "https://json-schema.org/draft/2020-12/schema",
      }),
    );
    expect(studioReleasePayloadJsonSchema).toEqual(
      expect.objectContaining({
        $schema: "https://json-schema.org/draft/2020-12/schema",
      }),
    );
  });

  test("keeps Studio release payloads strict", () => {
    expect(() =>
      StudioReleasePayloadSchema.parse({
        schemaVersion: 1,
        generatedAt: "2026-05-18T00:00:00.000Z",
        quality: {
          releaseLayer: "baseline_release",
          completenessStatus: "complete",
          confidence: "medium",
          caveats: [],
        },
        routes: [],
        segments: [],
        findings: [],
        briefs: [],
        versions: [],
        comments: [],
        methods: [],
        docsSections: [],
        docsEndpoints: [],
        extra: "not allowed",
      }),
    ).toThrow();
  });

  test("keeps health responses strict", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ok: true,
        service: "bus-priority-impact-studio",
        checkedAt: "2026-04-27T12:00:00Z",
        extra: "not allowed",
      }),
    ).toThrow();
  });
});
