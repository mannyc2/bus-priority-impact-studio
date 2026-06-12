import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildTier2SourceDispositionQueue,
  runTier2SourceDispositionQueue,
} from "../../../../src/commands/docs/tier2/_source-disposition-queue.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-source-disposition-queue");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function seedMaterializedViews(): Promise<string> {
  const materializedViewsPath = join(workingRoot, "vocab-materialized-views.json");
  await writeJson(materializedViewsPath, {
    artifactKind: "bp.tier2_vocab_materialized_views.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-10T00:00:00.000Z",
    sourceConsumerIndexPath: "/repo/vocab-consumer-index.json",
    sourceConsumerIndexGeneratedAt: "2026-06-09T00:00:00.000Z",
    summary: {
      consumerSurfaceRowCount: 100,
      consumerFieldRowCount: 120,
      consumerUnresolvedRowCount: 8,
      routeEvidenceBundleCount: 2,
      routeLinkedSurfaceCount: 4,
      detectorFeatureRowCount: 140,
      routeLinkedDetectorFeatureRowCount: 120,
      sourceContextDetectorFeatureRowCount: 20,
      unresolvedReviewItemCount: 3,
      sourceCoverageRowCount: 3,
      featureUseCounts: {},
      topRouteEvidenceBundles: [],
      deferredQaFlags: {},
      sourceConsumerIndexSummary: {},
    },
    routeEvidenceBundles: [],
    detectorFeatureRows: [],
    unresolvedReviewQueue: [],
    sourceCoverageRows: [
      {
        sourceId: "source-event",
        sourceTitle: "Event Source",
        sourceGroup: "bus_priority_document",
        surfaceCount: 12,
        mappedFieldCount: 20,
        unresolvedFieldCount: 3,
        pageNumbers: [1, 2, 3],
        surfaceKindCounts: {
          event_candidate: 2,
          treatment_component: 1,
          metric_observation: 1,
        },
        routeCount: 3,
        routeIds: ["B46", "B46+", "Q1"],
        keyCounts: {
          eventFamily: 2,
          eventTreatmentFamily: 1,
          metricFamily: 1,
        },
        unresolvedByDecision: { preserve_raw: 3 },
        evidencePointerIds: ["ev-1", "ev-2"],
        evidencePointerCount: 2,
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
        sourceId: "source-metric",
        sourceTitle: "Metric Source",
        sourceGroup: "report",
        surfaceCount: 8,
        mappedFieldCount: 7,
        unresolvedFieldCount: 0,
        pageNumbers: [4],
        surfaceKindCounts: {
          metric_observation: 2,
          claim: 1,
        },
        routeCount: 1,
        routeIds: ["B41"],
        keyCounts: {
          metricFamily: 2,
          claimKind: 1,
        },
        unresolvedByDecision: {},
        evidencePointerIds: [],
        evidencePointerCount: 0,
        sampleSurfaces: [],
      },
      {
        sourceId: "source-context",
        sourceTitle: "Context Source",
        sourceGroup: null,
        surfaceCount: 2,
        mappedFieldCount: 2,
        unresolvedFieldCount: 0,
        pageNumbers: [9],
        surfaceKindCounts: {
          context_signal: 1,
          review_question: 1,
        },
        routeCount: 0,
        routeIds: [],
        keyCounts: {
          contextKind: 1,
          questionKind: 1,
        },
        unresolvedByDecision: {},
        evidencePointerIds: [],
        evidencePointerCount: 0,
        sampleSurfaces: [],
      },
    ],
  });
  return materializedViewsPath;
}

describe("Tier 2 source disposition queue", () => {
  test("builds deterministic source review lanes without promoting facts", async () => {
    const materializedViewsPath = await seedMaterializedViews();

    const artifact = await buildTier2SourceDispositionQueue({
      materializedViewsPath,
      generatedAt: "2026-06-11T00:00:00.000Z",
      maxRoutesPerSource: 2,
    });

    expect(artifact.artifactKind).toBe("bp.tier2_source_disposition_queue.v1");
    expect(artifact.summary).toMatchObject({
      sourceCount: 3,
      reviewQueueItemCount: 3,
      recordCandidateReviewCount: 1,
      sourceDispositionReviewCount: 2,
      highPrioritySourceCount: 1,
      mediumPrioritySourceCount: 1,
      lowPrioritySourceCount: 1,
      routeLinkedSourceCount: 2,
      uniqueRouteCount: 4,
      reviewReceiptMissingCount: 3,
      reviewReceiptSatisfiedCount: 0,
      publicPromotionStatus: "not_ready",
    });
    expect(artifact.summary.promotionBlockers.length).toBeGreaterThan(0);
    expect(artifact.items.map((item) => item.queueRef)).toEqual(["s001", "s002", "s003"]);

    const eventSource = artifact.items[0];
    if (eventSource === undefined) throw new Error("Expected a top source disposition item.");
    expect(eventSource).toMatchObject({
      sourceId: "source-event",
      reviewLane: "record_candidate_review",
      priority: "high",
      suggestedDisposition: "author_reviewed_intervention_record",
      reviewReceiptStatus: "needs_review_receipt",
      publicPromotionStatus: "not_ready",
      sampleRouteIds: ["B46", "B46+"],
      candidateSignals: {
        eventCandidateSurfaceCount: 2,
        treatmentComponentSurfaceCount: 1,
        eventTreatmentKeyCount: 3,
        eventOrTreatmentSignalCount: 6,
      },
    });
    expect(eventSource.reviewFlags).toEqual(
      expect.arrayContaining(["event_or_treatment_signal", "unresolved_fields_present"]),
    );

    expect(artifact.items[1]).toMatchObject({
      sourceId: "source-metric",
      reviewLane: "source_disposition_review",
      priority: "medium",
      suggestedDisposition: "write_source_disposition_receipt",
    });
    expect(artifact.items[2]).toMatchObject({
      sourceId: "source-context",
      priority: "low",
      sourceGroup: null,
    });
  });

  test("writes JSON, summary, and Markdown queue artifacts", async () => {
    const materializedViewsPath = await seedMaterializedViews();
    const outputPath = join(workingRoot, "out", "source-disposition-queue.json");

    const result = await runTier2SourceDispositionQueue({
      materializedViewsPath,
      outputPath,
      generatedAt: "2026-06-11T00:30:00.000Z",
      maxMarkdownRows: 2,
    });

    expect(result.artifact.summary.sourceCount).toBe(3);
    expect(await Bun.file(result.outputPath).exists()).toBe(true);
    expect(await Bun.file(result.summaryPath).exists()).toBe(true);
    const markdown = await Bun.file(result.markdownPath).text();
    expect(markdown).toContain("# Tier 2 Source Disposition Queue");
    expect(markdown).toContain("Public promotion status: not_ready");
    expect(markdown).toContain("source-event");
    expect(markdown).toContain("source-metric");
    expect(markdown).not.toContain("source-context");
  });
});
