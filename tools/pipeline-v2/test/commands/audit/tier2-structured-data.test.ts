import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildTier2StructuredDataInventory,
  classifyTier2StructuredArtifact,
  summarizeTier2StructuredArtifact,
} from "../../../src/commands/audit/tier2-structured-data.ts";

const VALID_RECORD = {
  recordId: "record-1",
  sourceId: "source-1",
  recordKind: "implemented",
  routes: ["B44"],
  serviceMode: "sbs",
  primaryTreatments: ["bus_lane"],
  corridor: {
    streets: ["Nostrand Avenue"],
    extentEndpoints: { start: "Avenue U", end: "Fulton Street" },
  },
  effectiveDate: "2013-11-17",
  datePrecision: "day",
  statusHistory: [{ status: "complete", asOfDate: "2013-11-17", evidenceRefs: ["cand-1"] }],
  treatmentComponents: [
    {
      treatmentType: "bus_lane",
      description: "Dedicated bus lanes were implemented.",
      evidenceRefs: ["cand-1"],
    },
  ],
  metrics: [],
  caveats: [],
  evidenceCandidateIds: ["cand-1"],
  extraction: {
    candidateExtractionRootName: "candidate-bundle.json",
    candidateRootName: "candidate-bundle.json",
    synthesisRootName: "intervention-records.json",
  },
};

describe("audit tier2-structured-data", () => {
  test("delegates artifact classification and value summaries to analytics", async () => {
    const commandSource = await Bun.file(
      join(import.meta.dir, "../../../src/commands/audit/tier2-structured-data.ts"),
    ).text();

    expect(commandSource).toContain('from "@bp/analytics/evaluation"');
    expect(commandSource).toContain("summarizeTier2StructuredArtifactValue({");
    expect(commandSource).toContain("buildTier2StructuredDataInventoryFromArtifacts({");
    expect(commandSource).toContain("renderTier2StructuredDataInventoryMarkdown(inventory)");
    expect(commandSource).not.toContain('from "@bp/domain/documents/intervention-records"');
    expect(commandSource).not.toContain("DocumentInterventionRecordSchema");
    expect(commandSource).not.toContain("function flattenRouteValues");
    expect(commandSource).not.toContain("function summarizeCounts");
    expect(commandSource).not.toContain("function artifactRank");
    expect(commandSource).not.toContain("function nextActionsForInventory");
    expect(commandSource).not.toContain("function renderTier2StructuredDataInventoryMarkdown");
    expect(commandSource).not.toContain("# Tier 2 Structured Data Inventory");
  });

  test("classifies the current research and serving layers", () => {
    expect(
      classifyTier2StructuredArtifact({
        fileName: "intervention-records-corpus-v3-reviewed.json",
        value: { documentInterventionRecords: [VALID_RECORD] },
      }).layer,
    ).toBe("reviewed_intervention_records");

    expect(
      classifyTier2StructuredArtifact({
        fileName: "intervention-publishable-v1.json",
        value: { publishableInterventions: [{ recordId: "record-1", routes: ["B44"] }] },
      }).trustTier,
    ).toBe("serving_projection");

    expect(
      classifyTier2StructuredArtifact({
        fileName: "candidate-bundle-combined.json",
        value: { documentSourceCandidates: [{}], documentInterventionSeeds: [{}] },
      }).trustTier,
    ).toBe("discovery_only");
  });

  test("validates reviewed intervention records against the current domain contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "tier2-structured-"));
    try {
      const artifactPath = join(root, "intervention-records-corpus-v3-reviewed.json");
      await Bun.write(
        artifactPath,
        JSON.stringify({
          generatedAt: "2026-06-01T00:00:00.000Z",
          documentInterventionRecords: [
            VALID_RECORD,
            { ...VALID_RECORD, recordId: "record-2", primaryTreatments: ["not-a-treatment"] },
          ],
        }),
      );

      const summary = await summarizeTier2StructuredArtifact({
        docsRoot: root,
        path: artifactPath,
      });

      expect(summary?.layer).toBe("reviewed_intervention_records");
      expect(summary?.counts.recordCount).toBe(2);
      expect(summary?.counts.validCurrentRecordSchemaCount).toBe(1);
      expect(summary?.counts.invalidCurrentRecordSchemaCount).toBe(1);
      expect(summary?.warnings[0]).toContain("do not parse");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("builds an inventory and chooses reviewed records over publishable projections", async () => {
    const root = await mkdtemp(join(tmpdir(), "tier2-structured-"));
    try {
      await mkdir(join(root, "gap-roadmap-docs-2026-05-25"), { recursive: true });
      await Bun.write(
        join(root, "gap-roadmap-docs-2026-05-25", "intervention-records-corpus-v3-reviewed.json"),
        JSON.stringify({ documentInterventionRecords: [VALID_RECORD] }),
      );
      await Bun.write(
        join(root, "gap-roadmap-docs-2026-05-25", "intervention-publishable-v1.json"),
        JSON.stringify({ publishableInterventions: [{ recordId: "record-1", routes: ["B44"] }] }),
      );

      const inventory = await buildTier2StructuredDataInventory({
        docsRoot: root,
        output: join(root, "audit.json"),
        markdown: join(root, "audit.md"),
      });

      expect(inventory.summary.artifactCount).toBe(2);
      expect(inventory.summary.bestResearchArtifactPath).toBe(
        "gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed.json",
      );
      expect(inventory.summary.bestPublishableArtifactPath).toBe(
        "gap-roadmap-docs-2026-05-25/intervention-publishable-v1.json",
      );
      expect(inventory.nextActions).toContain(
        "Backfill the full-corpus reviewed intervention-record layer; current reviewed records are from the smaller curated subset.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("includes mta-wiki source alignment artifacts in the inventory scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "tier2-structured-"));
    try {
      await Bun.write(
        join(root, "mta-wiki-source-alignment.json"),
        JSON.stringify({
          artifactKind: "bp.tier2_mta_wiki_source_alignment.v1",
          generatedAt: "2026-06-12T00:00:00.000Z",
          summary: {
            queueSourceCount: 2,
            exactAlignedSourceCount: 1,
            alignedInterventionCandidateRecordCount: 3,
          },
          alignedSources: [
            {
              queueSourceId: "nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb5",
              queueRouteIds: ["BX41"],
              mtaWikiRouteIds: ["BX41"],
            },
          ],
        }),
      );

      const inventory = await buildTier2StructuredDataInventory({
        docsRoot: root,
        output: join(root, "audit.json"),
        markdown: join(root, "audit.md"),
      });

      expect(inventory.summary.artifactCount).toBe(1);
      expect(inventory.artifacts[0]).toMatchObject({
        layer: "mta_wiki_source_alignment",
        trustTier: "discovery_only",
        counts: {
          sourceCount: 2,
          routeCount: 1,
          recordCount: 1,
          candidateCount: 3,
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("includes source-disposition receipt artifacts in the inventory scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "tier2-structured-"));
    try {
      await Bun.write(
        join(root, "source-disposition-receipts.json"),
        JSON.stringify({
          artifactKind: "bp.tier2_source_disposition_receipts.v1",
          generatedAt: "2026-06-12T00:25:00.000Z",
          summary: { receiptCount: 1 },
          receipts: [{ sourceId: "source-1", disposition: "supporting_context_only" }],
        }),
      );

      const inventory = await buildTier2StructuredDataInventory({
        docsRoot: root,
        output: join(root, "audit.json"),
        markdown: join(root, "audit.md"),
      });

      expect(inventory.summary.artifactCount).toBe(1);
      expect(inventory.artifacts[0]).toMatchObject({
        layer: "source_disposition_receipts",
        trustTier: "validated_staging",
        counts: {
          sourceCount: 1,
          recordCount: 1,
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("includes source review pack artifacts in the inventory scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "tier2-structured-"));
    try {
      await Bun.write(
        join(root, "source-review-packs.json"),
        JSON.stringify({
          artifactKind: "bp.tier2_source_review_pack_batch.v1",
          generatedAt: "2026-06-12T01:05:00.000Z",
          summary: {
            selectedSourceCount: 2,
            selectedMtaWikiCandidateRecordCount: 4,
          },
          packs: [
            { sourceId: "source-1", sourceSummary: { routeIds: ["BX41"] } },
            { sourceId: "source-2", sourceSummary: { routeIds: ["M34"] } },
          ],
        }),
      );

      const inventory = await buildTier2StructuredDataInventory({
        docsRoot: root,
        output: join(root, "audit.json"),
        markdown: join(root, "audit.md"),
      });

      expect(inventory.summary.artifactCount).toBe(1);
      expect(inventory.artifacts[0]).toMatchObject({
        layer: "source_review_packs",
        trustTier: "validated_staging",
        counts: {
          sourceCount: 2,
          routeCount: 2,
          recordCount: 2,
          candidateCount: 4,
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
