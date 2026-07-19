import { describe, expect, test } from "bun:test";
import { decodeEitherStrict, decodeStrict } from "@bp/domain/decode";
import {
  CoverageWindowSchema,
  ReleaseIdentitySchema,
  releaseIdFromPublishedAt,
} from "@bp/domain/studio/shared";
import { Result } from "effect";

describe("publication release identity", () => {
  test("derives a compact ID without losing UTC millisecond precision", () => {
    const publishedAt = "2026-07-19T12:34:56.789Z";
    const releaseId = releaseIdFromPublishedAt(publishedAt);

    expect(releaseId).toBe("pub_20260719T123456789Z");
    expect(releaseIdFromPublishedAt(publishedAt)).toBe(releaseId);
    expect(releaseIdFromPublishedAt("2026-07-19T12:34:56.790Z")).not.toBe(releaseId);

    const match = releaseId.match(/^pub_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/);
    expect(match).not.toBeNull();
    const [, year, month, day, hour, minute, second, milliseconds] = match ?? [];
    expect(
      new Date(
        `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}Z`,
      ).toISOString(),
    ).toBe(publishedAt);
  });

  test("rejects every non-canonical or lossy publication timestamp form", () => {
    for (const publishedAt of [
      "2026-07-19T12:34:56Z",
      "2026-07-19T12:34:56.78Z",
      "2026-07-19T12:34:56.7890Z",
      "2026-07-19T12:34:56.789+00:00",
      "2026-07-19 12:34:56.789Z",
      "2026-02-30T12:34:56.789Z",
    ]) {
      expect(() => releaseIdFromPublishedAt(publishedAt)).toThrow(/canonical UTC ISO form/);
    }
  });

  test("validates honest null and bounded coverage starts", () => {
    const unknownStart = decodeStrict(CoverageWindowSchema)({ start: null, end: "2026-03" });
    expect(unknownStart.start).toBeNull();
    expect(String(unknownStart.end)).toBe("2026-03");

    const bounded = decodeStrict(CoverageWindowSchema)({
      start: "2023-04",
      end: "2026-03",
    });
    expect(String(bounded.start)).toBe("2023-04");
    expect(String(bounded.end)).toBe("2026-03");
    expect(
      Result.isFailure(
        decodeEitherStrict(CoverageWindowSchema)({ start: "2026-04", end: "2026-03" }),
      ),
    ).toBe(true);
    for (const coverage of [
      { start: "2023-4", end: "2026-03" },
      { start: "2023-04", end: "2026-13" },
    ]) {
      expect(Result.isFailure(decodeEitherStrict(CoverageWindowSchema)(coverage))).toBe(true);
    }
  });

  test("requires the release ID and publication timestamp to describe one instant", () => {
    const identity = decodeStrict(ReleaseIdentitySchema)({
      releaseId: "pub_20260719T123456789Z",
      publishedAt: "2026-07-19T12:34:56.789Z",
      coverage: { start: "2023-04", end: "2026-03" },
    });
    expect(identity.releaseId).toBe("pub_20260719T123456789Z");
    expect(identity.publishedAt).toBe("2026-07-19T12:34:56.789Z");
    expect(String(identity.coverage.start)).toBe("2023-04");
    expect(String(identity.coverage.end)).toBe("2026-03");

    expect(
      Result.isFailure(
        decodeEitherStrict(ReleaseIdentitySchema)({
          releaseId: "pub_20260719T123456788Z",
          publishedAt: "2026-07-19T12:34:56.789Z",
          coverage: { start: null, end: "2026-03" },
        }),
      ),
    ).toBe(true);
  });
});
