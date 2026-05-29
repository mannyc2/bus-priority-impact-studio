import type {
  AgentFindingProposal,
  AgentFindingProposalEvidenceRef,
  AgentFindingProposalValidationCheck,
  AgentFindingProposalValidationRecord,
  AgentFindingProposalValidationState,
  PromotedFinding,
  RouteMonthSignalFeature,
} from "@bp/domain";

import type { LoadedCorpus } from "./_corpus.ts";
import { findNumericField, resolveEvidencePayload } from "./_evidence_payload.ts";

export type ValidatorContext = {
  corpus: LoadedCorpus;
  proposal: AgentFindingProposal;
};

// ---------------------------------------------------------------------------
// 1. evidence_refs_resolve

function findSignalRow(
  corpus: LoadedCorpus,
  routeId: string,
  window: string,
): RouteMonthSignalFeature | null {
  const rows = corpus.signalFeaturesByRoute.get(routeId as never);
  if (!rows) return null;
  return rows.find((row) => row.window === window) ?? null;
}

function describeRef(ref: AgentFindingProposalEvidenceRef): string {
  switch (ref.kind) {
    case "review_packet_link":
      return `review_packet_link(packetId=${ref.packetId}, linkId=${ref.linkId})`;
    case "signal_feature":
      return `signal_feature(routeId=${ref.routeId}, window=${ref.window}, feature=${ref.feature})`;
    case "promoted_finding":
      return `promoted_finding(promotedFindingId=${ref.promotedFindingId})`;
    case "intervention_record":
      return `intervention_record(recordId=${ref.recordId})`;
    case "document_candidate":
      return `document_candidate(candidateId=${ref.candidateId})`;
    case "context_appendix":
      return `context_appendix(routeId=${ref.routeId}, section=${ref.section})`;
  }
}

function resolveEvidenceRef(
  corpus: LoadedCorpus,
  ref: AgentFindingProposalEvidenceRef,
): string | null {
  switch (ref.kind) {
    case "review_packet_link": {
      if (!corpus.reviewPackets.has(ref.packetId)) {
        return `unknown packetId ${ref.packetId}`;
      }
      if (!corpus.evidenceLinks.has(ref.linkId)) {
        return `unknown evidence linkId ${ref.linkId}`;
      }
      return null;
    }
    case "signal_feature": {
      const row = findSignalRow(corpus, ref.routeId, ref.window);
      if (!row) return `no signal-features row for route ${ref.routeId} window ${ref.window}`;
      if (!(ref.feature in row)) return `feature column ${ref.feature} not present on signal row`;
      return null;
    }
    case "promoted_finding": {
      return corpus.promotedFindings.has(ref.promotedFindingId)
        ? null
        : `unknown promotedFindingId ${ref.promotedFindingId}`;
    }
    case "intervention_record": {
      return corpus.interventionRecords.has(ref.recordId)
        ? null
        : `unknown intervention recordId ${ref.recordId}`;
    }
    case "document_candidate": {
      return corpus.documentCandidates.has(ref.candidateId)
        ? null
        : `unknown document candidateId ${ref.candidateId}`;
    }
    case "context_appendix": {
      return corpus.contextAppendixByRoute.has(ref.routeId as never)
        ? null
        : `no context appendix for route ${ref.routeId}`;
    }
  }
}

export function validateEvidenceRefsResolve(
  ctx: ValidatorContext,
): AgentFindingProposalValidationCheck {
  const errors: string[] = [];
  const allRefs = [...ctx.proposal.evidenceRefs, ...ctx.proposal.counterEvidenceRefs];
  if (allRefs.length === 0) {
    errors.push("proposal has no evidenceRefs or counterEvidenceRefs");
  }
  for (const ref of allRefs) {
    const error = resolveEvidenceRef(ctx.corpus, ref);
    if (error) errors.push(`${describeRef(ref)}: ${error}`);
  }
  for (const recordId of ctx.proposal.interventionRecordIds) {
    if (!ctx.corpus.interventionRecords.has(recordId)) {
      errors.push(`interventionRecordIds includes unknown recordId ${recordId}`);
    }
  }
  for (const candidateId of ctx.proposal.documentCandidateIds) {
    if (!ctx.corpus.documentCandidates.has(candidateId)) {
      errors.push(`documentCandidateIds includes unknown candidateId ${candidateId}`);
    }
  }
  return { name: "evidence_refs_resolve", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 2. metric_consistency
//
// Resolve the cited evidence ref's payload (signal-feature row, parsed packet
// link JSON, promoted-finding record, intervention record, etc.), look up the
// claim's `variable` by name in that payload, and compare against `value` with
// tolerance. Strict name match — the variable must actually be the field that
// holds the value, not just a field whose value happens to match. This is what
// catches the Q65 "480 high-confidence" case: declared
// variable="highConfidenceTouchCount", value=480 fails because the payload's
// highConfidenceTouchCount is 101 (touchedEventCount is the field that's 480).

const METRIC_TOLERANCE = 1e-6;

function metricTolerance(actual: number): number {
  return Math.max(METRIC_TOLERANCE, Math.abs(actual) * 0.02);
}

export function validateMetricConsistency(
  ctx: ValidatorContext,
): AgentFindingProposalValidationCheck {
  const errors: string[] = [];
  for (const claim of ctx.proposal.metricClaims) {
    const payload = resolveEvidencePayload(ctx.corpus, claim.evidenceRef);
    if (!payload) {
      errors.push(
        `metricClaim ${claim.variable}: cited evidenceRef does not resolve to a payload`,
      );
      continue;
    }
    const actual = findNumericField(payload, claim.variable);
    if (actual === undefined) {
      errors.push(
        `metricClaim ${claim.variable}: field name not found in cited evidence payload`,
      );
      continue;
    }
    if (Math.abs(actual - claim.value) > metricTolerance(actual)) {
      errors.push(
        `metricClaim ${claim.variable}: declared ${claim.value}, cited evidence has ${actual}`,
      );
    }
  }
  return { name: "metric_consistency", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 2b. prose_number_coverage
//
// Every numeric token in claimText must be backed by a metricClaim with a
// matching value. Stops the model from burying numbers in prose to escape
// metric_consistency. Date / year / route-id / packet-id / time tokens are
// stripped first so they don't count as orphan numbers.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ProseNumberToken = { value: number; isPercentage: boolean };

// Strips NYC-specific non-quantity numerics so they don't read as orphan
// metrics: street numbers in addresses ("138 ST"), service-code identifiers
// ("311 service request"), ISO dates / years, 32-char hex IDs, HH:MM times,
// and known route IDs from the corpus.
function scrubNonQuantityNumerics(
  claimText: string,
  routes: ReadonlySet<string>,
): string {
  let scrub = claimText;
  // Thousand separators inside numerics ("1,234" → "1234").
  while (/(\d),(\d)/.test(scrub)) {
    scrub = scrub.replace(/(\d),(\d)/g, "$1$2");
  }
  // ISO month / date.
  scrub = scrub.replace(/\b\d{4}-\d{2}(?:-\d{2})?\b/g, " ");
  // Bare 4-digit years 1900-2099.
  scrub = scrub.replace(/\b(?:19|20)\d{2}\b/g, " ");
  // 32-char hex ids.
  scrub = scrub.replace(/\b[a-f0-9]{32}\b/gi, " ");
  // Time formats HH:MM and HH:MM:SS.
  scrub = scrub.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");
  // Street addresses: a number followed by a NYC street suffix is the address,
  // not a quantity. Covers "138 ST", "37 AV", "1234 BROADWAY", etc. Handles
  // optional trailing period ("ST.") and is case-insensitive.
  scrub = scrub.replace(
    /\b\d+\s+(?:ST|STREET|AV|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|PL|PLACE|DR|DRIVE|WAY|CT|COURT|TER|TERRACE|HWY|HIGHWAY|PKY|PKWY|PARKWAY|LN|LANE|BROADWAY)\.?\b/gi,
    " ",
  );
  // NYC service-code identifiers. These are not counts; "311 service-request"
  // means a 311-system complaint, not 311 of something.
  scrub = scrub.replace(/\b(?:311|911|211|411)\b/g, " ");
  // Known route ids from the loaded corpus.
  for (const r of routes) {
    if (r.length === 0) continue;
    scrub = scrub.replace(new RegExp(`\\b${escapeRegExp(r)}\\b`, "g"), " ");
  }
  return scrub;
}

export function extractProseNumberTokens(
  claimText: string,
  routes: ReadonlySet<string>,
): ProseNumberToken[] {
  const scrub = scrubNonQuantityNumerics(claimText, routes);
  const tokens: ProseNumberToken[] = [];
  // Capture a trailing `%` so we can match "72.09%" against either the literal
  // value or its proportional form (0.7209) — the model commonly declares the
  // metricClaim in proportion form even when it surfaces the percentage in
  // prose.
  for (const m of scrub.matchAll(/\b(\d+(?:\.\d+)?)\s*(%)?/g)) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    tokens.push({ value, isPercentage: Boolean(m[2]) });
  }
  return tokens;
}

// Back-compat for tests that just want the raw values.
export function extractProseNumbers(
  claimText: string,
  routes: ReadonlySet<string>,
): number[] {
  return extractProseNumberTokens(claimText, routes).map((t) => t.value);
}

export function validateProseNumberCoverage(
  ctx: ValidatorContext,
): AgentFindingProposalValidationCheck {
  const errors: string[] = [];
  const tokens = extractProseNumberTokens(
    ctx.proposal.claimText,
    ctx.corpus.routes as ReadonlySet<string>,
  );
  if (tokens.length === 0) {
    return { name: "prose_number_coverage", passed: true, errors };
  }
  const claimed = ctx.proposal.metricClaims.map((c) => c.value);
  const matchesAny = (n: number): boolean =>
    claimed.some((v) => {
      const tol = Math.max(METRIC_TOLERANCE, Math.abs(v) * 0.02);
      return Math.abs(v - n) <= tol;
    });
  for (const token of tokens) {
    const candidates = token.isPercentage
      ? [token.value, token.value / 100]
      : [token.value];
    if (!candidates.some(matchesAny)) {
      const display = token.isPercentage ? `${token.value}%` : `${token.value}`;
      errors.push(
        `claimText contains number ${display} not covered by any metricClaim — declare a metricClaim with this value and a variable name from the cited evidence so it can be cross-checked`,
      );
    }
  }
  return { name: "prose_number_coverage", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 3. route_refs

export function validateRouteRefs(
  ctx: ValidatorContext,
): AgentFindingProposalValidationCheck {
  const errors: string[] = [];
  if (ctx.proposal.routeId && !ctx.corpus.routes.has(ctx.proposal.routeId)) {
    errors.push(`proposal.routeId ${ctx.proposal.routeId} not in corpus`);
  }
  const refs: Array<{ routeId: string }> = [];
  for (const ref of [
    ...ctx.proposal.evidenceRefs,
    ...ctx.proposal.counterEvidenceRefs,
  ]) {
    if (ref.kind === "signal_feature" || ref.kind === "context_appendix") {
      refs.push({ routeId: ref.routeId });
    }
  }
  for (const { routeId } of refs) {
    if (!ctx.corpus.routes.has(routeId as never)) {
      errors.push(`evidence ref references unknown routeId ${routeId}`);
    }
  }
  // intervention records: at least one route on the cited record must match
  // the proposal's routeId, otherwise the support is incidental.
  if (ctx.proposal.routeId) {
    for (const recordId of ctx.proposal.interventionRecordIds) {
      const record = ctx.corpus.interventionRecords.get(recordId);
      if (!record) continue; // already caught by evidence_refs_resolve
      const routes = record.routes ?? [];
      if (!routes.includes(ctx.proposal.routeId)) {
        errors.push(
          `interventionRecord ${recordId} does not list proposal.routeId ${ctx.proposal.routeId} in its routes`,
        );
      }
    }
  }
  return { name: "route_refs", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 4. intervention_support
//
// If the claim text uses an explicit status word ("implemented", "installed",
// "planned", "proposed", "pilot"), every cited intervention record's status (or
// recordKind) must be consistent with that word.

const STATUS_WORD_TO_VALUES: Record<string, readonly string[]> = {
  implemented: ["implemented", "in_progress"],
  installed: ["implemented", "in_progress"],
  completed: ["implemented"],
  planned: ["planned", "in_progress"],
  proposed: ["proposed"],
  pilot: ["in_progress", "implemented"],
};

function detectStatusWord(claimText: string): string | null {
  const lower = claimText.toLowerCase();
  for (const word of Object.keys(STATUS_WORD_TO_VALUES)) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(lower)) return word;
  }
  return null;
}

export function validateInterventionSupport(
  ctx: ValidatorContext,
): AgentFindingProposalValidationCheck {
  const errors: string[] = [];
  const word = detectStatusWord(ctx.proposal.claimText);
  if (word === null || ctx.proposal.interventionRecordIds.length === 0) {
    return { name: "intervention_support", passed: true, errors };
  }
  const allowed = STATUS_WORD_TO_VALUES[word] ?? [];
  for (const recordId of ctx.proposal.interventionRecordIds) {
    const record = ctx.corpus.interventionRecords.get(recordId);
    if (!record) continue;
    const status = record.recordKind;
    if (!allowed.includes(status)) {
      errors.push(
        `claimText says "${word}" but interventionRecord ${recordId} has recordKind=${status}`,
      );
    }
  }
  return { name: "intervention_support", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 5. language
//
// Reject causal verbs, recommendations, and marketing tone. Whole-word match.

const FORBIDDEN_LANGUAGE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
}> = [
  { pattern: /\bcaused\b/i, reason: "causal verb: 'caused'" },
  { pattern: /\bcaused\s+by\b/i, reason: "causal verb: 'caused by'" },
  { pattern: /\bled\s+to\b/i, reason: "causal verb: 'led to'" },
  { pattern: /\bbecause\s+of\b/i, reason: "causal phrase: 'because of'" },
  { pattern: /\bresults?\s+in\b/i, reason: "causal phrase: 'results in'" },
  { pattern: /\bdue\s+to\b/i, reason: "causal phrase: 'due to'" },
  { pattern: /\bshould\b/i, reason: "recommendation: 'should'" },
  { pattern: /\bmust\b/i, reason: "recommendation: 'must'" },
  { pattern: /\bwe\s+recommend\b/i, reason: "recommendation: 'we recommend'" },
  { pattern: /\brecommended\b/i, reason: "recommendation: 'recommended'" },
  { pattern: /\bbreakthrough\b/i, reason: "marketing tone: 'breakthrough'" },
  { pattern: /\btransformative\b/i, reason: "marketing tone: 'transformative'" },
  { pattern: /\bamazing\b/i, reason: "marketing tone: 'amazing'" },
];

export function validateLanguage(ctx: ValidatorContext): AgentFindingProposalValidationCheck {
  const errors: string[] = [];
  for (const { pattern, reason } of FORBIDDEN_LANGUAGE_PATTERNS) {
    if (pattern.test(ctx.proposal.claimText)) {
      errors.push(`claimText contains forbidden ${reason}`);
    }
  }
  return { name: "language", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 6. duplicate
//
// Compare against every promoted finding on the same route via:
//  (a) token-set Jaccard similarity on claim text
//  (b) overlap of approvedEvidenceRefs vs proposal.evidenceRefs (string form)
//
// A match on either signal flips duplicateCheck. We also mutate the proposal's
// duplicateCheck field to record the matched id and reason, since the validator
// is the authoritative dup check.

const JACCARD_THRESHOLD = 0.6;
const EVIDENCE_OVERLAP_THRESHOLD = 2;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function evidenceRefStrings(
  refs: ReadonlyArray<AgentFindingProposalEvidenceRef>,
): Set<string> {
  const out = new Set<string>();
  for (const ref of refs) {
    switch (ref.kind) {
      case "review_packet_link":
        out.add(`packet:${ref.packetId}:${ref.linkId}`);
        break;
      case "promoted_finding":
        out.add(`promoted:${ref.promotedFindingId}`);
        break;
      case "intervention_record":
        out.add(`intervention:${ref.recordId}`);
        break;
      case "document_candidate":
        out.add(`document:${ref.candidateId}`);
        break;
      case "signal_feature":
        out.add(`signal:${ref.routeId}:${ref.window}:${ref.feature}`);
        break;
      case "context_appendix":
        out.add(`context:${ref.routeId}:${ref.section}`);
        break;
    }
  }
  return out;
}

function findDuplicateMatch(
  ctx: ValidatorContext,
): { promotedFindingId: string; reason: string } | null {
  if (!ctx.proposal.routeId) return null;
  const peers = ctx.corpus.promotedFindingsByRoute.get(ctx.proposal.routeId) ?? [];
  if (peers.length === 0) return null;
  const claimTokens = tokenize(ctx.proposal.claimText);
  const proposalRefStrings = evidenceRefStrings(ctx.proposal.evidenceRefs);
  for (const peer of peers as PromotedFinding[]) {
    const peerTokens = tokenize(peer.claimText);
    const sim = jaccard(claimTokens, peerTokens);
    if (sim >= JACCARD_THRESHOLD) {
      return {
        promotedFindingId: peer.promotedFindingId,
        reason: `claim-text jaccard ${sim.toFixed(2)} >= ${JACCARD_THRESHOLD}`,
      };
    }
    let overlapCount = 0;
    for (const r of peer.approvedEvidenceRefs) {
      if (proposalRefStrings.has(r)) overlapCount += 1;
    }
    if (overlapCount >= EVIDENCE_OVERLAP_THRESHOLD) {
      return {
        promotedFindingId: peer.promotedFindingId,
        reason: `${overlapCount} evidence refs overlap promoted finding`,
      };
    }
  }
  return null;
}

export function validateDuplicate(
  ctx: ValidatorContext,
): AgentFindingProposalValidationCheck {
  const match = findDuplicateMatch(ctx);
  if (match === null) {
    return { name: "duplicate", passed: true, errors: [] };
  }
  return {
    name: "duplicate",
    passed: false,
    errors: [
      `duplicate of promoted finding ${match.promotedFindingId}: ${match.reason}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// 7. scope_blocked_claims
//
// Forbid:
//  - "implemented" claimText when every cited intervention record is `proposed`
//  - claimStrength=qualified_claim with any `proposed`-only support
//  - any explicit causal effect assertion (caught by language; this is a defense)
//  - assertions of public-ready approval (the proposal pathway never produces them)

const PUBLIC_READY_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bpromoted\s+finding\b/i, reason: "asserts promoted-finding status" },
  { pattern: /\bofficially\s+approved\b/i, reason: "asserts official approval" },
  { pattern: /\bready\s+to\s+publish\b/i, reason: "asserts publish readiness" },
];

function allCitedInterventionsAreProposed(ctx: ValidatorContext): boolean {
  if (ctx.proposal.interventionRecordIds.length === 0) return false;
  let any = false;
  for (const recordId of ctx.proposal.interventionRecordIds) {
    const record = ctx.corpus.interventionRecords.get(recordId);
    if (!record) continue;
    any = true;
    if (record.recordKind !== "proposed") return false;
  }
  return any;
}

export function validateScopeBlockedClaims(
  ctx: ValidatorContext,
): AgentFindingProposalValidationCheck {
  const errors: string[] = [];
  for (const { pattern, reason } of PUBLIC_READY_PATTERNS) {
    if (pattern.test(ctx.proposal.claimText)) {
      errors.push(`claimText ${reason} — proposals are not public findings`);
    }
  }
  if (
    allCitedInterventionsAreProposed(ctx) &&
    /\b(implemented|installed|completed)\b/i.test(ctx.proposal.claimText)
  ) {
    errors.push(
      "claimText asserts implementation, but every cited intervention record is proposed-only",
    );
  }
  if (
    ctx.proposal.claimStrength === "qualified_claim" &&
    allCitedInterventionsAreProposed(ctx)
  ) {
    errors.push(
      "claimStrength=qualified_claim with proposed-only intervention support: downgrade to observation",
    );
  }
  return { name: "scope_blocked_claims", passed: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Aggregator

const ALL_VALIDATORS = [
  validateEvidenceRefsResolve,
  validateMetricConsistency,
  validateProseNumberCoverage,
  validateRouteRefs,
  validateInterventionSupport,
  validateLanguage,
  validateDuplicate,
  validateScopeBlockedClaims,
] as const;

export function validateProposal(
  corpus: LoadedCorpus,
  proposal: AgentFindingProposal,
): AgentFindingProposalValidationRecord {
  const ctx: ValidatorContext = { corpus, proposal };
  const checks: AgentFindingProposalValidationCheck[] = ALL_VALIDATORS.map((validator) =>
    validator(ctx),
  );
  const errors = checks.flatMap((check) =>
    check.errors.map((message) => `[${check.name}] ${message}`),
  );
  const state: AgentFindingProposalValidationState = (errors.length === 0
    ? "valid"
    : "rejected") as AgentFindingProposalValidationState;
  return {
    proposalId: proposal.proposalId,
    validationState: state,
    errors,
    checks,
  };
}
