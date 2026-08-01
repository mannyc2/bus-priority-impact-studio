import { describe, expect, test } from "bun:test";
import {
  SERVING_DECODE_POLICY_INVENTORY,
  ServingDataCorruptionError,
  servingArtifactCorruptionOrLegacyAbsence,
} from "../src/serving-decode-policy.js";

describe("Plan 098 serving decode policy", () => {
  test("covers every production serving layer with unique explicit dispositions", () => {
    const ids = SERVING_DECODE_POLICY_INVENTORY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(SERVING_DECODE_POLICY_INVENTORY.map((entry) => entry.layer))).toEqual(
      new Set([
        "artifact_locator",
        "browser_serving_decoder",
        "serving_d1_catalog",
        "serving_d1_rows",
        "worker_api_handlers",
        "worker_request_boundary",
      ]),
    );
    expect(
      SERVING_DECODE_POLICY_INVENTORY.filter((entry) => entry.disposition === "corrupt_fail_closed")
        .length,
    ).toBe(9);
  });

  test("allows legacy degradation only without a resolved pointer", () => {
    expect(
      servingArtifactCorruptionOrLegacyAbsence(
        {},
        {
          code: "active_artifact_json",
          endpoint: "test",
          logicalArtifactId: "test.json",
          schemaId: "bp.test.v1",
        },
        new SyntaxError("invalid"),
      ),
    ).toBeNull();
  });

  test("throws a typed redacted error for active release corruption", () => {
    const env = {
      SERVING_RELEASE_CONTEXT: {
        kind: "pointed" as const,
        generation: 1,
        release: {
          schemaVersion: 1 as const,
          releaseId: "pub_20260801T000000000Z",
          candidateId: "a".repeat(64),
          publishedAt: "2026-08-01T00:00:00.000Z",
          activatedAt: "2026-08-01T00:00:00.000Z",
        },
        candidate: { candidateId: "a".repeat(64) },
        artifactByLogicalId: new Map(),
      },
    } as never;
    expect(() =>
      servingArtifactCorruptionOrLegacyAbsence(env, {
        code: "active_artifact_schema",
        endpoint: "test",
        logicalArtifactId: "test.json",
        schemaId: "bp.test.v1",
      }),
    ).toThrow(ServingDataCorruptionError);
  });

  test("keeps the server, D1, locator, and browser boundaries fail closed", async () => {
    const [handlers, pointer, resolver, browser] = await Promise.all([
      Bun.file(new URL("../src/studio/read-handlers.ts", import.meta.url)).text(),
      Bun.file(new URL("../../db/src/d1/serving-release.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/artifact-resolver.ts", import.meta.url)).text(),
      Bun.file(new URL("../../../apps/web/src/studio/api-client.ts", import.meta.url)).text(),
    ]);
    expect(
      handlers.match(/servingArtifactCorruptionOrLegacyAbsence/g)?.length ?? 0,
    ).toBeGreaterThan(10);
    expect(pointer).toContain('new ServingReleaseResolutionError("catalog_corrupt"');
    expect(resolver).toContain("metadataSha256 !== artifact.sha256");
    expect(browser).toContain('status: "integrity_mismatch"');
    expect(browser).toContain('status: "invalid_contract"');
  });
});
