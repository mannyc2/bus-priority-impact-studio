import type { AgentFindingProposalEvidenceRef } from "@bp/domain";

import {
  type CodeExecutionCache,
  extractFromStdout,
  sha256Hex,
} from "./_code_execution.ts";
import type { LoadedCorpus } from "./_corpus.ts";

export type EvidencePayload = Record<string, unknown>;

/**
 * Resolve an agent evidence ref to a flat-ish record of fields the deterministic
 * validators can probe. The payload's shape depends on the ref kind:
 *
 *  - review_packet_link: the FindingEvidenceLink.evidenceRef is a JSON-stringified
 *    blob (e.g. {touchedEventCount: 480, highConfidenceTouchCount: 101, ...}); we
 *    parse it back to an object.
 *  - signal_feature: the row from corpus.signalFeaturesByRoute.
 *  - intervention_record / document_candidate / promoted_finding: the typed
 *    record as stored in the corpus.
 *  - context_appendix: if the cited `section` is a sub-object on the appendix
 *    record, return that; otherwise return the full appendix.
 *
 * Returns null when the ref doesn't resolve. Validators distinguish "ref didn't
 * resolve" (evidence_refs_resolve fault) from "ref resolved but variable missing"
 * (metric_consistency fault).
 */
export function resolveEvidencePayload(
  corpus: LoadedCorpus,
  ref: AgentFindingProposalEvidenceRef,
  codeExecutionCache?: CodeExecutionCache,
): EvidencePayload | null {
  switch (ref.kind) {
    case "review_packet_link": {
      const link = corpus.evidenceLinks.get(ref.linkId);
      if (!link) return null;
      try {
        const parsed = JSON.parse(link.evidenceRef) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as EvidencePayload;
        }
        return { value: parsed } as EvidencePayload;
      } catch {
        return { evidenceRef: link.evidenceRef };
      }
    }
    case "signal_feature": {
      const rows = corpus.signalFeaturesByRoute.get(ref.routeId as never);
      const row = rows?.find((r) => r.window === ref.window);
      return row ? (row as unknown as EvidencePayload) : null;
    }
    case "promoted_finding": {
      const finding = corpus.promotedFindings.get(ref.promotedFindingId);
      return finding ? (finding as unknown as EvidencePayload) : null;
    }
    case "intervention_record": {
      const record = corpus.interventionRecords.get(ref.recordId);
      return record ? (record as unknown as EvidencePayload) : null;
    }
    case "document_candidate": {
      const candidate = corpus.documentCandidates.get(ref.candidateId);
      return candidate ? (candidate as unknown as EvidencePayload) : null;
    }
    case "context_appendix": {
      const appendix = corpus.contextAppendixByRoute.get(ref.routeId as never);
      if (!appendix) return null;
      const section = (appendix as Record<string, unknown>)[ref.section];
      if (section && typeof section === "object" && !Array.isArray(section)) {
        return section as EvidencePayload;
      }
      return appendix as EvidencePayload;
    }
    case "code_execution": {
      if (!codeExecutionCache) return null;
      const entry = codeExecutionCache.get(sha256Hex(ref.code));
      if (!entry || entry.error !== null) return null;
      if (entry.stdoutHash !== ref.stdoutHash) return null;
      return extractFromStdout(entry.stdout, ref.citedValuePath) as EvidencePayload | null;
    }
  }
}

/**
 * Walk a (possibly nested) payload looking for the first leaf whose key matches
 * `variable` and whose value is numeric. The 311-context payload nests fields
 * under `serviceRequestContext.touchedEventCount`; the agent shouldn't have to
 * write a dotted path, so we recurse. Returns undefined if no numeric match.
 *
 * First match wins. Distinct fields with the same name across nesting levels
 * are rare in our payloads, and validation still requires the value to match —
 * a false-positive name hit with the wrong value still gets rejected.
 */
export function findNumericField(
  payload: EvidencePayload,
  variable: string,
): number | undefined {
  const stack: unknown[] = [payload];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || current === undefined) continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;
    if (variable in obj) {
      const value = obj[variable];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    for (const v of Object.values(obj)) {
      if (v !== null && typeof v === "object") stack.push(v);
    }
  }
  return undefined;
}
