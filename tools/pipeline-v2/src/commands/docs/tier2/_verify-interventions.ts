// Tier 2 manual-intervention verification step, extracted from the former
// _shared.ts monolith during the per-step decomposition. Validates the manual
// intervention candidates artifact against the candidate bundle, chunks, and
// canonical events. Imports shared types, JSON readers, and path/CLI helpers
// from the core module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  type CliOption,
  latestDocsRunId,
  parseCliOptions,
  readRequiredJsonArtifact,
  runArtifactRoot,
  type Tier2CandidateBundle,
  type Tier2CanonicalInterventionEventsArtifact,
  type Tier2DocumentChunksArtifact,
  type Tier2ManualInterventionCandidate,
  type Tier2ManualInterventionCandidatesArtifact,
  type Tier2ManualInterventionVerification,
  type VerifyManualInterventionsCliArgs,
  type VerifyTier2ManualInterventionsArgs,
} from "./_shared.ts";

function supportPathExists(
  candidate: Tier2ManualInterventionCandidate,
  supportPath: string,
): boolean {
  if (
    [
      "canonicalName",
      "status",
      "program",
      "interventionType",
      "implementationDate",
      "datePrecision",
      "dateRole",
      "dateRangeEnd",
      "routesAffected",
      "routeRoles",
      "location",
    ].includes(supportPath)
  ) {
    return supportPath in candidate;
  }
  const componentMatch = /^components\[(\d+)\]$/.exec(supportPath);
  if (componentMatch !== null) {
    return candidate.components[Number(componentMatch[1])] !== undefined;
  }
  return false;
}

function addManualInterventionIssue(
  issues: Map<string, Set<string>>,
  candidateId: string,
  issueCode: string,
): void {
  const existing = issues.get(candidateId);
  if (existing !== undefined) {
    existing.add(issueCode);
    return;
  }
  issues.set(candidateId, new Set([issueCode]));
}

function addManualEventDispositionIssue(
  issues: Map<string, Set<string>>,
  eventId: string,
  issueCode: string,
): void {
  const existing = issues.get(eventId);
  if (existing !== undefined) {
    existing.add(issueCode);
    return;
  }
  issues.set(eventId, new Set([issueCode]));
}

function manualCandidateHasFieldEvidence(
  candidate: Tier2ManualInterventionCandidate,
  fieldName: string,
): boolean {
  return candidate.evidence.some((evidence) => evidence.supports.includes(fieldName));
}

export async function verifyTier2ManualInterventions(
  args: VerifyTier2ManualInterventionsArgs,
): Promise<Tier2ManualInterventionVerification> {
  const [manual, canonical, bundle, chunks] = await Promise.all([
    readRequiredJsonArtifact<Tier2ManualInterventionCandidatesArtifact>(
      args.manualInterventionsPath,
    ),
    readRequiredJsonArtifact<Tier2CanonicalInterventionEventsArtifact>(args.canonicalEventsPath),
    readRequiredJsonArtifact<Tier2CandidateBundle>(args.candidateBundlePath),
    readRequiredJsonArtifact<Tier2DocumentChunksArtifact>(args.documentChunksPath),
  ]);
  const eventIds = new Set(canonical.events.map((event) => event.eventId));
  const manualCandidateIds = new Set(manual.candidates.map((candidate) => candidate.candidateId));
  const candidateIds = new Set(
    (bundle.documentEvidenceCandidates ?? []).map((candidate) => candidate.candidateId),
  );
  const chunksById = new Map(chunks.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const issues = new Map<string, Set<string>>();

  for (const candidate of manual.candidates) {
    if (candidate.canonicalName.trim() === "") {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_canonical_name");
    }
    if (candidate.interventionType.trim() === "") {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_intervention_type");
    }
    if (candidate.implementationDate === undefined && candidate.dateUnknownReason === undefined) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_date_or_unknown_reason");
    }
    if (candidate.implementationDate !== undefined && candidate.datePrecision === undefined) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_date_precision");
    }
    if (candidate.dateRole.trim() === "") {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_date_role");
    }
    if (
      (candidate.routesAffected?.length ?? 0) === 0 &&
      candidate.routeUnknownReason === undefined
    ) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_routes_or_unknown_reason");
    }
    if (candidate.location.corridor === null && candidate.locationUnknownReason === undefined) {
      addManualInterventionIssue(
        issues,
        candidate.candidateId,
        "missing_location_or_unknown_reason",
      );
    }
    if (candidate.components.length === 0) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_components");
    }
    if (candidate.evidence.length === 0) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_evidence");
    }
    if (candidate.sourceEventIds.length === 0 && candidate.sourceCandidateIds.length === 0) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_backlinks");
    }

    const evidenceIds = new Set(candidate.evidence.map((evidence) => evidence.evidenceId));
    for (const component of candidate.components) {
      if (component.evidenceRefs.length === 0) {
        addManualInterventionIssue(issues, candidate.candidateId, "component_missing_evidence_ref");
      }
      for (const evidenceRef of component.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) {
          addManualInterventionIssue(
            issues,
            candidate.candidateId,
            "component_unknown_evidence_ref",
          );
        }
      }
    }

    for (const evidence of candidate.evidence) {
      if (evidence.excerpt.trim() === "") {
        addManualInterventionIssue(issues, candidate.candidateId, "empty_evidence_excerpt");
      }
      if (evidence.supports.length === 0) {
        addManualInterventionIssue(issues, candidate.candidateId, "evidence_missing_supports");
      }
      for (const supportPath of evidence.supports) {
        if (!supportPathExists(candidate, supportPath)) {
          addManualInterventionIssue(issues, candidate.candidateId, "unknown_support_path");
        }
      }
      if (evidence.chunkIds.length === 0) {
        addManualInterventionIssue(issues, candidate.candidateId, "evidence_missing_chunk_ids");
      }
      for (const chunkId of evidence.chunkIds) {
        const chunk = chunksById.get(chunkId);
        if (chunk === undefined) {
          addManualInterventionIssue(issues, candidate.candidateId, "unknown_evidence_chunk");
        } else if (chunk.sourceId !== evidence.sourceId) {
          addManualInterventionIssue(
            issues,
            candidate.candidateId,
            "evidence_chunk_source_mismatch",
          );
        }
      }
    }

    for (const sourceEventId of candidate.sourceEventIds) {
      if (!eventIds.has(sourceEventId)) {
        addManualInterventionIssue(issues, candidate.candidateId, "unknown_source_event");
      }
    }
    for (const sourceCandidateId of candidate.sourceCandidateIds) {
      if (!candidateIds.has(sourceCandidateId)) {
        addManualInterventionIssue(issues, candidate.candidateId, "unknown_source_candidate");
      }
    }

    if (candidate.qualityTier === "canonical_milestone") {
      if (candidate.status !== "implemented") {
        addManualInterventionIssue(
          issues,
          candidate.candidateId,
          "canonical_milestone_not_implemented",
        );
      }
      for (const fieldName of ["implementationDate", "routesAffected", "location"]) {
        if (!manualCandidateHasFieldEvidence(candidate, fieldName)) {
          addManualInterventionIssue(
            issues,
            candidate.candidateId,
            `canonical_milestone_missing_${fieldName}_evidence`,
          );
        }
      }
    }
    if (candidate.qualityTier === "planned_or_proposed" && candidate.status === "implemented") {
      addManualInterventionIssue(
        issues,
        candidate.candidateId,
        "planned_candidate_marked_implemented",
      );
    }
  }

  const eventDispositionIssues = new Map<string, Set<string>>();
  const eventDispositions = manual.eventDispositions ?? [];
  const dispositionEventIds = new Set<string>();
  for (const disposition of eventDispositions) {
    if (!eventIds.has(disposition.eventId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "unknown_disposition_event",
      );
    }
    if (dispositionEventIds.has(disposition.eventId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "duplicate_event_disposition",
      );
    }
    dispositionEventIds.add(disposition.eventId);
    if (disposition.reason.trim() === "") {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "empty_disposition_reason",
      );
    }
    if (disposition.candidateId !== undefined && !manualCandidateIds.has(disposition.candidateId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "unknown_disposition_candidate",
      );
    }
  }
  for (const event of canonical.events) {
    if (!dispositionEventIds.has(event.eventId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        event.eventId,
        "missing_event_disposition",
      );
    }
  }

  const candidateIssues = Array.from(issues.entries())
    .map(([candidateId, issueCodes]) => ({
      candidateId,
      issueCodes: Array.from(issueCodes).toSorted(),
    }))
    .toSorted((a, b) => a.candidateId.localeCompare(b.candidateId));
  const eventDispositionIssuesRows = Array.from(eventDispositionIssues.entries())
    .map(([eventId, issueCodes]) => ({
      eventId,
      issueCodes: Array.from(issueCodes).toSorted(),
    }))
    .toSorted((a, b) => a.eventId.localeCompare(b.eventId));
  const issueCount = candidateIssues.reduce((sum, issue) => sum + issue.issueCodes.length, 0);
  const eventDispositionIssueCount = eventDispositionIssuesRows.reduce(
    (sum, issue) => sum + issue.issueCodes.length,
    0,
  );
  const verification: Tier2ManualInterventionVerification = {
    version: 1,
    runId: manual.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    manualInterventionsPath: args.manualInterventionsPath,
    canonicalEventsPath: args.canonicalEventsPath,
    candidateBundlePath: args.candidateBundlePath,
    documentChunksPath: args.documentChunksPath,
    outputPath: args.outputPath ?? null,
    complete: issueCount === 0 && eventDispositionIssueCount === 0,
    summary: {
      candidateCount: manual.candidates.length,
      completeCandidateCount: manual.candidates.length - candidateIssues.length,
      issueCount: issueCount + eventDispositionIssueCount,
      canonicalMilestoneCount: manual.candidates.filter(
        (candidate) => candidate.qualityTier === "canonical_milestone",
      ).length,
      implementedTreatmentComponentCount: manual.candidates.filter(
        (candidate) => candidate.qualityTier === "implemented_treatment_component",
      ).length,
      plannedOrProposedCount: manual.candidates.filter(
        (candidate) => candidate.qualityTier === "planned_or_proposed",
      ).length,
      canonicalEventCount: canonical.events.length,
      eventDispositionCount: dispositionEventIds.size,
      undispositionedEventCount: canonical.events.length - dispositionEventIds.size,
    },
    candidateIssues,
    eventDispositionIssues: eventDispositionIssuesRows,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, verification);
  }

  return verification;
}

function parseVerifyManualInterventionsCliArgs(args: string[]): VerifyManualInterventionsCliArgs {
  const options: CliOption<VerifyManualInterventionsCliArgs>[] = [
    {
      flags: ["--manual-interventions"],
      apply: (output, value) => {
        if (value !== undefined) output.manualInterventionsPath = fromCliPath(value);
      },
    },
    {
      flags: ["--canonical-events"],
      apply: (output, value) => {
        if (value !== undefined) output.canonicalEventsPath = fromCliPath(value);
      },
    },
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) output.candidateBundlePath = fromCliPath(value);
      },
    },
    {
      flags: ["--document-chunks"],
      apply: (output, value) => {
        if (value !== undefined) output.documentChunksPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveVerifyManualInterventionsPaths(
  args: VerifyManualInterventionsCliArgs,
): Promise<VerifyTier2ManualInterventionsArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or all manual intervention paths.");
  }
  const baseDir =
    args.manualInterventionsPath !== undefined
      ? dirname(args.manualInterventionsPath)
      : runArtifactRoot(artifactRoot, runId);
  return {
    manualInterventionsPath:
      args.manualInterventionsPath ?? join(baseDir, "manual-intervention-candidates.json"),
    canonicalEventsPath:
      args.canonicalEventsPath ?? join(baseDir, "tier2-intervention-events-combined.json"),
    candidateBundlePath:
      args.candidateBundlePath ?? join(baseDir, "candidate-bundle-combined.json"),
    documentChunksPath: args.documentChunksPath ?? join(baseDir, "document-chunks-combined.json"),
    outputPath: args.outputPath ?? join(baseDir, "manual-intervention-candidate-verification.json"),
  };
}

export async function verifyTier2ManualInterventionsFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2ManualInterventionVerification,
    "version" | "runId" | "generatedAt" | "outputPath" | "complete" | "summary"
  >
> {
  const verification = await verifyTier2ManualInterventions(
    await resolveVerifyManualInterventionsPaths(parseVerifyManualInterventionsCliArgs(args)),
  );
  return {
    version: verification.version,
    runId: verification.runId,
    generatedAt: verification.generatedAt,
    outputPath: verification.outputPath,
    complete: verification.complete,
    summary: verification.summary,
  };
}
