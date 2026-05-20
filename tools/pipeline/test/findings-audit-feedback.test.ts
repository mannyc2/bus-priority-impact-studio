import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FindingDetectorAuditResultSchema } from "@bp/domain";
import {
  buildFindingsAuditFeedback,
  buildFindingsAuditFeedbackSummary,
  findingsAuditFeedbackArtifactPath,
} from "../src/jobs/build/findings-audit-feedback.js";

const workingDir = join(import.meta.dir, ".tmp-findings-audit-feedback");
const artifactRoot = join(workingDir, "artifacts");

describe("findings:audit-feedback", () => {
  test("summarizes agent detector-audit results into improvement themes", async () => {
    await rm(workingDir, { force: true, recursive: true });
    await mkdir(join(artifactRoot, "findings", "2026-03"), { recursive: true });

    const inputPath = join(artifactRoot, "findings", "2026-03", "detector-audit-results.json");
    await Bun.write(
      inputPath,
      `${JSON.stringify(
        {
          artifactKind: "finding_detector_audit_results",
          schemaVersion: 1,
          month: "2026-03",
          generatedAt: "2026-05-20T00:00:00.000Z",
          reviewer: "codex",
          reviewQueueArtifactPath: "/tmp/review-queue.json",
          results: [
            {
              candidateId: "candidate-a",
              detectorId: "intervention_gap",
              routeId: "Q65",
              action: "enrich",
              confidence: "medium",
              evidenceRefsUsed: [{ routeId: "Q65" }],
              rationale: "The detector may be useful, but the packet hides source inventory.",
              missingEvidence: ["intervention inventory source rows"],
              derivedMetricIssues: ["speedPainScore requires raw segment speed evidence"],
              detectorImprovement:
                "Attach raw intervention inventory rows and source-gap audit status.",
              reviewedAt: "2026-05-20T00:01:00.000Z",
            },
            {
              candidateId: "candidate-b",
              detectorId: "intervention_underperformance",
              routeId: "BX15",
              action: "suppress",
              confidence: "high",
              evidenceRefsUsed: [{ routeId: "BX15" }],
              rationale: "Reliability-only pain should not support speed-delta underperformance.",
              missingEvidence: ["before-after reliability evaluation"],
              derivedMetricIssues: ["reliabilityPainScore is context, not speed evidence"],
              detectorImprovement:
                "Require a current speed-hotspot input before emitting speed underperformance.",
              reviewedAt: "2026-05-20T00:02:00.000Z",
            },
            {
              candidateId: "candidate-c",
              detectorId: "persistent_speed_hotspot",
              routeId: "Q17",
              action: "keep",
              confidence: "high",
              evidenceRefsUsed: [{ routeId: "Q17" }],
              rationale: "Raw speed fields, sample count, and slow-window share support the hit.",
              missingEvidence: [],
              derivedMetricIssues: [],
              detectorImprovement: null,
              reviewedAt: null,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = await buildFindingsAuditFeedback({ year: 2026, month: 3, artifactRoot });
    const artifact = await Bun.file(
      findingsAuditFeedbackArtifactPath(artifactRoot, "2026-03"),
    ).json();

    expect(result.reviewedCandidateCount).toBe(3);
    expect(artifact.actionCounts).toMatchObject({ enrich: 1, keep: 1, suppress: 1 });
    expect(artifact.detectorActionCounts.intervention_underperformance.suppress).toBe(1);
    expect(artifact.derivedMetricIssueCount).toBe(2);
    expect(artifact.improvementThemes.map((theme: { theme: string }) => theme.theme)).toContain(
      "speedpainscore requires raw segment speed evidence",
    );
    expect(
      artifact.topDetectorRecommendations.find(
        (row: { detectorId: string }) => row.detectorId === "intervention_underperformance",
      )?.recommendation,
    ).toContain("tighter emit criteria");
  });

  test("builds a schema-valid summary directly from fixture rows", () => {
    const summary = buildFindingsAuditFeedbackSummary({
      inputArtifactPath: "/tmp/audit-results.json",
      generatedAt: "2026-05-20T00:00:00.000Z",
      month: "2026-03",
      results: [
        FindingDetectorAuditResultSchema.parse({
          candidateId: "candidate-a",
          detectorId: "observed_reliability",
          routeId: "BX15",
          action: "split",
          confidence: "medium",
          evidenceRefsUsed: [],
          rationale: "The packet mixes route-level and source-baseline questions.",
          missingEvidence: ["scheduled baseline context"],
          derivedMetricIssues: [],
          detectorImprovement: "Separate current reliability from baseline source quality.",
          reviewedAt: null,
        }),
      ],
    });

    expect(summary.reviewedCandidateCount).toBe(1);
    expect(summary.actionCounts.split).toBe(1);
    expect(summary.topDetectorRecommendations[0]?.recommendation).toContain("split mixed claims");
  });
});
