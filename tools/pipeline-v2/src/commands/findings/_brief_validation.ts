import type {
  AgentBriefDraft,
  AgentBriefProposal,
  AgentBriefProposalValidationCheck,
  AgentBriefProposalValidationRecord,
  AgentFindingProposalEvidenceRef,
  AgentFindingProposalMetricClaim,
  AgentFindingProposalValidationState,
} from "@bp/domain";

import type { LoadedCorpus } from "./_corpus.ts";
import { findNumericField, resolveEvidencePayload } from "./_evidence_payload.ts";
import {
  EVIDENCE_OVERLAP_THRESHOLD,
  extractProseNumberTokens,
  FORBIDDEN_LANGUAGE_PATTERNS,
  jaccard,
  JACCARD_THRESHOLD,
  METRIC_TOLERANCE,
  metricTolerance,
  tokenize,
} from "./_validation.ts";

// Brief-side public-readiness patterns: drops the finding-side "promoted
// finding" check because briefs legitimately reference promoted findings as
// supporting evidence ("Promoted finding pf-1 anchors this draft" is normal
// prose). We still block self-asserted approval / publish readiness.
const BRIEF_PUBLIC_READY_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
}> = [
  { pattern: /\bofficially\s+approved\b/i, reason: "asserts official approval" },
  { pattern: /\bready\s+to\s+publish\b/i, reason: "asserts publish readiness" },
  { pattern: /\bpublication\s+ready\b/i, reason: "asserts publication readiness" },
];

export type BriefValidatorContext = {
  corpus: LoadedCorpus;
  proposal: AgentBriefProposal;
};

// ---------------------------------------------------------------------------
// Text extraction
//
// Most prose validators want every text field on the embedded brief, tagged
// with the field path so error messages can point a reviewer at the right
// spot.

type ProseField = { path: string; text: string };

function collectProseFields(brief: AgentBriefDraft): ProseField[] {
  const out: ProseField[] = [
    { path: "title", text: brief.title },
    { path: "summary", text: brief.summary },
    { path: "dek", text: brief.dek },
  ];
  for (const [i, k] of brief.kpis.entries()) {
    out.push({ path: `kpis[${i}].value`, text: k.value });
    out.push({ path: `kpis[${i}].sub`, text: k.sub });
  }
  for (const [i, s] of brief.sections.entries()) {
    out.push({ path: `sections[${i}].title`, text: s.title });
    if (s.sub) out.push({ path: `sections[${i}].sub`, text: s.sub });
    for (const [j, body] of s.body.entries()) {
      out.push({ path: `sections[${i}].body[${j}]`, text: body });
    }
    if (s.callout) {
      out.push({ path: `sections[${i}].callout.title`, text: s.callout.title });
      out.push({ path: `sections[${i}].callout.body`, text: s.callout.body });
    }
  }
  for (const [i, c] of brief.claims.entries()) {
    out.push({ path: `claims[${i}].title`, text: c.title });
    if (c.body) out.push({ path: `claims[${i}].body`, text: c.body });
  }
  for (const [i, e] of brief.evidence.entries()) {
    out.push({ path: `evidence[${i}].detail`, text: e.detail });
  }
  for (const [i, c] of brief.caveats.entries()) {
    out.push({ path: `caveats[${i}].body`, text: c.body });
  }
  return out;
}

function flattenMetricClaims(
  proposal: AgentBriefProposal,
): AgentFindingProposalMetricClaim[] {
  const out: AgentFindingProposalMetricClaim[] = [];
  for (const provenance of proposal.evidenceProvenance) {
    for (const claim of provenance.metricClaims) out.push(claim);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. brief_reference_integrity
//
// Ported from `_release-briefs.ts:assertGeneratedBriefReferenceIntegrity`,
// adjusted for the agent-draft shape (which omits `evidenceRefCount` and the
// source-provenance fields that the studio builder writes — those get added
// by the bridge command).

export function validateBriefReferenceIntegrity(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  const evidenceIds = new Set<string>();
  for (const ev of ctx.proposal.brief.evidence) {
    if (evidenceIds.has(ev.id)) {
      errors.push(`duplicate brief.evidence id ${ev.id}`);
    }
    evidenceIds.add(ev.id);
  }
  const caveatIds = new Set<string>();
  for (const cv of ctx.proposal.brief.caveats) {
    if (caveatIds.has(cv.id)) {
      errors.push(`duplicate brief.caveats id ${cv.id}`);
    }
    caveatIds.add(cv.id);
  }
  for (const claim of ctx.proposal.brief.claims) {
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(
          `claim #${claim.n} references missing evidence id ${evidenceId}`,
        );
      }
    }
    for (const caveatId of claim.caveatIds) {
      if (!caveatIds.has(caveatId)) {
        errors.push(
          `claim #${claim.n} references missing caveat id ${caveatId}`,
        );
      }
    }
  }
  const claimNs = new Set<number>();
  for (const claim of ctx.proposal.brief.claims) {
    if (claimNs.has(claim.n)) {
      errors.push(`duplicate claim.n value ${claim.n}`);
    }
    claimNs.add(claim.n);
  }
  return {
    name: "brief_reference_integrity",
    passed: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 2. evidence_provenance_resolves
//
// Every provenance.evidenceId must reference an existing brief.evidence[i].id.
// Every cited AgentEvidenceRef across provenance must resolve in the corpus.
// Every provenance.metricClaims[].evidenceRef must resolve in the corpus.

function describeRef(ref: AgentFindingProposalEvidenceRef): string {
  switch (ref.kind) {
    case "review_packet_link":
      return `review_packet_link(${ref.packetId}/${ref.linkId})`;
    case "signal_feature":
      return `signal_feature(${ref.routeId}/${ref.window}/${ref.feature})`;
    case "promoted_finding":
      return `promoted_finding(${ref.promotedFindingId})`;
    case "intervention_record":
      return `intervention_record(${ref.recordId})`;
    case "document_candidate":
      return `document_candidate(${ref.candidateId})`;
    case "context_appendix":
      return `context_appendix(${ref.routeId}/${ref.section})`;
    case "code_execution":
      return `code_execution(${ref.language}/${ref.stdoutHash.slice(0, 12)})`;
  }
}

export function validateEvidenceProvenanceResolves(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  const briefEvidenceIds = new Set(
    ctx.proposal.brief.evidence.map((e) => e.id),
  );
  for (const provenance of ctx.proposal.evidenceProvenance) {
    if (!briefEvidenceIds.has(provenance.evidenceId)) {
      errors.push(
        `evidenceProvenance.evidenceId ${provenance.evidenceId} not present in brief.evidence[*].id`,
      );
    }
    for (const ref of provenance.citedRefs) {
      if (resolveEvidencePayload(ctx.corpus, ref) === null) {
        errors.push(
          `provenance for ${provenance.evidenceId} cites unresolved ref ${describeRef(ref)}`,
        );
      }
    }
    for (const claim of provenance.metricClaims) {
      if (resolveEvidencePayload(ctx.corpus, claim.evidenceRef) === null) {
        errors.push(
          `metricClaim ${claim.variable} (provenance ${provenance.evidenceId}) cites unresolved ref ${describeRef(claim.evidenceRef)}`,
        );
      }
    }
  }
  return {
    name: "evidence_provenance_resolves",
    passed: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 3. prose_number_coverage
//
// Every numeric token in any prose field on the brief must be backed by a
// metricClaim somewhere in evidenceProvenance. Uses the same scrubber (NYC
// street/service-code/date suppression) as the finding-side validator and
// the same %↔proportion equivalence rule.

export function validateBriefProseNumberCoverage(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  const routes = ctx.corpus.routes as ReadonlySet<string>;
  const claimedValues = flattenMetricClaims(ctx.proposal).map((c) => c.value);
  const matchesAny = (n: number): boolean =>
    claimedValues.some((v) => {
      const tol = Math.max(METRIC_TOLERANCE, Math.abs(v) * 0.02);
      return Math.abs(v - n) <= tol;
    });
  for (const field of collectProseFields(ctx.proposal.brief)) {
    const tokens = extractProseNumberTokens(field.text, routes);
    for (const token of tokens) {
      const candidates = token.isPercentage
        ? [token.value, token.value / 100]
        : [token.value];
      if (!candidates.some(matchesAny)) {
        const display = token.isPercentage
          ? `${token.value}%`
          : `${token.value}`;
        errors.push(
          `${field.path} contains number ${display} not covered by any provenance metricClaim`,
        );
      }
    }
  }
  return {
    name: "prose_number_coverage",
    passed: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 4. metric_consistency
//
// Each provenance metricClaim: resolve its cited evidenceRef payload, look up
// the claim's `variable` by name (walking nested objects), compare value
// with tolerance. Same shape as the finding-side validator.

export function validateBriefMetricConsistency(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  for (const provenance of ctx.proposal.evidenceProvenance) {
    for (const claim of provenance.metricClaims) {
      const payload = resolveEvidencePayload(ctx.corpus, claim.evidenceRef);
      if (!payload) continue; // already reported by evidence_provenance_resolves
      const actual = findNumericField(payload, claim.variable);
      if (actual === undefined) {
        errors.push(
          `metricClaim ${claim.variable} (provenance ${provenance.evidenceId}): field name not found in cited evidence payload`,
        );
        continue;
      }
      if (Math.abs(actual - claim.value) > metricTolerance(actual)) {
        errors.push(
          `metricClaim ${claim.variable} (provenance ${provenance.evidenceId}): declared ${claim.value}, cited evidence has ${actual}`,
        );
      }
    }
  }
  return {
    name: "metric_consistency",
    passed: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 5. language
//
// Same forbidden-pattern scan as the finding validator, applied to every
// prose field. Errors name the field path so a reviewer can find the
// offending line.

export function validateBriefLanguage(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  for (const field of collectProseFields(ctx.proposal.brief)) {
    for (const { pattern, reason } of FORBIDDEN_LANGUAGE_PATTERNS) {
      if (pattern.test(field.text)) {
        errors.push(`${field.path}: forbidden ${reason}`);
      }
    }
  }
  return { name: "language", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 6. scope_blocked_claims
//
// Brief draft must have status="Draft" (schema also enforces; defense). No
// prose field may claim publish readiness via PUBLIC_READY_PATTERNS.

export function validateBriefScopeBlockedClaims(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  if (ctx.proposal.brief.status !== "Draft") {
    errors.push(
      `brief.status is "${ctx.proposal.brief.status}" — agent proposals must remain in Draft until reviewer approval`,
    );
  }
  for (const field of collectProseFields(ctx.proposal.brief)) {
    for (const { pattern, reason } of BRIEF_PUBLIC_READY_PATTERNS) {
      if (pattern.test(field.text)) {
        errors.push(`${field.path}: ${reason}`);
      }
    }
  }
  return {
    name: "scope_blocked_claims",
    passed: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 7. duplicate
//
// Compare against every existing brief on the same routeSlug:
//  (a) token-set Jaccard similarity on title + summary
//  (b) selectedFindingIds overlap with the peer brief's structurally-linked
//      findings (we don't have a direct brief→finding map in the loaded
//      corpus today — peer brief.evidence[].sourceRefId carries promoted-
//      finding pointers in some shapes, but it's free-form. For now, Jaccard
//      is the load-bearing check; overlap is a defensible follow-up.)

function findBriefDuplicate(
  ctx: BriefValidatorContext,
): { briefId: string; reason: string } | null {
  const peers = ctx.corpus.briefsByRouteSlug.get(ctx.proposal.brief.routeSlug);
  if (!peers || peers.length === 0) return null;
  const proposalTokens = tokenize(
    `${ctx.proposal.brief.title} ${ctx.proposal.brief.summary}`,
  );
  const proposalFindingIds = new Set(ctx.proposal.selectedFindingIds);
  for (const peer of peers) {
    const peerTokens = tokenize(
      `${peer.title ?? ""} ${peer.summary ?? ""}`,
    );
    const sim = jaccard(proposalTokens, peerTokens);
    if (sim >= JACCARD_THRESHOLD) {
      return {
        briefId: peer.id,
        reason: `title+summary jaccard ${sim.toFixed(2)} >= ${JACCARD_THRESHOLD}`,
      };
    }
    // Peer brief.evidence[].sourceRefId of form "promoted_finding:..." would
    // give us a structural overlap signal; if the deterministic builder ever
    // stores them, fold that in here. For now treat as best-effort.
    const peerEvidence = (peer as { evidence?: ReadonlyArray<{ sourceRefId?: string }> })
      .evidence;
    let overlap = 0;
    if (peerEvidence) {
      for (const ev of peerEvidence) {
        const sourceRefId = ev.sourceRefId ?? "";
        const m = sourceRefId.match(/^promoted_finding:([^:]+)/);
        if (m?.[1] && proposalFindingIds.has(m[1])) overlap += 1;
      }
    }
    if (overlap >= EVIDENCE_OVERLAP_THRESHOLD) {
      return {
        briefId: peer.id,
        reason: `${overlap} selectedFindingIds overlap peer brief`,
      };
    }
  }
  return null;
}

export function validateBriefDuplicate(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const match = findBriefDuplicate(ctx);
  if (match === null) {
    return { name: "duplicate", passed: true, errors: [] };
  }
  return {
    name: "duplicate",
    passed: false,
    errors: [`duplicate of brief ${match.briefId}: ${match.reason}`],
  };
}

// ---------------------------------------------------------------------------
// 8. section_coverage
//
// A brief needs at least one framing-style section (the introduction /
// "What changed") and one evidence-style section. We can't enforce semantic
// titles, but we can require at least 2 sections and that each section's
// body[] is non-empty.

export function validateBriefSectionCoverage(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  if (ctx.proposal.brief.sections.length < 2) {
    errors.push(
      `brief has ${ctx.proposal.brief.sections.length} section(s); reviewers expect at least 2 (framing + evidence)`,
    );
  }
  for (const [i, section] of ctx.proposal.brief.sections.entries()) {
    if (section.body.length === 0) {
      errors.push(`sections[${i}] (${section.title}) has empty body`);
    }
  }
  if (ctx.proposal.brief.claims.length === 0) {
    errors.push(`brief has zero claims — every brief must make at least one structured claim`);
  }
  return {
    name: "section_coverage",
    passed: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 9. kpi_grounding
//
// Every KPI is structured around a numeric `value` string. Each KPI value
// that parses as a number must have a corresponding metricClaim. This is a
// targeted variant of prose_number_coverage that fails with a KPI-specific
// error message so the reviewer knows which headline figure is unbacked.

function parseKpiValueAsNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function validateBriefKpiGrounding(
  ctx: BriefValidatorContext,
): AgentBriefProposalValidationCheck {
  const errors: string[] = [];
  const claimedValues = flattenMetricClaims(ctx.proposal).map((c) => c.value);
  for (const [i, kpi] of ctx.proposal.brief.kpis.entries()) {
    const n = parseKpiValueAsNumber(kpi.value);
    if (n === null) continue;
    const isPercent = kpi.value.includes("%") || (kpi.unit ?? "") === "%";
    const candidates = isPercent ? [n, n / 100] : [n];
    const matched = candidates.some((c) =>
      claimedValues.some((v) => {
        const tol = Math.max(METRIC_TOLERANCE, Math.abs(v) * 0.02);
        return Math.abs(v - c) <= tol;
      }),
    );
    if (!matched) {
      errors.push(
        `kpis[${i}] (${kpi.label}) value ${kpi.value} has no backing metricClaim`,
      );
    }
  }
  return { name: "kpi_grounding", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Aggregator

const ALL_BRIEF_VALIDATORS = [
  validateBriefReferenceIntegrity,
  validateEvidenceProvenanceResolves,
  validateBriefProseNumberCoverage,
  validateBriefMetricConsistency,
  validateBriefLanguage,
  validateBriefScopeBlockedClaims,
  validateBriefDuplicate,
  validateBriefSectionCoverage,
  validateBriefKpiGrounding,
] as const;

export function validateBriefProposal(
  corpus: LoadedCorpus,
  proposal: AgentBriefProposal,
): AgentBriefProposalValidationRecord {
  const ctx: BriefValidatorContext = { corpus, proposal };
  const checks: AgentBriefProposalValidationCheck[] = ALL_BRIEF_VALIDATORS.map(
    (validator) => validator(ctx),
  );
  const errors = checks.flatMap((check) =>
    check.errors.map((message) => `[${check.name}] ${message}`),
  );
  const state: AgentFindingProposalValidationState = (
    errors.length === 0 ? "valid" : "rejected"
  ) as AgentFindingProposalValidationState;
  return {
    proposalId: proposal.proposalId,
    validationState: state,
    errors,
    checks,
  };
}
