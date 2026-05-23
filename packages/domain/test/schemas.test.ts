import { describe, expect, test } from "bun:test";
import * as z from "zod";
import {
  buildStudioRouteProjection,
  HealthResponseSchema,
  healthResponseJsonSchema,
  RouteIdCodec,
  RouteScorecardSchema,
  StudioReleasePayloadSchema,
  StudioRouteDetailResponseSchema,
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

  test("projects route artifact refs into Studio route detail contracts", () => {
    const release = StudioReleasePayloadSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-05-18T00:00:00.000Z",
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "complete",
        confidence: "medium",
        caveats: [],
      },
      routes: [
        {
          slug: "m15-sbs",
          routeId: "M15+",
          label: "M15",
          corridor: "1 Av / 2 Av",
          corridorFull: "1st Avenue / 2nd Avenue Select Bus Service",
          borough: "Manhattan",
          sbs: true,
          speedMph: 6.4,
          scheduledMph: 7.1,
          weightedAvgSpeed: 6.4,
          speedPercentile: 12,
          dailyRiders: 37_200,
          ridersYoyPct: -4.1,
          riderHoursLost: 4_310,
          laneCoverage: 72,
          aceStatus: "active",
          aceSince: "2019-11",
          tspCoverage: "partial",
          reliability: "Observed reliability available",
          observedReliability: null,
          diagnosis: "Fixture route for contract projection.",
          spark: [6.8, 6.4],
          termini: { north: "E 125 St", south: "South Ferry" },
          miles: 8.4,
          stops: 33,
          flags: ["ACE active"],
          peerSlug: null,
          interventions: [],
        },
      ],
      segments: [],
      routeArtifacts: [
        {
          routeId: "M15+",
          month: "2026-03",
          name: "brief.json",
          key: "briefs/routes/m15-sbs/2026-03/brief.json",
          contentType: "application/json",
          byteLength: 42,
          sha256: "a".repeat(64),
        },
      ],
      findings: [],
      briefs: [],
      versions: [],
      comments: [],
      methods: [],
      docsSections: [],
      docsEndpoints: [],
    });

    const route = release.routes[0];
    expect(route).toBeDefined();
    if (route === undefined) {
      throw new Error("expected route fixture");
    }

    const detail = StudioRouteDetailResponseSchema.parse(
      buildStudioRouteProjection(release, route),
    );

    expect(detail.artifactRefs).toEqual([
      expect.objectContaining({
        routeId: "M15+",
        key: "briefs/routes/m15-sbs/2026-03/brief.json",
      }),
    ]);
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
