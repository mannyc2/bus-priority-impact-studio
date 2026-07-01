// biome-ignore-all lint/style/noNonNullAssertion: Fixture assertions intentionally index rows after explicit length/content checks.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promotePublishableInterventions } from "../../../../src/commands/docs/tier2/_shared.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-promote-publishable-interventions");

type RecordSeed = {
  recordId: string;
  sourceId: string;
  recordKind?: "implemented" | "in_progress" | "proposed";
  routes?: string[];
  primaryTreatments?: string[];
  evidenceCandidateIds?: string[];
};

async function seed(input: {
  caseName: string;
  records: RecordSeed[];
  reviews: Array<{
    recordId: string;
    disposition: string;
    confidence?: string;
    rationale?: string;
    issueTags?: string[];
  }>;
  candidates?: Array<{
    candidateId: string;
    evidenceQuote: string;
    sourceTitle?: string;
    sourceUrl?: string;
  }>;
}): Promise<{
  reviewedCorpusPath: string;
  manualReviewPath: string;
  candidateCorpusPath: string;
  outputPath: string;
}> {
  const dir = join(workingRoot, input.caseName);
  await rm(dir, { force: true, recursive: true });
  await mkdir(dir, { recursive: true });
  const reviewedCorpusPath = join(dir, "v3-reviewed.json");
  const manualReviewPath = join(dir, "manual-review.json");
  const candidateCorpusPath = join(dir, "v5-candidates.json");
  const outputPath = join(dir, "publishable.json");

  await writeJson(reviewedCorpusPath, {
    version: 3,
    generatedAt: "2026-05-27T00:00:00.000Z",
    documentInterventionRecords: input.records.map((record) => ({
      recordId: record.recordId,
      sourceId: record.sourceId,
      recordKind: record.recordKind ?? "implemented",
      routes: record.routes ?? [],
      serviceMode: "sbs",
      primaryTreatments: record.primaryTreatments ?? ["bus_lane"],
      customTreatments: [],
      corridor: { streets: ["Main Street"] },
      effectiveDate: "2024-06-01",
      datePrecision: "day",
      statusHistory: [],
      treatmentComponents: [],
      metrics: [],
      caveats: [],
      evidenceCandidateIds: record.evidenceCandidateIds ?? [],
    })),
  });
  await writeJson(manualReviewPath, { reviews: input.reviews });
  await writeJson(candidateCorpusPath, {
    version: 1,
    documentEvidenceCandidates: (input.candidates ?? []).map((candidate) => ({
      candidateId: candidate.candidateId,
      evidenceQuote: candidate.evidenceQuote,
      sourceRef: {
        title: candidate.sourceTitle ?? "Source",
        sourceUrl: candidate.sourceUrl ?? "https://example.org",
      },
    })),
  });
  return { reviewedCorpusPath, manualReviewPath, candidateCorpusPath, outputPath };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("promotePublishableInterventions", () => {
  test("partitions records by disposition and writes the publishable artifact", async () => {
    const paths = await seed({
      caseName: "partition",
      records: [
        { recordId: "r1", sourceId: "s1", recordKind: "implemented" },
        { recordId: "r2", sourceId: "s1", recordKind: "in_progress" },
        { recordId: "r3", sourceId: "s2", recordKind: "proposed" },
        { recordId: "r4", sourceId: "s2", recordKind: "implemented" },
      ],
      reviews: [
        { recordId: "r1", disposition: "publish_candidate" },
        { recordId: "r2", disposition: "planned_layer_candidate" },
        { recordId: "r3", disposition: "needs_manual_curation" },
        { recordId: "r4", disposition: "supporting_evidence_only" },
      ],
    });
    const artifact = await promotePublishableInterventions({
      ...paths,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(artifact.summary.publishableTotal).toBe(2);
    expect(artifact.summary.publishableByLayer.canonical_milestone).toBe(1);
    expect(artifact.summary.publishableByLayer.planned_or_proposed).toBe(1);
    expect(artifact.summary.excludedByDisposition).toEqual({
      needs_manual_curation: 1,
      supporting_evidence_only: 1,
    });
    expect(artifact.publishableInterventions.map((i) => i.recordId)).toEqual(["r1", "r2"]);
    // File written:
    const written = JSON.parse(await readFile(paths.outputPath, "utf8")) as {
      summary: { publishableTotal: number };
    };
    expect(written.summary.publishableTotal).toBe(2);
  });

  test("maps recordKind + disposition to status correctly", async () => {
    const paths = await seed({
      caseName: "status-mapping",
      records: [
        { recordId: "pub_impl", sourceId: "s", recordKind: "implemented" },
        { recordId: "pub_inprog", sourceId: "s", recordKind: "in_progress" },
        { recordId: "plan_proposed", sourceId: "s", recordKind: "proposed" },
        { recordId: "plan_inprog", sourceId: "s", recordKind: "in_progress" },
      ],
      reviews: [
        { recordId: "pub_impl", disposition: "publish_candidate" },
        { recordId: "pub_inprog", disposition: "publish_candidate" },
        { recordId: "plan_proposed", disposition: "planned_layer_candidate" },
        { recordId: "plan_inprog", disposition: "planned_layer_candidate" },
      ],
    });
    const artifact = await promotePublishableInterventions({
      ...paths,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    const byId = new Map(artifact.publishableInterventions.map((i) => [i.recordId, i.status]));
    expect(byId.get("pub_impl")).toBe("implemented");
    expect(byId.get("pub_inprog")).toBe("implemented");
    expect(byId.get("plan_proposed")).toBe("proposed");
    expect(byId.get("plan_inprog")).toBe("planned");
    expect(artifact.summary.dispositionVsRecordKindConflicts).toHaveLength(0);
  });

  test("flags disposition vs recordKind conflicts", async () => {
    const paths = await seed({
      caseName: "conflict",
      records: [
        { recordId: "weird_publish", sourceId: "s", recordKind: "proposed" },
        { recordId: "weird_planned", sourceId: "s", recordKind: "implemented" },
      ],
      reviews: [
        { recordId: "weird_publish", disposition: "publish_candidate" },
        { recordId: "weird_planned", disposition: "planned_layer_candidate" },
      ],
    });
    const artifact = await promotePublishableInterventions({
      ...paths,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(artifact.summary.dispositionVsRecordKindConflicts).toHaveLength(2);
    const conflictsById = new Map(
      artifact.summary.dispositionVsRecordKindConflicts.map((c) => [c.recordId, c]),
    );
    // Even when conflicting, status follows the disposition's layer intent.
    expect(conflictsById.get("weird_publish")?.resolvedStatus).toBe("implemented");
    expect(conflictsById.get("weird_planned")?.resolvedStatus).toBe("planned");
  });

  test("embeds first N evidence previews per record", async () => {
    const paths = await seed({
      caseName: "evidence-preview",
      records: [
        {
          recordId: "r1",
          sourceId: "s1",
          recordKind: "implemented",
          evidenceCandidateIds: ["c1", "c2", "c3"],
        },
      ],
      reviews: [{ recordId: "r1", disposition: "publish_candidate" }],
      candidates: [
        { candidateId: "c1", evidenceQuote: "quote one", sourceTitle: "Title 1" },
        { candidateId: "c2", evidenceQuote: "quote two", sourceTitle: "Title 2" },
        { candidateId: "c3", evidenceQuote: "quote three", sourceTitle: "Title 3" },
      ],
    });
    const artifact = await promotePublishableInterventions({
      ...paths,
      generatedAt: "2026-05-27T00:00:00.000Z",
      evidencePreviewLimit: 2,
    });
    const previews = artifact.publishableInterventions[0]!.evidencePreviews;
    expect(previews).toHaveLength(2);
    expect(previews[0]!.candidateId).toBe("c1");
    expect(previews[0]!.quote).toBe("quote one");
    expect(previews[0]!.sourceLabel).toBe("Title 1");
    expect(previews[1]!.candidateId).toBe("c2");
  });

  test("records without a matching review land in recordsWithoutReview", async () => {
    const paths = await seed({
      caseName: "no-review",
      records: [
        { recordId: "r1", sourceId: "s", recordKind: "implemented" },
        { recordId: "r2", sourceId: "s", recordKind: "implemented" },
      ],
      reviews: [{ recordId: "r1", disposition: "publish_candidate" }],
    });
    const artifact = await promotePublishableInterventions({
      ...paths,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(artifact.summary.recordsWithoutReview).toEqual(["r2"]);
    expect(artifact.summary.publishableTotal).toBe(1);
  });
});
