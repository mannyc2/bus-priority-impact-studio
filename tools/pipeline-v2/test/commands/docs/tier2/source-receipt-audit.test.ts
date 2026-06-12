import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildTier2SourceReceiptClosureAudit,
  runTier2SourceReceiptClosureAudit,
} from "../../../../src/commands/docs/tier2/_source-receipt-audit.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-source-receipt-audit");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    recordId: "record-1",
    sourceId: "source-record",
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
    ...overrides,
  };
}

function queueItem(sourceId: string, queueRef: string, reviewLane = "record_candidate_review") {
  return {
    queueRef,
    sourceId,
    sourceTitle: `${sourceId} title`,
    sourceGroup: "fixture",
    reviewLane,
    priority: reviewLane === "source_disposition_review" ? "low" : "high",
    suggestedDisposition:
      reviewLane === "source_disposition_review"
        ? "write_source_disposition_receipt"
        : "author_reviewed_intervention_record",
    reviewReceiptStatus: "needs_review_receipt",
    publicPromotionStatus: "not_ready",
    surfaceCount: 1,
    mappedFieldCount: 1,
    unresolvedFieldCount: 0,
    routeCount: reviewLane === "source_disposition_review" ? 0 : 1,
    routeIds: reviewLane === "source_disposition_review" ? [] : ["B44"],
    sampleRouteIds: reviewLane === "source_disposition_review" ? [] : ["B44"],
    pageNumbers: [1],
    evidencePointerCount: 1,
    evidencePointerIds: ["ev-1"],
    candidateSignals: {
      eventCandidateSurfaceCount: reviewLane === "source_disposition_review" ? 0 : 1,
      serviceChangeCandidateSurfaceCount: 0,
      treatmentComponentSurfaceCount: 0,
      metricObservationSurfaceCount: 0,
      claimSurfaceCount: 0,
      contextSignalSurfaceCount: reviewLane === "source_disposition_review" ? 1 : 0,
      reviewQuestionSurfaceCount: 0,
      tableSurfaceCount: 0,
      eventTreatmentKeyCount: 0,
      eventOrTreatmentSignalCount: reviewLane === "source_disposition_review" ? 0 : 1,
    },
    surfaceKindCounts: {},
    keyCounts: {},
    unresolvedByDecision: {},
    reviewFlags: [],
    sampleSurfaces: [],
  };
}

async function seedArtifacts() {
  const queuePath = join(workingRoot, "source-disposition-queue.json");
  const reviewedRecordsPath = join(workingRoot, "reviewed-records.json");
  const sourceDispositionsPath = join(workingRoot, "source-dispositions.json");

  await writeJson(queuePath, {
    artifactKind: "bp.tier2_source_disposition_queue.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-11T00:00:00.000Z",
    sourceMaterializedViewsPath: "/repo/materialized.json",
    sourceMaterializedViewsGeneratedAt: "2026-06-10T00:00:00.000Z",
    summary: { sourceCount: 4 },
    policy: {},
    items: [
      queueItem("source-record", "s001"),
      queueItem("source-disposition", "s002", "source_disposition_review"),
      queueItem("source-open", "s003"),
      queueItem("source-conflict", "s004"),
    ],
  });

  await writeJson(reviewedRecordsPath, {
    artifactKind: "bp.tier2_reviewed_records_fixture.v1",
    documentInterventionRecords: [
      validRecord(),
      validRecord({ recordId: "record-conflict", sourceId: "source-conflict" }),
      validRecord({ recordId: "record-orphan", sourceId: "source-orphan" }),
      validRecord({
        recordId: "record-invalid",
        sourceId: "source-open",
        primaryTreatments: ["not-a-treatment"],
      }),
    ],
  });

  await writeJson(sourceDispositionsPath, {
    artifactKind: "bp.tier2_source_disposition_receipts_fixture.v1",
    receipts: [
      {
        sourceId: "source-disposition",
        queueRef: "s002",
        disposition: "supporting_context_only",
        rationale: "Background source only.",
      },
      {
        sourceId: "source-open",
        queueRef: "s003",
        disposition: "reviewed_records_authored",
        reviewedRecordIds: ["record-invalid"],
      },
      {
        sourceId: "source-conflict",
        queueRef: "s004",
        disposition: "no_actionable_bus_priority_intervention",
      },
      {
        sourceId: "source-orphan",
        disposition: "suppressed",
      },
      {
        sourceId: "source-open",
        disposition: "unknown_disposition",
      },
    ],
  });

  return { queuePath, reviewedRecordsPath, sourceDispositionsPath };
}

describe("Tier 2 source receipt closure audit", () => {
  test("audits reviewed records and source disposition receipts against queue closure", async () => {
    const { queuePath, reviewedRecordsPath, sourceDispositionsPath } = await seedArtifacts();

    const artifact = await buildTier2SourceReceiptClosureAudit({
      queuePath,
      reviewedRecordsPaths: [reviewedRecordsPath],
      sourceDispositionsPaths: [sourceDispositionsPath],
      generatedAt: "2026-06-11T02:00:00.000Z",
    });

    expect(artifact.artifactKind).toBe("bp.tier2_source_receipt_closure_audit.v1");
    expect(artifact.summary).toMatchObject({
      queueSourceCount: 4,
      validReviewedRecordCount: 3,
      invalidReviewedRecordCount: 1,
      reviewedRecordSourceCount: 3,
      orphanReviewedRecordSourceCount: 1,
      dispositionReceiptCount: 4,
      invalidDispositionReceiptCount: 1,
      closingDispositionReceiptCount: 3,
      nonClosingDispositionReceiptCount: 1,
      orphanDispositionReceiptCount: 1,
      closedSourceCount: 2,
      closedByRecordCount: 1,
      closedByDispositionCount: 1,
      openSourceCount: 1,
      conflictSourceCount: 1,
      sourceReceiptClosureStatus: "partial",
      publicPromotionStatus: "not_ready",
    });
    expect(artifact.summary.blockers.join("\n")).toContain(
      "1 source(s) still lack a valid reviewed record",
    );

    const rowsBySource = new Map(artifact.sourceClosures.map((row) => [row.sourceId, row]));
    expect(rowsBySource.get("source-record")?.status).toBe("closed_by_record");
    expect(rowsBySource.get("source-disposition")?.status).toBe("closed_by_disposition");
    expect(rowsBySource.get("source-conflict")?.status).toBe("conflict");
    expect(rowsBySource.get("source-open")).toMatchObject({
      status: "open",
      validRecordCount: 0,
      invalidRecordCount: 1,
      receiptDispositions: ["reviewed_records_authored"],
    });
    expect(rowsBySource.get("source-open")?.statusReasons).toEqual([
      "invalid_reviewed_records_present",
      "no_valid_reviewed_record_or_closing_source_disposition",
      "non_closing_disposition_only",
      "record_authored_receipt_without_valid_record",
    ]);
    expect(artifact.invalidDispositionReceipts[0]?.reason).toContain("disposition must be");
    expect(artifact.orphanReviewedRecordRefs).toEqual([
      { sourceId: "source-orphan", recordIds: ["record-orphan"] },
    ]);
    expect(artifact.orphanDispositionReceipts[0]).toMatchObject({
      sourceId: "source-orphan",
      disposition: "suppressed",
    });
  });

  test("writes JSON, summary, and Markdown artifacts", async () => {
    const { queuePath } = await seedArtifacts();
    const outputPath = join(workingRoot, "out", "source-receipt-closure-audit.json");

    const result = await runTier2SourceReceiptClosureAudit({
      queuePath,
      outputPath,
      generatedAt: "2026-06-11T02:30:00.000Z",
      maxMarkdownRows: 2,
    });

    expect(result.artifact.summary).toMatchObject({
      queueSourceCount: 4,
      closedSourceCount: 0,
      openSourceCount: 4,
      sourceReceiptClosureStatus: "partial",
    });
    expect(await Bun.file(result.outputPath).exists()).toBe(true);
    expect(await Bun.file(result.summaryPath).exists()).toBe(true);
    const markdown = await Bun.file(result.markdownPath).text();
    expect(markdown).toContain("# Tier 2 Source Receipt Closure Audit");
    expect(markdown).toContain("Open sources: 4");
    expect(markdown).toContain("Public projection remains blocked");
  });
});
