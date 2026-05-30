import { describe, expect, test } from "bun:test";

import type { AgentFindingProposal } from "@bp/domain";

import {
  checkDeterminism,
  extractFromStdout,
  preExecuteCodeRefs,
  sha256Hex,
} from "../../../src/commands/findings/_code_execution.ts";

// ---------------------------------------------------------------------------
// sha256Hex

describe("sha256Hex", () => {
  test("deterministic and 64 hex chars", () => {
    const h = sha256Hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("hello")).toBe(h);
    expect(sha256Hex("hello!")).not.toBe(h);
  });
});

// ---------------------------------------------------------------------------
// checkDeterminism

describe("checkDeterminism (python)", () => {
  test("rejects datetime.now / utcnow / today", () => {
    expect(checkDeterminism("from datetime import datetime\nprint(datetime.now())", "python")).not.toBeNull();
    expect(checkDeterminism("import datetime\nprint(datetime.datetime.utcnow())", "python")).not.toBeNull();
    expect(checkDeterminism("from datetime import date\nprint(date.today())", "python")).not.toBeNull();
  });

  test("rejects time module non-determinism", () => {
    expect(checkDeterminism("import time\nprint(time.time())", "python")).not.toBeNull();
    expect(checkDeterminism("import time\nprint(time.monotonic())", "python")).not.toBeNull();
    expect(checkDeterminism("import time\nprint(time.perf_counter())", "python")).not.toBeNull();
  });

  test("rejects random and secrets", () => {
    expect(checkDeterminism("import random\nprint(random.randint(1, 5))", "python")).not.toBeNull();
    expect(checkDeterminism("from random import choice\nprint(choice([1, 2]))", "python")).not.toBeNull();
    expect(checkDeterminism("import secrets\nprint(secrets.token_hex(4))", "python")).not.toBeNull();
  });

  test("accepts deterministic pandas + literals", () => {
    expect(checkDeterminism(
      "import pandas as pd\nfrom bp_corpus import signals\ndf = signals.features_df('2026-03')\nprint(df['routeId'].nunique())",
      "python",
    )).toBeNull();
  });

  test("accepts datetime parsing of a literal", () => {
    expect(checkDeterminism(
      "from datetime import datetime\nprint(datetime.fromisoformat('2026-01-01').year)",
      "python",
    )).toBeNull();
  });
});

describe("checkDeterminism (bash)", () => {
  test("rejects $RANDOM, bare date, /dev/random, mktemp", () => {
    expect(checkDeterminism("echo $RANDOM", "bash")).not.toBeNull();
    expect(checkDeterminism("date +%s", "bash")).not.toBeNull();
    expect(checkDeterminism("head -c 8 /dev/urandom", "bash")).not.toBeNull();
    expect(checkDeterminism("f=$(mktemp); echo $f", "bash")).not.toBeNull();
  });

  test("accepts date -d (parsing a literal)", () => {
    expect(checkDeterminism("date -d '2026-01-01' +%j", "bash")).toBeNull();
  });

  test("accepts plain jq / ripgrep", () => {
    expect(checkDeterminism("jq '.features | length' /work/data/artifacts/findings/2026-03/signal-features.json", "bash")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractFromStdout

describe("extractFromStdout", () => {
  test("undefined path returns whole stdout, numeric-coerced if possible", () => {
    expect(extractFromStdout("42\n", undefined)).toEqual({ value: 42 });
    expect(extractFromStdout("hello\n", undefined)).toEqual({ value: "hello" });
  });

  test("/lines/N extracts the Nth line", () => {
    const stdout = "alpha\n100\nthird\n";
    expect(extractFromStdout(stdout, "/lines/0")).toEqual({ value: "alpha" });
    expect(extractFromStdout(stdout, "/lines/1")).toEqual({ value: 100 });
    expect(extractFromStdout(stdout, "/lines/99")).toBeNull();
  });

  test("JSON pointer against JSON stdout", () => {
    const stdout = JSON.stringify({ routes: [{ id: "Q17", speed: 6.5 }, { id: "Q65" }] });
    expect(extractFromStdout(stdout, "/routes/0/speed")).toEqual({ value: 6.5 });
    expect(extractFromStdout(stdout, "/routes/1/id")).toEqual({ value: "Q65" });
  });

  test("pointer into non-JSON stdout returns null", () => {
    expect(extractFromStdout("not json\n", "/foo")).toBeNull();
  });

  test("pointer that doesn't resolve returns null", () => {
    const stdout = JSON.stringify({ a: 1 });
    expect(extractFromStdout(stdout, "/missing")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// preExecuteCodeRefs — gated on the sandbox image being present

const SANDBOX_AVAILABLE = (() => {
  try {
    const r = Bun.spawnSync(["docker", "image", "inspect", "bp-sandbox:latest"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
})();

const maybe = SANDBOX_AVAILABLE ? describe : describe.skip;

function proposalWithCode(code: string, stdoutHash = "a".repeat(64)): AgentFindingProposal {
  return {
    proposalId: "test-proposal",
    routeId: "Q17",
    scopeKind: "route",
    category: "context",
    severity: "low",
    confidence: "low",
    claimText: "Test proposal.",
    claimStrength: "observation",
    evidenceRefs: [
      {
        kind: "code_execution",
        language: "python",
        code,
        stdoutHash,
      },
    ],
    counterEvidenceRefs: [],
    interventionRecordIds: [],
    documentCandidateIds: [],
    metricClaims: [],
    caveats: [],
    missingEvidence: [],
    validationState: "pending",
    validationErrors: [],
    duplicateCheck: { matchedPromotedFindingId: null, reason: "n/a" },
  } as unknown as AgentFindingProposal;
}

maybe("preExecuteCodeRefs (real sandbox)", () => {
  test("runs python and returns matching stdoutHash", async () => {
    const code = "print(1 + 1)";
    const proposal = proposalWithCode(code);
    const cache = await preExecuteCodeRefs(proposal);
    const entry = cache.get(sha256Hex(code));
    expect(entry).toBeDefined();
    expect(entry?.error).toBeNull();
    expect(entry?.stdout).toBe("2\n");
    expect(entry?.stdoutHash).toBe(sha256Hex("2\n"));
  });

  test("populates an error entry for determinism-lint rejection (no sandbox call)", async () => {
    const code = "import time\nprint(time.time())";
    const proposal = proposalWithCode(code);
    const cache = await preExecuteCodeRefs(proposal);
    const entry = cache.get(sha256Hex(code));
    expect(entry?.error).toContain("non-deterministic");
  });

  test("deduplicates identical code across refs", async () => {
    const code = "print(42)";
    const proposal = proposalWithCode(code);
    proposal.counterEvidenceRefs.push({
      kind: "code_execution",
      language: "python",
      code,
      stdoutHash: "b".repeat(64),
    });
    const cache = await preExecuteCodeRefs(proposal);
    expect(cache.size).toBe(1);
  });

  test("captures non-zero exit as error", async () => {
    const code = "raise SystemExit(2)";
    const proposal = proposalWithCode(code);
    const cache = await preExecuteCodeRefs(proposal);
    const entry = cache.get(sha256Hex(code));
    expect(entry?.error).toContain("non-zero exit");
  });
});
