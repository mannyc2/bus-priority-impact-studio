import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDocsTier2MtaWikiSourceAlignment } from "../../../../src/commands/docs/tier2/mta-wiki-source-alignment.ts";

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(value));
}

describe("docs tier2 mta-wiki-source-alignment", () => {
  test("writes an exact-key source alignment without marking records publishable", async () => {
    const root = await mkdtemp(join(tmpdir(), "mta-wiki-source-alignment-"));
    try {
      const queuePath = join(root, "source-disposition-queue.json");
      const bridgePath = join(root, "mta-wiki-intervention-review-queue.json");
      const output = join(root, "mta-wiki-source-alignment.json");
      const markdown = join(root, "mta-wiki-source-alignment.md");

      await writeJson(queuePath, {
        generatedAt: "2026-06-11T00:00:00.000Z",
        items: [
          {
            queueRef: "source-001",
            sourceId: "nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb5",
            sourceTitle: "Webster Avenue CB5",
            reviewLane: "record_candidate_review",
            priority: "high",
            routeIds: ["BX41"],
          },
          {
            queueRef: "source-002",
            sourceId: "nyc_dot_bus_priority_document_pdf_unmatched_source",
            sourceTitle: "Unmatched",
            reviewLane: "source_disposition_review",
            priority: "low",
            routeIds: [],
          },
        ],
      });
      await writeJson(bridgePath, {
        version: 1,
        mtaWikiCanonicalBridge: true,
        generatedAt: "2026-06-11T00:00:00.000Z",
        outputPath: bridgePath,
        summary: { publicPromotionStatus: "not_ready" },
        reviewGroups: [
          {
            groupId: "mta_wiki:2013_03_sbs_webster_bx_cb5",
            sourceId: "2013_03_sbs_webster_bx_cb5",
            sourceLabel: "Webster Avenue CB5 presentation",
            routeIds: ["BX41"],
            projectIds: ["project_webster_sbs"],
            eventIds: ["event_webster_launch"],
            treatmentComponentIds: ["treatment_webster_bus_lane"],
            relationIds: ["relation_webster_route"],
            evidenceRefCount: 2,
            promotionReadiness: {
              status: "needs_manual_review",
              reasons: ["not yet collapsed to bp.document_intervention_record.v1"],
            },
          },
          {
            groupId: "mta_wiki:external_only",
            sourceId: "external_only",
            sourceLabel: "External only",
            routeIds: ["M15"],
            projectIds: ["project_external"],
            eventIds: [],
            treatmentComponentIds: [],
            relationIds: [],
            evidenceRefCount: 0,
            promotionReadiness: {
              status: "needs_manual_review",
              reasons: ["not yet collapsed to bp.document_intervention_record.v1"],
            },
          },
        ],
      });

      const artifact = await runDocsTier2MtaWikiSourceAlignment({
        queuePath,
        bridgePath,
        output,
        markdown,
        generatedAt: "2026-06-12T00:00:00.000Z",
      });

      expect(artifact.summary).toMatchObject({
        publicPromotionStatus: "not_ready",
        queueSourceCount: 2,
        mtaWikiReviewGroupCount: 2,
        exactAlignedSourceCount: 1,
        exactAlignedReviewGroupCount: 1,
        unalignedQueueSourceCount: 1,
        unalignedMtaWikiReviewGroupCount: 1,
        alignedInterventionCandidateRecordCount: 3,
      });
      expect(artifact.alignedSources[0]).toMatchObject({
        queueRef: "source-001",
        mtaWikiSourceId: "2013_03_sbs_webster_bx_cb5",
        alignmentKeys: ["201303sbswebsterbxcb5"],
        promotionReadiness: { status: "needs_manual_review" },
      });
      expect(artifact.summary.promotionBlockers.join("\n")).toContain("review context");
      expect(await Bun.file(output).exists()).toBe(true);
      expect(await Bun.file(markdown).exists()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
