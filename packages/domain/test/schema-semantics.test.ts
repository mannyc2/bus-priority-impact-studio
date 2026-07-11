import { describe, expect, test } from "bun:test";
import { decodeEitherStrict, decodePreserve, decodeStrict, decodeStrip } from "@bp/domain/decode";
import {
  DirectionIdSchema,
  type RouteId,
  RouteIdCodec,
  RouteIdSchema,
} from "@bp/domain/primitives";
import { DetectorReadinessServingManifestForInsightsSchema } from "@bp/domain/studio";
import { StudioReleasePayloadSchema } from "@bp/domain/studio/release";
import { StudioSegmentSchema } from "@bp/domain/studio/routes";
import { StudioAiPublicNoteSchema } from "@bp/domain/studio/segment-evidence";
import { Result } from "effect";

describe("schema semantic compatibility", () => {
  test("keeps object excess-key modes distinct", () => {
    expect(() =>
      decodeStrict(StudioReleasePayloadSchema)({
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

    const passthrough = decodePreserve(DetectorReadinessServingManifestForInsightsSchema)({
      artifactKind: "detector_readiness_serving_manifest",
      schemaVersion: 1,
      routes: [],
      extra: "passthrough keeps this",
    });
    expect(passthrough).toHaveProperty("extra", "passthrough keeps this");

    const stripped = decodeStrip(StudioAiPublicNoteSchema)({
      generationMode: "fixture",
      body: "A public note.",
      source: "fixture",
      extra: "default object strips this",
    });
    expect(stripped).not.toHaveProperty("extra");
  });

  test("keeps route ID strict validation and boundary normalization separate", () => {
    expect(Result.isFailure(decodeEitherStrict(RouteIdSchema)("m1"))).toBe(true);
    expect(decodeStrict(RouteIdCodec)(" m1 ")).toBe(decodeStrict(RouteIdCodec)("M1"));
  });

  test("keeps domain brands type-distinct", () => {
    const directionId = decodeStrict(DirectionIdSchema)("0");
    // @ts-expect-error DirectionId must not collapse into the RouteId brand.
    const routeId: RouteId = directionId;
    expect(String(routeId)).toBe("0");
  });

  test("keeps Studio segment compatibility preprocessing", () => {
    const parsed = decodeStrict(StudioSegmentSchema)({
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
