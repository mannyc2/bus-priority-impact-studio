import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildTier2SourceReviewPackBatch,
  runTier2SourceReviewPackBatch,
} from "../../../../src/commands/docs/tier2/_source-review-pack.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-source-review-pack");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function seedArtifacts(): Promise<{
  queuePath: string;
  materializedViewsPath: string;
  mtaWikiAlignmentPath: string;
}> {
  const materializedViewsPath = join(workingRoot, "vocab-materialized-views.json");
  const queuePath = join(workingRoot, "source-disposition-queue.json");
  const mtaWikiAlignmentPath = join(workingRoot, "mta-wiki-source-alignment.json");
  await writeJson(materializedViewsPath, {
    artifactKind: "bp.tier2_vocab_materialized_views.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-10T00:00:00.000Z",
    sourceConsumerIndexPath: "/repo/vocab-consumer-index.json",
    sourceConsumerIndexGeneratedAt: "2026-06-09T00:00:00.000Z",
    summary: { sourceCoverageRowCount: 2 },
    sourceCoverageRows: [],
    detectorFeatureRows: [
      {
        featureId: "feature-event",
        featureUse: "event_or_treatment_feature",
        routeScope: "route_linked",
        routeIds: ["B46"],
        surfaceId: "surface-event",
        sourceId: "source-event",
        sourceGroup: "bus_priority_document",
        pageNumbers: [1],
        surfaceKind: "event_candidate",
        displayLabel: "B46 SBS began",
        artifactPath: "/repo/source-event/p1.json",
        payloadSchemaId: "event/v1",
        keyId: "eventFamily",
        sourceFieldPath: "raw.event",
        targetPayloadPath: "canonical.eventFamily",
        rawValue: "SBS began",
        canonicalLeafId: "implementation_milestone",
        canonicalLeafLabel: "Implementation milestone",
        coarseFamily: "project_delivery",
        modifiers: {},
        supportIds: ["support-1"],
        evidencePointerIds: ["ev-1"],
        projectionInputCount: 1,
      },
      {
        featureId: "feature-metric",
        featureUse: "metric_feature",
        routeScope: "route_linked",
        routeIds: ["B46"],
        surfaceId: "surface-metric",
        sourceId: "source-event",
        sourceGroup: "bus_priority_document",
        pageNumbers: [2],
        surfaceKind: "metric_observation",
        displayLabel: "B46 ridership",
        artifactPath: "/repo/source-event/p2.json",
        payloadSchemaId: "metric/v1",
        keyId: "metricFamily",
        sourceFieldPath: "raw.metric",
        targetPayloadPath: "canonical.metricFamily",
        rawValue: "ridership",
        canonicalLeafId: "average_weekday_ridership",
        canonicalLeafLabel: "Average weekday ridership",
        coarseFamily: "ridership",
        modifiers: {},
        supportIds: [],
        evidencePointerIds: [],
        projectionInputCount: 1,
      },
      {
        featureId: "feature-context",
        featureUse: "document_context_feature",
        routeScope: "source_context",
        routeIds: [],
        surfaceId: "surface-context",
        sourceId: "source-context",
        sourceGroup: "report",
        pageNumbers: [9],
        surfaceKind: "context_signal",
        displayLabel: "Open house",
        artifactPath: "/repo/source-context/p9.json",
        payloadSchemaId: "context/v1",
        keyId: "contextKind",
        sourceFieldPath: "raw.context",
        targetPayloadPath: "canonical.contextKind",
        rawValue: "open house",
        canonicalLeafId: "public_outreach",
        canonicalLeafLabel: "Public outreach",
        coarseFamily: "engagement",
        modifiers: {},
        supportIds: [],
        evidencePointerIds: [],
        projectionInputCount: 1,
      },
    ],
    unresolvedReviewQueue: [
      {
        reviewItemId: "review-1",
        keyId: "eventTreatmentFamily",
        decision: "preserve_raw",
        rawValue: "SBS features",
        reason: "Needs reviewer mapping.",
        coarseFamily: "bus_priority_treatment",
        rowCount: 2,
        surfaceCount: 1,
        sourceCount: 1,
        routeIds: ["B46"],
        sourceIds: ["source-event"],
        surfaceKindCounts: { treatment_component: 1 },
        supportIds: ["support-2"],
        evidencePointerIds: ["ev-2"],
        sampleSurfaces: [
          {
            surfaceId: "surface-treatment",
            surfaceKind: "treatment_component",
            sourceId: "source-event",
            sourceTitle: "Event Source",
            pageNumbers: [3],
            displayLabel: "SBS feature list",
            artifactPath: "/repo/source-event/p3.json",
          },
        ],
      },
    ],
    routeEvidenceBundles: [
      {
        routeId: "B46",
        surfaceCount: 4,
        mappedFieldCount: 7,
        unresolvedFieldCount: 2,
        sourceCount: 1,
        sourceIds: ["source-event"],
        sourceGroupCounts: { bus_priority_document: 1 },
        sourcePageRefs: [{ sourceId: "source-event", sourceTitle: "Event Source", pageNumbers: [1, 2, 3] }],
        surfaceKindCounts: { event_candidate: 1 },
        keyCounts: { eventFamily: 1 },
        coarseFamilyCounts: { project_delivery: 1 },
        featureUseCounts: {},
        timelineCandidateSurfaceCount: 1,
        metricObservationSurfaceCount: 1,
        treatmentSurfaceCount: 1,
        claimSurfaceCount: 0,
        supportIds: ["support-1"],
        evidencePointerIds: ["ev-1", "ev-2"],
        evidencePointerCount: 2,
        sampleSurfaces: [],
      },
    ],
  });
  await writeJson(queuePath, {
    artifactKind: "bp.tier2_source_disposition_queue.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-11T00:00:00.000Z",
    sourceMaterializedViewsPath: materializedViewsPath,
    sourceMaterializedViewsGeneratedAt: "2026-06-10T00:00:00.000Z",
    summary: {
      sourceCount: 2,
      reviewQueueItemCount: 2,
      recordCandidateReviewCount: 1,
      sourceDispositionReviewCount: 1,
      highPrioritySourceCount: 1,
      reviewReceiptMissingCount: 2,
      publicPromotionStatus: "not_ready",
      promotionBlockers: ["fixture"],
    },
    policy: {},
    items: [
      {
        queueRef: "s001",
        sourceId: "source-event",
        sourceTitle: "Event Source",
        sourceGroup: "bus_priority_document",
        reviewLane: "record_candidate_review",
        priority: "high",
        suggestedDisposition: "author_reviewed_intervention_record",
        reviewReceiptStatus: "needs_review_receipt",
        publicPromotionStatus: "not_ready",
        surfaceCount: 8,
        mappedFieldCount: 7,
        unresolvedFieldCount: 2,
        routeCount: 1,
        routeIds: ["B46"],
        sampleRouteIds: ["B46"],
        pageNumbers: [1, 2, 3],
        evidencePointerCount: 2,
        evidencePointerIds: ["ev-1", "ev-2"],
        candidateSignals: {
          eventCandidateSurfaceCount: 1,
          serviceChangeCandidateSurfaceCount: 0,
          treatmentComponentSurfaceCount: 1,
          metricObservationSurfaceCount: 1,
          claimSurfaceCount: 0,
          contextSignalSurfaceCount: 0,
          reviewQuestionSurfaceCount: 0,
          tableSurfaceCount: 0,
          eventTreatmentKeyCount: 1,
          eventOrTreatmentSignalCount: 3,
        },
        surfaceKindCounts: { event_candidate: 1 },
        keyCounts: { eventFamily: 1 },
        unresolvedByDecision: { preserve_raw: 2 },
        reviewFlags: ["event_or_treatment_signal", "unresolved_fields_present"],
        sampleSurfaces: [
          {
            surfaceId: "surface-event",
            surfaceKind: "event_candidate",
            routeIds: ["B46"],
            pageNumbers: [1],
            displayLabel: "B46 SBS began",
            artifactPath: "/repo/source-event/p1.json",
          },
        ],
      },
      {
        queueRef: "s002",
        sourceId: "source-context",
        sourceTitle: "Context Source",
        sourceGroup: "report",
        reviewLane: "source_disposition_review",
        priority: "low",
        suggestedDisposition: "write_source_disposition_receipt",
        reviewReceiptStatus: "needs_review_receipt",
        publicPromotionStatus: "not_ready",
        surfaceCount: 2,
        mappedFieldCount: 1,
        unresolvedFieldCount: 0,
        routeCount: 0,
        routeIds: [],
        sampleRouteIds: [],
        pageNumbers: [9],
        evidencePointerCount: 0,
        evidencePointerIds: [],
        candidateSignals: {
          eventCandidateSurfaceCount: 0,
          serviceChangeCandidateSurfaceCount: 0,
          treatmentComponentSurfaceCount: 0,
          metricObservationSurfaceCount: 0,
          claimSurfaceCount: 0,
          contextSignalSurfaceCount: 1,
          reviewQuestionSurfaceCount: 0,
          tableSurfaceCount: 0,
          eventTreatmentKeyCount: 0,
          eventOrTreatmentSignalCount: 0,
        },
        surfaceKindCounts: { context_signal: 1 },
        keyCounts: { contextKind: 1 },
        unresolvedByDecision: {},
        reviewFlags: ["no_route_links", "no_evidence_pointers", "context_or_process_heavy"],
        sampleSurfaces: [],
      },
    ],
  });
  await writeJson(mtaWikiAlignmentPath, {
    artifactKind: "bp.tier2_mta_wiki_source_alignment.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-12T00:05:00.000Z",
    summary: {
      queueSourceCount: 2,
      exactAlignedSourceCount: 1,
      alignedInterventionCandidateRecordCount: 3,
    },
    alignedSources: [
      {
        queueRef: "s001",
        queueSourceId: "source-event",
        queueSourceTitle: "Event Source",
        reviewLane: "record_candidate_review",
        priority: "high",
        queueRouteIds: ["B46"],
        mtaWikiGroupId: "mta_wiki:source-event",
        mtaWikiSourceId: "source-event",
        mtaWikiSourceLabel: "Event Source",
        alignmentKind: "exact_normalized_source_key",
        alignmentKeys: ["sourceevent"],
        mtaWikiRouteIds: ["B46"],
        projectIds: ["project-b46"],
        eventIds: ["event-b46-launch"],
        treatmentComponentIds: ["treatment-b46-bus-lane"],
        relationIds: ["relation-b46-route"],
        candidateRecordCount: 3,
        evidenceRefCount: 2,
        promotionReadiness: {
          status: "needs_manual_review",
          reasons: ["not yet collapsed to bp.document_intervention_record.v1"],
        },
      },
    ],
  });
  return { queuePath, materializedViewsPath, mtaWikiAlignmentPath };
}

describe("Tier 2 source review pack batch", () => {
  test("builds source-scoped review packs from queue and materialized evidence", async () => {
    const { queuePath } = await seedArtifacts();
    const artifact = await buildTier2SourceReviewPackBatch({
      queuePath,
      generatedAt: "2026-06-11T01:00:00.000Z",
      top: 1,
      maxFeatureRows: 2,
      maxUnresolvedItems: 5,
    });

    expect(artifact.artifactKind).toBe("bp.tier2_source_review_pack_batch.v1");
    expect(artifact.summary).toMatchObject({
      selectedSourceCount: 1,
      queueSourceCount: 2,
      recordCandidateReviewCount: 1,
      sourceDispositionReviewCount: 0,
      publicPromotionStatus: "not_ready",
      reviewReceiptMissingCount: 1,
    });
    const pack = artifact.packs[0];
    if (pack === undefined) throw new Error("Expected a source review pack.");
    expect(pack).toMatchObject({
      sourceId: "source-event",
      reviewLane: "record_candidate_review",
      priority: "high",
      reviewReceiptStatus: "needs_review_receipt",
      publicPromotionStatus: "not_ready",
      receiptTemplate: {
        sourceId: "source-event",
        queueRef: "s001",
        disposition: null,
        reviewedRecordIds: [],
      },
    });
    expect(pack.featureRows.map((row) => row.featureId)).toEqual(["feature-event", "feature-metric"]);
    expect(pack.unresolvedItems[0]?.reviewItemId).toBe("review-1");
    expect(pack.routeContexts[0]).toMatchObject({
      routeId: "B46",
      timelineCandidateSurfaceCount: 1,
      sourcePageNumbers: [1, 2, 3],
    });
    expect(pack.reviewInstructions.join("\n")).toContain("Unresolved vocab fields remain");
  });

  test("attaches mta-wiki alignment context without treating it as a receipt", async () => {
    const { queuePath, mtaWikiAlignmentPath } = await seedArtifacts();
    const artifact = await buildTier2SourceReviewPackBatch({
      queuePath,
      mtaWikiAlignmentPath,
      generatedAt: "2026-06-12T01:00:00.000Z",
      top: 1,
    });

    expect(artifact.mtaWikiAlignmentPath).toBe(mtaWikiAlignmentPath);
    expect(artifact.mtaWikiAlignmentGeneratedAt).toBe("2026-06-12T00:05:00.000Z");
    expect(artifact.summary).toMatchObject({
      selectedSourceCount: 1,
      selectedMtaWikiAlignedSourceCount: 1,
      selectedMtaWikiCandidateRecordCount: 3,
      reviewReceiptMissingCount: 1,
      publicPromotionStatus: "not_ready",
    });
    expect(artifact.summary.promotionBlockers.join("\n")).toContain(
      "mta-wiki aligned rows are supplementary review context",
    );
    const pack = artifact.packs[0];
    if (pack === undefined) throw new Error("Expected a source review pack.");
    expect(pack.sourceSummary).toMatchObject({
      mtaWikiContextCount: 1,
      mtaWikiCandidateRecordCount: 3,
    });
    expect(pack.mtaWikiContext[0]).toMatchObject({
      mtaWikiGroupId: "mta_wiki:source-event",
      routeIds: ["B46"],
      projectIds: ["project-b46"],
      candidateRecordCount: 3,
      promotionReadiness: { status: "needs_manual_review" },
    });
    expect(pack.reviewInstructions.join("\n")).toContain("supplementary authoring context");
  });

  test("writes JSON, summary, and Markdown artifacts", async () => {
    const { queuePath } = await seedArtifacts();
    const outputPath = join(workingRoot, "out", "source-review-pack-batch.json");

    const result = await runTier2SourceReviewPackBatch({
      queuePath,
      outputPath,
      generatedAt: "2026-06-11T01:30:00.000Z",
      reviewLane: "source_disposition_review",
    });

    expect(result.artifact.summary.selectedSourceCount).toBe(1);
    expect(result.artifact.packs[0]?.sourceId).toBe("source-context");
    expect(await Bun.file(result.outputPath).exists()).toBe(true);
    expect(await Bun.file(result.summaryPath).exists()).toBe(true);
    const markdown = await Bun.file(result.markdownPath).text();
    expect(markdown).toContain("# Tier 2 Source Review Pack Batch");
    expect(markdown).toContain("source-context");
    expect(markdown).toContain("Do not publish facts from this pack");
  });
});
