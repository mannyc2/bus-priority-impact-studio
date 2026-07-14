import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// biome-ignore lint/suspicious/noExplicitAny: pinned external review artifacts are decoded dynamically.
type Json = any;

const args = new Map<string, string>();
for (let index = 2; index < Bun.argv.length; index += 2) {
  const flag = Bun.argv[index];
  const value = Bun.argv[index + 1];
  if (!flag?.startsWith("--") || !value) throw new Error("Expected --flag value");
  args.set(flag.slice(2), value);
}
const required = (name: string) => {
  const value = args.get(name);
  if (!value) throw new Error("Missing --" + name);
  return value;
};
const inputRoot = required("input-root");
const outputPath = required("output");
const deepOutputPath = required("deep-output");
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(join(inputRoot, "manifest.json"));
const candidates = manifest.batches.flatMap(
  (batch: Json) => readJson(join(inputRoot, batch.file)).candidates,
);
if (
  candidates.length !== manifest.totalCandidateCount ||
  new Set(candidates.map((candidate: Json) => candidate.candidateId)).size !== candidates.length
) {
  throw new Error("Review batches must cover the manifest candidate count exactly once");
}

const decisions = candidates
  .map((candidate: Json) => {
    const spineFails = !["series_ready", "series_ready_with_gaps"].includes(
      candidate.spine.readiness,
    );
    const outcomeFails = !candidate.outcomeWindow.calendarMinimumFourPerSide;
    const failedGates = [
      ...(spineFails ? ["segment_spine_readiness"] : []),
      ...(outcomeFails ? ["calendar_outcome_window"] : []),
    ];
    const recommendation = failedGates.length > 0 ? "recommend_reject" : "deep_review_required";
    const rationale =
      failedGates.length > 0
        ? "Hard Plan 074 gate failure: " + failedGates.join(" and ") + "."
        : "Calendar and spine admission gates pass; evidence, phase, overlap, and confounder review remains.";
    return {
      candidateId: candidate.candidateId,
      identity: candidate.identity,
      routeId: candidate.routeId,
      treatmentFamily: candidate.treatmentFamily,
      implementationDate: candidate.implementationDate,
      recommendation,
      rationale,
      hardGateFacts: {
        spineReadiness: candidate.spine.readiness,
        spineReasons: candidate.spine.reasons,
        preMonthCount: candidate.outcomeWindow.preMonthCount,
        postMonthCount: candidate.outcomeWindow.postMonthCount,
        calendarMinimumFourPerSide: candidate.outcomeWindow.calendarMinimumFourPerSide,
      },
      remainingFlags: {
        datePrecision: candidate.datePrecision,
        conflictState: candidate.conflictState,
        confounderGroupId: candidate.confounderGroupId,
        historicalDecision: candidate.historicalContext?.decision ?? null,
      },
    };
  })
  .toSorted((left: Json, right: Json) => left.candidateId.localeCompare(right.candidateId));

const count = (value: string) =>
  decisions.filter((decision: Json) => decision.recommendation === value).length;
const artifact = {
  artifactKind: "bp.studio.codex_review_hard_gate_triage.v1",
  candidateSetId: manifest.candidateSetId,
  candidateSetSha256: manifest.candidateSetSha256,
  authorization: "non_authorizing_recommendation_only",
  doctrine: {
    eligibleSpineStates: ["series_ready", "series_ready_with_gaps"],
    minimumCalendarMonthsPerSide: 4,
    outcomeDataWindow: "2023-04_to_2026-03",
  },
  summary: {
    candidateCount: decisions.length,
    hardRejectCount: count("recommend_reject"),
    deepReviewRequiredCount: count("deep_review_required"),
  },
  decisions,
};
writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n");
const deepIds = new Set(
  decisions
    .filter((decision: Json) => decision.recommendation === "deep_review_required")
    .map((decision: Json) => decision.candidateId),
);
writeFileSync(
  deepOutputPath,
  JSON.stringify(
    {
      artifactKind: "bp.studio.codex_deep_review_input.v1",
      candidateSetId: manifest.candidateSetId,
      candidateSetSha256: manifest.candidateSetSha256,
      candidateCount: deepIds.size,
      candidates: candidates
        .filter((candidate: Json) => deepIds.has(candidate.candidateId))
        .toSorted(
          (left: Json, right: Json) =>
            left.treatmentFamily.localeCompare(right.treatmentFamily) ||
            left.candidateId.localeCompare(right.candidateId),
        ),
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(artifact.summary, null, 2));
