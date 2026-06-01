import { createHash } from "node:crypto";

import type {
  AgentFindingProposal,
  AgentFindingProposalEvidenceRef,
  CodeExecutionLanguage,
} from "@bp/domain";

import { runBash, runTypeScript, type SandboxResult } from "../../lib/sandbox.ts";

// ---------------------------------------------------------------------------
// Cache shape
//
// One entry per unique `sha256(code)` across a proposal's evidenceRefs +
// counterEvidenceRefs + metricClaims[*].evidenceRef. Re-execution happens
// once per proposal; both `resolveEvidenceRef` (existence/hash check) and
// `resolveEvidencePayload` (metric_consistency) read from the same cache.
//
// `error` is non-null when the cited code could not produce a usable result:
// determinism-lint rejection, non-zero exit, timeout, or stdout truncation.
// Both validators treat a non-null error as an unresolved ref.

export type CodeExecutionCacheEntry = {
  stdout: string;
  stdoutHash: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  error: string | null;
};

export type CodeExecutionCache = Map<string, CodeExecutionCacheEntry>;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Determinism lint
//
// Re-execution only catches drift if the code is reproducible. Reject the
// most common non-deterministic patterns up front so the agent gets a clear
// error instead of mysterious stdoutHash mismatches on the second run.
// Tighter rules are easy to add — the goal here is to catch the obvious
// `Date.now()` / `$RANDOM` cases.

const TS_FORBIDDEN: ReadonlyArray<RegExp> = [
  /\bMath\.random\s*\(/,
  /\bDate\.now\s*\(/,
  /\bnew\s+Date\s*\(\s*\)/,
  /\bperformance\.now\s*\(/,
  /\bprocess\.hrtime\b/,
  /\bcrypto\.randomUUID\s*\(/,
  /\bcrypto\.getRandomValues\s*\(/,
  /\bBun\.randomUUIDv7\s*\(/,
];

const SH_FORBIDDEN: ReadonlyArray<RegExp> = [
  /\$RANDOM\b/,
  /\bdate\b(?!\s+-d|\s+--date)/,
  /\/dev\/u?random\b/,
  /\bmktemp\b/,
];

export function checkDeterminism(
  code: string,
  language: CodeExecutionLanguage,
): string | null {
  const patterns = language === "typescript" ? TS_FORBIDDEN : SH_FORBIDDEN;
  for (const pat of patterns) {
    const m = code.match(pat);
    if (m) {
      return `cited code contains non-deterministic '${m[0]}' — replace with a literal so re-execution is reproducible`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pre-execution
//
// Walk the proposal once, collect unique (code, language) pairs, run them in
// parallel inside the sandbox, return a cache keyed by sha256(code). The
// caller threads this cache through ValidatorContext.

function collectCodeRefs(
  proposal: AgentFindingProposal,
): Array<{ key: string; code: string; language: CodeExecutionLanguage }> {
  const out = new Map<string, { code: string; language: CodeExecutionLanguage }>();
  const allRefs: AgentFindingProposalEvidenceRef[] = [
    ...proposal.evidenceRefs,
    ...proposal.counterEvidenceRefs,
    ...proposal.metricClaims.map((c) => c.evidenceRef),
  ];
  for (const ref of allRefs) {
    if (ref.kind === "code_execution") {
      const key = sha256Hex(ref.code);
      if (!out.has(key)) out.set(key, { code: ref.code, language: ref.language });
    }
  }
  return [...out.entries()].map(([key, v]) => ({ key, ...v }));
}

function entryFromSandbox(r: SandboxResult): CodeExecutionCacheEntry {
  return {
    stdout: r.stdout,
    stdoutHash: sha256Hex(r.stdout),
    exitCode: r.exitCode,
    durationMs: r.durationMs,
    timedOut: r.timedOut,
    truncated: r.stdoutTruncated,
    error:
      r.timedOut ? "execution timed out"
      : r.stdoutTruncated ? "stdout truncated at sandbox cap"
      : r.exitCode !== 0 ? `non-zero exit ${r.exitCode}: ${r.stderr.slice(0, 200).trim()}`
      : null,
  };
}

export async function preExecuteCodeRefs(
  proposal: AgentFindingProposal,
): Promise<CodeExecutionCache> {
  const cache: CodeExecutionCache = new Map();
  const refs = collectCodeRefs(proposal);
  await Promise.all(
    refs.map(async ({ key, code, language }) => {
      const lint = checkDeterminism(code, language);
      if (lint !== null) {
        cache.set(key, {
          stdout: "",
          stdoutHash: "",
          exitCode: -1,
          durationMs: 0,
          timedOut: false,
          truncated: false,
          error: lint,
        });
        return;
      }
      const r = language === "typescript" ? await runTypeScript(code) : await runBash(code);
      cache.set(key, entryFromSandbox(r));
    }),
  );
  return cache;
}

// ---------------------------------------------------------------------------
// citedValuePath extraction
//
// citedValuePath is either an RFC 6901 JSON Pointer ("/foo/0/bar") interpreted
// against parsed-JSON stdout, or a line locator "/lines/<n>" (0-indexed) for
// plain-text stdout. Returns the value at the path wrapped as `{ value }` so
// the existing `findNumericField` payload-walker picks it up by the standard
// "look for any key named X with a numeric value" rule.

function jsonPointerGet(doc: unknown, pointer: string): unknown {
  if (pointer === "") return doc;
  if (!pointer.startsWith("/")) return undefined;
  const parts = pointer
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = doc;
  for (const part of parts) {
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (cur !== null && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function extractFromStdout(
  stdout: string,
  citedValuePath: string | undefined,
): { value: unknown } | null {
  if (citedValuePath === undefined) {
    const trimmed = stdout.trim();
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? { value: asNumber } : { value: trimmed };
  }
  const linesMatch = citedValuePath.match(/^\/lines\/(\d+)$/);
  if (linesMatch && linesMatch[1] !== undefined) {
    const idx = Number(linesMatch[1]);
    const lines = stdout.split("\n");
    const raw = lines[idx];
    if (raw === undefined) return null;
    const asNumber = Number(raw);
    return Number.isFinite(asNumber) ? { value: asNumber } : { value: raw };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const v = jsonPointerGet(parsed, citedValuePath);
  return v === undefined ? null : { value: v };
}
