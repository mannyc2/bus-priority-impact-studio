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

    expect(
      classifyTier2StructuredArtifact({
        fileName: "vocab-materialized-views.json",
        value: { artifactKind: "bp.tier2_vocab_materialized_views.v1" },
      }),
    ).toMatchObject({
      layer: "materialized_research_views",
        trustTier: "validated_staging",
      });

    expect(
      classifyTier2StructuredArtifact({
        fileName: "source-disposition-queue.json",
        value: { artifactKind: "bp.tier2_source_disposition_queue.v1" },
      }),
    ).toMatchObject({
      layer: "source_disposition_queue",
      trustTier: "validated_staging",
    });

    expect(
      classifyTier2StructuredArtifact({
        fileName: "source-review-packs.json",
        value: { artifactKind: "bp.tier2_source_review_pack_batch.v1" },
      }),
    ).toMatchObject({
      layer: "source_review_packs",
      trustTier: "validated_staging",
    });

    expect(
      classifyTier2StructuredArtifact({
        fileName: "source-receipt-closure-audit.json",
        value: { artifactKind: "bp.tier2_source_receipt_closure_audit.v1" },
      }),
    ).toMatchObject({
      layer: "source_receipt_closure_audit",
        trustTier: "validated_staging",
      });

    expect(
      classifyTier2StructuredArtifact({
        fileName: "source-disposition-receipts.json",
        value: { artifactKind: "bp.tier2_source_disposition_receipts.v1" },
      }),
    ).toMatchObject({
      layer: "source_disposition_receipts",
      trustTier: "validated_staging",
    });

    expect(
      classifyTier2StructuredArtifact({
        fileName: "mta-wiki-source-alignment.json",
        value: { artifactKind: "bp.tier2_mta_wiki_source_alignment.v1" },
      }),
    ).toMatchObject({
      layer: "mta_wiki_source_alignment",
      trustTier: "discovery_only",
    });
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

    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "vocab-materialized-views.json",
        value: {
          artifactKind: "bp.tier2_vocab_materialized_views.v1",
          summary: {
            consumerSurfaceRowCount: 78_605,
            detectorFeatureRowCount: 93_893,
            routeEvidenceBundleCount: 236,
            sourceCoverageRowCount: 291,
          },
        },
      }),
    ).toMatchObject({
      layer: "materialized_research_views",
      counts: {
        sourceCount: 291,
        routeCount: 236,
        recordCount: 93_893,
        candidateCount: null,
      },
      warnings: [
        "materialized research views are machine-built review substrate and must not be treated as reviewed or publishable intervention facts",
      ],
    });

    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "source-disposition-queue.json",
        value: {
          artifactKind: "bp.tier2_source_disposition_queue.v1",
          summary: {
            sourceCount: 291,
            reviewQueueItemCount: 291,
            recordCandidateReviewCount: 94,
            uniqueRouteCount: 236,
          },
        },
      }),
    ).toMatchObject({
      layer: "source_disposition_queue",
      counts: {
        sourceCount: 291,
        routeCount: 236,
        recordCount: 291,
        candidateCount: null,
      },
      warnings: [
        "source disposition queue is review scaffolding and must not be treated as reviewed or publishable intervention facts",
      ],
    });

    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "source-review-packs.json",
        value: {
          artifactKind: "bp.tier2_source_review_pack_batch.v1",
          summary: {
            selectedSourceCount: 291,
            selectedMtaWikiCandidateRecordCount: 2_279,
          },
          packs: [
            {
              sourceId: "source-1",
              sourceSummary: { routeIds: ["BX41"] },
              routeContexts: [{ routeId: "BX41" }],
            },
            {
              sourceId: "source-2",
              sourceSummary: { routeIds: ["M34"] },
              routeContexts: [{ routeId: "M34" }],
            },
          ],
        },
      }),
    ).toMatchObject({
      layer: "source_review_packs",
      counts: {
        sourceCount: 291,
        routeCount: 2,
        recordCount: 291,
        candidateCount: 2_279,
      },
      warnings: [
        "source review packs are authoring handoffs and must not be treated as reviewed or publishable intervention facts",
      ],
    });

    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "source-receipt-closure-audit.json",
        value: {
          artifactKind: "bp.tier2_source_receipt_closure_audit.v1",
          summary: {
            queueSourceCount: 291,
            closedSourceCount: 0,
            openSourceCount: 291,
            sourceReceiptClosureStatus: "partial",
          },
          sourceClosures: [{ sourceId: "source-1", status: "open" }],
        },
      }),
    ).toMatchObject({
      layer: "source_receipt_closure_audit",
      counts: {
        sourceCount: 291,
        recordCount: 291,
        candidateCount: null,
      },
      warnings: [
        "source receipt closure audit is a promotion gate and must not be treated as reviewed or publishable intervention facts",
      ],
    });

    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "source-disposition-receipts.json",
        value: {
          artifactKind: "bp.tier2_source_disposition_receipts.v1",
          summary: {
            receiptCount: 3,
            closingDispositionReceiptCount: 1,
            nonClosingDispositionReceiptCount: 2,
          },
          receipts: [
            { sourceId: "source-1", disposition: "supporting_context_only" },
            { sourceId: "source-2", disposition: "needs_more_source_review" },
            { sourceId: "source-3", disposition: "needs_more_source_review" },
          ],
        },
      }),
    ).toMatchObject({
      layer: "source_disposition_receipts",
      counts: {
        sourceCount: 3,
        recordCount: 3,
        candidateCount: null,
      },
      warnings: [
        "source disposition receipts close source accounting only and must not be treated as reviewed or publishable intervention facts",
      ],
    });

    expect(
      summarizeTier2StructuredArtifactValue({
        fileName: "mta-wiki-source-alignment.json",
        value: {
          artifactKind: "bp.tier2_mta_wiki_source_alignment.v1",
          summary: {
            queueSourceCount: 291,
            exactAlignedSourceCount: 174,
            alignedInterventionCandidateRecordCount: 1_820,
          },
          alignedSources: [
            {
              queueSourceId: "nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb5",
              queueRouteIds: ["BX41"],
              mtaWikiRouteIds: ["BX41"],
            },
          ],
        },
      }),
    ).toMatchObject({
      layer: "mta_wiki_source_alignment",
      counts: {
        sourceCount: 291,
        routeCount: 1,
        recordCount: 1,
        candidateCount: 1_820,
      },
      warnings: [
        "mta-wiki source alignment is authoring context and must not be treated as reviewed or publishable intervention facts",
      ],
    });
  });

  test("surfaces full-corpus materialized views without treating them as reviewed", () => {
    const materialized = summarizeTier2StructuredArtifactValue({
      fileName:
        "agentic-runs-20260604/vocab-materialized-views-full-authority-qv1-qv10-manual-vocab-v1/vocab-materialized-views.json",
      value: {
        artifactKind: "bp.tier2_vocab_materialized_views.v1",
        summary: {
          consumerSurfaceRowCount: 78_605,
          detectorFeatureRowCount: 93_893,
          routeEvidenceBundleCount: 236,
          sourceCoverageRowCount: 291,
        },
      },
    });
    const closure = summarizeTier2StructuredArtifactValue({
      fileName:
        "agentic-runs-20260604/source-receipt-closure-full-authority-qv1-qv10-v1/source-receipt-closure-audit.json",
      value: {
        artifactKind: "bp.tier2_source_receipt_closure_audit.v1",
        summary: {
          queueSourceCount: 291,
          closedSourceCount: 0,
          openSourceCount: 291,
          sourceReceiptClosureStatus: "partial",
        },
        sourceClosures: [{ sourceId: "source-1", status: "open" }],
      },
    });

    const inventory = buildTier2StructuredDataInventoryFromArtifacts({
      generatedAt: "2026-06-11T00:00:00.000Z",
      docsRoot: "/tmp/docs",
      outputPath: "/tmp/audit.json",
      markdownPath: "/tmp/audit.md",
      artifacts: [
        {
          ...materialized,
          path: "/tmp/docs/agentic-runs-20260604/vocab-materialized-views-full-authority-qv1-qv10-manual-vocab-v1/vocab-materialized-views.json",
          relativePath:
            "agentic-runs-20260604/vocab-materialized-views-full-authority-qv1-qv10-manual-vocab-v1/vocab-materialized-views.json",
          byteLength: 10,
        },
        {
          ...closure,
          path: "/tmp/docs/agentic-runs-20260604/source-receipt-closure-full-authority-qv1-qv10-v1/source-receipt-closure-audit.json",
          relativePath:
            "agentic-runs-20260604/source-receipt-closure-full-authority-qv1-qv10-v1/source-receipt-closure-audit.json",
          byteLength: 20,
        },
      ],
    });

    expect(inventory.summary).toMatchObject({
      reviewedResearchArtifactCount: 0,
      publishableArtifactCount: 0,
      materializedResearchViewArtifactCount: 1,
      bestResearchArtifactPath: null,
      bestPublishableArtifactPath: null,
    });
    expect(inventory.nextActions).toEqual([
      "Create a reviewed full-corpus intervention-record artifact that conforms to bp.document_intervention_record.v1.",
      "Use the full-corpus qv1-qv10 materialized research views to drive source dispositions and reviewed-record generation; do not promote them directly.",
      "Close the full-corpus source receipt audit; 291 source(s) still need valid reviewed records or source disposition receipts.",
      "Backfill the full-corpus reviewed intervention-record layer; current reviewed records are from the smaller curated subset.",
      "Generate the publishable intervention projection from the reviewed record corpus.",
    ]);
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
