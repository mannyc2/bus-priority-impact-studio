import { describe, expect, test } from "bun:test";
import { RouteIdCodec, RouteIdSchema } from "@bp/domain/primitives";
import { DetectorReadinessServingManifestForInsightsSchema } from "@bp/domain/studio";
import { StudioReleasePayloadSchema } from "@bp/domain/studio/release";
import { StudioSegmentSchema } from "@bp/domain/studio/routes";
import { StudioAiPublicNoteSchema } from "@bp/domain/studio/segment-evidence";
import * as z from "../src/schema-compat.js";

describe("schema semantic compatibility", () => {
  test("keeps object excess-key modes distinct", () => {
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
        methods: [],
        docsSections: [],
        docsEndpoints: [],
        extra: "strict rejects this",
      }),
    ).toThrow();

    const passthrough = DetectorReadinessServingManifestForInsightsSchema.parse({
      artifactKind: "detector_readiness_serving_manifest",
      schemaVersion: 1,
      routes: [],
      extra: "passthrough keeps this",
    });
    expect(passthrough).toHaveProperty("extra", "passthrough keeps this");

    const stripped = StudioAiPublicNoteSchema.parse({
      generationMode: "fixture",
      body: "A public note.",
      source: "fixture",
      extra: "default object strips this",
    });
    expect(stripped).not.toHaveProperty("extra");
  });

  test("keeps route ID strict validation and boundary normalization separate", () => {
    expect(RouteIdSchema.safeParse("m1").success).toBe(false);
    expect(z.decode(RouteIdCodec, " m1 ")).toBe(RouteIdCodec.parse("M1"));
  });

  test("keeps Studio segment compatibility preprocessing", () => {
    const parsed = StudioSegmentSchema.parse({
      id: "M1:0:1",
      routeSlug: "m1",
      direction: "NB",
      from: "Stop A",
      to: "Stop B",
      speedMph: 6.5,
      scheduledMph: null,
      riderHours: 12,
      lane: "partial",
      ace: false,
      tspStatus: "installed",
      hours: [8, 9],
      aiNote: { body: "Legacy note body." },
      extra: "segment strip removes this",
    });

    expect(parsed.tsp).toBe(true);
    expect(parsed.aiNote).toBe("Legacy note body.");
    expect(parsed).not.toHaveProperty("extra");
  });
});
