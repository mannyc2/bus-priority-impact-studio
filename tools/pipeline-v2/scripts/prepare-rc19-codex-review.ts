import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const monthIndex = (month: string) => {
  const [year = 0, value = 0] = month.split("-").map(Number);
  return year * 12 + value - 1;
};
const isoMonth = (index: number) =>
  String(Math.floor(index / 12)).padStart(4, "0") + "-" + String((index % 12) + 1).padStart(2, "0");
const windowMonths = (implementationMonth: string, analysisMonth: string) => {
  const implementation = monthIndex(implementationMonth);
  const floor = monthIndex("2023-04");
  const analysis = monthIndex(analysisMonth);
  const pre: string[] = [];
  const post: string[] = [];
  const preEnd = Math.min(analysis, implementation - 1);
  for (let value = Math.max(floor, implementation - 6); value <= preEnd; value += 1) {
    pre.push(isoMonth(value));
  }
  for (
    let value = Math.max(floor, implementation + 1);
    value <= Math.min(analysis, implementation + 6);
    value += 1
  ) {
    post.push(isoMonth(value));
  }
  return { pre, post };
};
const identity = (candidate: Json) =>
  [
    candidate.routeId,
    candidate.treatmentFamily,
    candidate.implementationDate,
    candidate.datePrecision,
  ].join("|");

const candidatePath = required("candidate");
const baselinePath = required("baseline");
const receiptPath = required("receipt");
const spinePath = required("spine");
const analysisMonth = required("analysis-month");
const outputRoot = required("output-root");
const candidateSet = readJson(candidatePath);
const baseline = readJson(baselinePath);
const receipt = readJson(receiptPath);
const spine = readJson(spinePath);

if (!/^candidate-set-v2:[a-f0-9]{24}$/u.test(candidateSet.candidateSetId)) {
  throw new Error("Invalid v2 candidate set: " + candidateSet.candidateSetId);
}
if (candidateSet.approvalState !== "awaiting_approval" || candidateSet.approval !== null) {
  throw new Error("Review input must remain awaiting approval with no receipt");
}

const oldDecisionById = new Map(
  receipt.decisions.map((decision: Json) => [decision.candidateId, decision]),
);
const oldByIdentity = new Map(
  baseline.candidates.map((candidate: Json) => [
    identity(candidate),
    { candidate, decision: oldDecisionById.get(candidate.candidateId) ?? null },
  ]),
);
const spineByRoute = new Map(spine.routes.map((route: Json) => [route.routeId, route]));

const enriched = candidateSet.candidates
  .map((candidate: Json) => {
    const historical = oldByIdentity.get(identity(candidate)) as Json | undefined;
    const routeSpine = spineByRoute.get(candidate.routeId) as Json | undefined;
    const windows = windowMonths(candidate.implementationMonth, analysisMonth);
    return {
      candidateId: candidate.candidateId,
      identity: identity(candidate),
      routeId: candidate.routeId,
      treatmentFamily: candidate.treatmentFamily,
      implementationDate: candidate.implementationDate,
      implementationMonth: candidate.implementationMonth,
      datePrecision: candidate.datePrecision,
      occurrenceId: candidate.occurrenceId ?? null,
      treatmentScopeKind: candidate.treatmentScopeKind ?? "atomic",
      componentTreatmentFamilies: candidate.componentTreatmentFamilies ?? [],
      conflictState: candidate.conflictState ?? "none",
      confounderGroupId: candidate.confounderGroupId ?? null,
      provenance: candidate.provenance,
      spine:
        routeSpine === undefined
          ? { readiness: "missing", reasons: [] }
          : {
              readiness: routeSpine.readiness,
              reasons: routeSpine.reasons,
              monthCount: routeSpine.monthCount,
              coverage: routeSpine.coverage,
            },
      outcomeWindow: {
        analysisMonth,
        preMonths: windows.pre,
        postMonths: windows.post,
        preMonthCount: windows.pre.length,
        postMonthCount: windows.post.length,
        calendarMinimumFourPerSide: windows.pre.length >= 4 && windows.post.length >= 4,
      },
      historicalContext:
        historical === undefined
          ? null
          : {
              candidateSetId: baseline.candidateSetId,
              candidateId: historical.candidate.candidateId,
              decision: historical.decision?.decision ?? null,
              rationale: historical.decision?.rationale ?? null,
            },
      review: {
        recommendation: null,
        rationale: null,
        gates: {
          evidenceScope: null,
          date: null,
          spine: null,
          outcome: null,
          conflict: null,
          confounder: null,
        },
      },
    };
  })
  .toSorted((left: Json, right: Json) => left.candidateId.localeCompare(right.candidateId));

const family = (name: string) =>
  enriched.filter((candidate: Json) => candidate.treatmentFamily === name);
const busLane = family("bus_lane");
const batches = [
  {
    batchId: "route-redesign",
    file: "10-route-redesign.input.json",
    candidates: family("route_redesign"),
  },
  {
    batchId: "ace",
    file: "20-ace.input.json",
    candidates: family("automated_bus_lane_enforcement"),
  },
  {
    batchId: "bus-lane-000-081",
    file: "30-bus-lane-000-081.input.json",
    candidates: busLane.slice(0, 82),
  },
  {
    batchId: "bus-lane-082-162",
    file: "31-bus-lane-082-162.input.json",
    candidates: busLane.slice(82, 163),
  },
  {
    batchId: "bus-lane-163-243",
    file: "32-bus-lane-163-243.input.json",
    candidates: busLane.slice(163, 244),
  },
  {
    batchId: "bus-lane-244-324",
    file: "33-bus-lane-244-324.input.json",
    candidates: busLane.slice(244, 325),
  },
  {
    batchId: "off-board-fare",
    file: "40-off-board-fare.input.json",
    candidates: family("off_board_fare_collection"),
  },
];
const assignedIds = batches.flatMap((batch) =>
  batch.candidates.map((candidate: Json) => candidate.candidateId),
);
if (assignedIds.length !== enriched.length || new Set(assignedIds).size !== enriched.length) {
  throw new Error("Batch assignment must cover every unique candidate exactly once");
}

mkdirSync(outputRoot, { recursive: true });
const manifestBatches = batches.map((batch) => {
  const outputPath = join(outputRoot, batch.file);
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        artifactKind: "bp.studio.codex_review_batch_input.v1",
        candidateSetId: candidateSet.candidateSetId,
        candidateSetSha256: sha256(candidatePath),
        batchId: batch.batchId,
        decisionCount: batch.candidates.length,
        candidates: batch.candidates,
      },
      null,
      2,
    ) + "\n",
  );
  return {
    batchId: batch.batchId,
    file: batch.file,
    candidateCount: batch.candidates.length,
    sha256: sha256(outputPath),
  };
});
const manifest = {
  artifactKind: "bp.studio.codex_review_manifest.v1",
  candidateSetId: candidateSet.candidateSetId,
  candidateSetSha256: sha256(candidatePath),
  immutableInputs: {
    baselineCandidateSetId: baseline.candidateSetId,
    baselineSha256: sha256(baselinePath),
    historicalReceiptSha256: sha256(receiptPath),
    spineManifestSha256: sha256(spinePath),
  },
  analysisMonth,
  totalCandidateCount: enriched.length,
  batches: manifestBatches,
};
writeFileSync(join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
