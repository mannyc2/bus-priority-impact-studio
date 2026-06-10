import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { evaluationArtifactManifestPath } from "../src/artifacts";
import {
  buildEvaluationArtifactManifest,
  buildEvaluationJsonArtifacts,
  referencedEvaluationInterventionEvents,
  verifyEvaluationArtifactManifest,
} from "../src/evaluation";

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, bytes);
}

describe("evaluation artifact manifest builders", () => {
  test("builds payload artifacts, manifest entries, and verifies the files", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bp-evaluation-artifacts-"));
    try {
      const month = "2026-03";
      const generatedAt = "2026-06-06T00:00:00.000Z";
      const rows = {
        observedReliability: [
          { routeId: "B41", reliabilityStatus: "observed", sampleCount: 10 },
          {
            routeId: "M1",
            reliabilityStatus: "insufficient_gtfs_rt_samples",
            sampleCount: 2,
          },
        ],
        interventionEvents: [{ eventId: "event-1" }, { eventId: "unreferenced" }],
        interventionComparisons: [
          { eventId: "event-1", routeId: "B41", comparisonStatus: "evaluated" },
        ],
        corridorInterventionContexts: [{ corridorId: "flatbush" }],
      };

      expect(
        referencedEvaluationInterventionEvents({
          events: rows.interventionEvents,
          comparisons: rows.interventionComparisons,
        }),
      ).toEqual([{ eventId: "event-1" }]);

      const { artifacts } = buildEvaluationJsonArtifacts({
        artifactRoot: tmp,
        month,
        generatedAt,
        rows,
      });
      const manifest = buildEvaluationArtifactManifest({
        month,
        generatedAt,
        artifacts: artifacts.map((artifact) => artifact.entry),
      });

      for (const artifact of artifacts) {
        await writeBytes(artifact.path, artifact.bytes);
      }
      const manifestPath = evaluationArtifactManifestPath(tmp, month);
      await writeBytes(
        manifestPath,
        new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      );

      expect(manifest).toMatchObject({
        artifactKind: "evaluation_artifact_manifest",
        artifactCount: 3,
        issueCount: 0,
      });
      await expect(Bun.file(artifacts[1]?.path ?? "").json()).resolves.toMatchObject({
        eventCount: 1,
        comparisonCount: 1,
        evaluatedComparisonCount: 1,
      });
      await expect(
        verifyEvaluationArtifactManifest({
          artifactRoot: tmp,
          month,
          expectedRowCounts: {
            observedReliability: 2,
            routeInterventionComparisons: 1,
            corridorInterventionContexts: 1,
          },
        }),
      ).resolves.toMatchObject({
        status: "pass",
        issueCount: 0,
        rowCounts: {
          observedReliability: 2,
          routeInterventionComparisons: 1,
          corridorInterventionContexts: 1,
        },
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("reports hash and expected row count mismatches", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bp-evaluation-artifacts-"));
    try {
      const month = "2026-03";
      const { artifacts } = buildEvaluationJsonArtifacts({
        artifactRoot: tmp,
        month,
        generatedAt: "2026-06-06T00:00:00.000Z",
        rows: {
          observedReliability: [{ reliabilityStatus: "observed", sampleCount: 10 }],
          interventionEvents: [],
          interventionComparisons: [],
          corridorInterventionContexts: [],
        },
      });
      const manifest = buildEvaluationArtifactManifest({
        month,
        generatedAt: "2026-06-06T00:00:00.000Z",
        artifacts: artifacts.map((artifact) => artifact.entry),
      });

      for (const artifact of artifacts) {
        await writeBytes(artifact.path, artifact.bytes);
      }
      await Bun.write(artifacts[0]?.path ?? "", '{"tampered":true}\n');
      await writeBytes(
        evaluationArtifactManifestPath(tmp, month),
        new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      );

      const verification = await verifyEvaluationArtifactManifest({
        artifactRoot: tmp,
        month,
        expectedRowCounts: {
          observedReliability: 2,
          routeInterventionComparisons: 0,
          corridorInterventionContexts: 0,
        },
      });

      expect(verification.status).toBe("fail");
      expect(verification.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          "evaluation_artifact_hash_mismatch",
          "evaluation_artifact_expected_row_count_mismatch",
        ]),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
