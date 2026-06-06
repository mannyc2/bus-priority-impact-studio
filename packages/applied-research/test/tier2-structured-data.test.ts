import { describe, expect, test } from "bun:test";
import {
  buildTier2StructuredDataInventoryFromArtifacts,
  classifyTier2StructuredArtifact,
  renderTier2StructuredDataInventoryMarkdown,
  summarizeTier2StructuredArtifactValue,
} from "../src/evaluation";

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

describe("Tier 2 structured data evaluation", () => {
  test("classifies research, serving, and discovery artifacts", () => {
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

  test("summarizes counts, schema validity, and warnings from artifact values", () => {
    const summary = summarizeTier2StructuredArtifactValue({
      fileName: "intervention-records-corpus-v3-reviewed.json",
      value: {
        generatedAt: "2026-06-01T00:00:00.000Z",
        summary: { reviewed: 2 },
        documentInterventionRecords: [
          VALID_RECORD,
          { ...VALID_RECORD, recordId: "record-2", primaryTreatments: ["not-a-treatment"] },
        ],
      },
    });

    expect(summary.layer).toBe("reviewed_intervention_records");
    expect(summary.generatedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(summary.summary).toEqual({ reviewed: 2 });
    expect(summary.counts.recordCount).toBe(2);
    expect(summary.counts.routeCount).toBe(1);
    expect(summary.counts.sourceCount).toBe(1);
    expect(summary.counts.validCurrentRecordSchemaCount).toBe(1);
    expect(summary.counts.invalidCurrentRecordSchemaCount).toBe(1);
    expect(summary.warnings[0]).toContain("do not parse");
  });

  test("warns when discovery and serving-adjacent artifacts are not research substrate", () => {
    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "candidate-bundle-combined.json",
        value: { documentSourceCandidates: [{ sourceId: "a", routes: ["B44"] }] },
      }).warnings,
    ).toContain("candidate bundle is recall-oriented and must not be treated as reviewed facts");

    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "route-projection.json",
        value: { interventionsByRoute: { B44: [{ routeId: "B44" }] } },
      }).warnings,
    ).toContain("route projection is lossy and should not be used as the research substrate");
  });

  test("builds inventory summary, best artifacts, and next actions from artifact summaries", () => {
    const reviewed = summarizeTier2StructuredArtifactValue({
      fileName: "tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json",
      value: { documentInterventionRecords: [VALID_RECORD] },
    });
    const publishable = summarizeTier2StructuredArtifactValue({
      fileName: "intervention-publishable-v1.json",
      value: { publishableInterventions: [{ recordId: "record-1", routes: ["B44"] }] },
    });
    const inventory = buildTier2StructuredDataInventoryFromArtifacts({
      generatedAt: "2026-06-06T00:00:00.000Z",
      docsRoot: "/tmp/docs",
      outputPath: "/tmp/audit.json",
      markdownPath: "/tmp/audit.md",
      artifacts: [
        {
          ...publishable,
          path: "/tmp/docs/intervention-publishable-v1.json",
          relativePath: "intervention-publishable-v1.json",
          byteLength: 10,
        },
        {
          ...reviewed,
          path: "/tmp/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json",
          relativePath:
            "tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json",
          byteLength: 20,
        },
      ],
    });

    expect(inventory.summary).toMatchObject({
      artifactCount: 2,
      reviewedResearchArtifactCount: 1,
      publishableArtifactCount: 1,
      bestResearchArtifactPath:
        "tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json",
      bestPublishableArtifactPath: "intervention-publishable-v1.json",
    });
    expect(inventory.artifacts.map((artifact) => artifact.relativePath)).toEqual([
      "intervention-publishable-v1.json",
      "tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json",
    ]);
    expect(inventory.nextActions).toEqual([
      "No Tier 2 structured-data inventory gaps found for the scanned docs root.",
    ]);
  });

  test("renders inventory markdown from the package-owned inventory contract", () => {
    const candidate = summarizeTier2StructuredArtifactValue({
      fileName: "candidate-bundle-combined.json",
      value: { documentSourceCandidates: [{ sourceId: "source-1", routes: ["B44"] }] },
    });
    const inventory = buildTier2StructuredDataInventoryFromArtifacts({
      generatedAt: "2026-06-06T00:00:00.000Z",
      docsRoot: "/tmp/docs",
      outputPath: "/tmp/audit.json",
      markdownPath: "/tmp/audit.md",
      artifacts: [
        {
          ...candidate,
          path: "/tmp/docs/candidate-bundle-combined.json",
          relativePath: "candidate-bundle-combined.json",
          byteLength: 10,
        },
      ],
    });

    const markdown = renderTier2StructuredDataInventoryMarkdown(inventory);

    expect(markdown).toContain("# Tier 2 Structured Data Inventory");
    expect(markdown).toContain("`candidate_bundle`");
    expect(markdown).toContain("candidate bundle is recall-oriented");
    expect(markdown).toContain("## Next Actions");
  });
});
