import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDocsTier2SourceDispositionReceipts } from "../../../../src/commands/docs/tier2/source-disposition-receipts.ts";

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(value));
}

describe("docs tier2 source-disposition-receipts", () => {
  test("normalizes explicit review decisions into audit-readable receipts", async () => {
    const root = await mkdtemp(join(tmpdir(), "source-disposition-receipts-"));
    try {
      const reviewPackPath = join(root, "source-review-pack-batch.json");
      const decisionsPath = join(root, "source-disposition-decisions.json");
      const outputPath = join(root, "source-disposition-receipts.json");
      await writeJson(reviewPackPath, {
        artifactKind: "bp.tier2_source_review_pack_batch.v1",
        schemaVersion: 1,
        generatedAt: "2026-06-12T00:15:00.000Z",
        summary: { selectedSourceCount: 2 },
        packs: [
          {
            queueRef: "s001",
            sourceId: "source-context",
            sampleSurfaces: [{ surfaceId: "surface-context-1" }],
            featureRows: [],
          },
          {
            queueRef: "s002",
            sourceId: "source-needs-review",
            sampleSurfaces: [],
            featureRows: [{ surfaceId: "surface-feature-1" }],
          },
        ],
      });
      await writeJson(decisionsPath, {
        decisions: [
          {
            sourceId: "source-context",
            disposition: "supporting_context_only",
            rationale: "Context source only.",
          },
          {
            sourceId: "source-needs-review",
            disposition: "needs_more_source_review",
            rationale: "Needs a reviewer before closure.",
            evidenceRefs: ["explicit-ref"],
          },
        ],
      });

      const artifact = await runDocsTier2SourceDispositionReceipts({
        reviewPackPath,
        decisionsPath,
        outputPath,
        generatedAt: "2026-06-12T01:00:00.000Z",
        reviewerId: "fixture-reviewer",
      });

      expect(artifact.summary).toMatchObject({
        packSourceCount: 2,
        receiptCount: 2,
        closingDispositionReceiptCount: 1,
        nonClosingDispositionReceiptCount: 1,
        sourcesWithoutReceiptCount: 0,
        publicPromotionStatus: "not_ready",
      });
      expect(artifact.receipts[0]).toMatchObject({
        sourceId: "source-context",
        queueRef: "s001",
        disposition: "supporting_context_only",
        reviewerId: "fixture-reviewer",
        reviewedAt: "2026-06-12T01:00:00.000Z",
        evidenceRefs: ["surface-context-1"],
      });
      expect(artifact.receipts[1]?.evidenceRefs).toEqual(["explicit-ref"]);
      expect(await Bun.file(outputPath).exists()).toBe(true);
      expect(await Bun.file(outputPath.replace(/\.json$/u, ".md")).exists()).toBe(true);
      expect(await Bun.file(outputPath.replace(/\.json$/u, "-summary.json")).exists()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects decisions for sources outside the review pack batch", async () => {
    const root = await mkdtemp(join(tmpdir(), "source-disposition-receipts-"));
    try {
      const reviewPackPath = join(root, "source-review-pack-batch.json");
      const decisionsPath = join(root, "source-disposition-decisions.json");
      await writeJson(reviewPackPath, {
        artifactKind: "bp.tier2_source_review_pack_batch.v1",
        schemaVersion: 1,
        generatedAt: "2026-06-12T00:15:00.000Z",
        summary: { selectedSourceCount: 1 },
        packs: [{ queueRef: "s001", sourceId: "source-context", sampleSurfaces: [], featureRows: [] }],
      });
      await writeJson(decisionsPath, {
        decisions: [
          {
            sourceId: "source-orphan",
            disposition: "supporting_context_only",
            rationale: "Not in pack.",
          },
        ],
      });

      await expect(
        runDocsTier2SourceDispositionReceipts({
          reviewPackPath,
          decisionsPath,
          outputPath: join(root, "source-disposition-receipts.json"),
        }),
      ).rejects.toThrow("source outside review pack batch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
