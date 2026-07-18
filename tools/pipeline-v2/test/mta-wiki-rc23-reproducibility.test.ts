import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { Rc23DeltaAuditSchema } from "../scripts/audit-mta-wiki-rc23-delta.ts";

const REPOSITORY_ROOT = join(import.meta.dir, "../../..");
const LINEAGE_PATH = "docs/research/artifacts/mta-wiki-rc23-lineage-audit.json";
const REPLAY_PATH = "docs/research/artifacts/mta-wiki-rc23-replay-record.json";

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError(`${label} must be a string array`);
  }
  return value;
}

async function readJson(relativePath: string): Promise<{
  readonly bytes: Uint8Array;
  readonly value: unknown;
}> {
  const bytes = new Uint8Array(await Bun.file(join(REPOSITORY_ROOT, relativePath)).arrayBuffer());
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { bytes, value: JSON.parse(text) };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("rc23 reproducibility handoff", () => {
  test("strictly decodes the count-complete checked-in lineage audit", async () => {
    const lineage = await readJson(LINEAGE_PATH);
    const decoded = decodeStrict(Rc23DeltaAuditSchema)(lineage.value);

    expect(lineage.bytes.byteLength).toBe(14_120);
    expect(sha256(lineage.bytes)).toBe(
      "3de53aea97bb5c7423101f84938b6f67f47cf7df69526f113c7606810c997dbc",
    );
    expect(decoded.sourceCommits.mtaWikiImmutableRc23).toBe(
      "d40ee4b62c069f2d8df131a18fe1a71bab9cdbbf",
    );
    expect(decoded.canonicalProof).toMatchObject({
      graphFindingCount: 45_986,
      enforceableViolationCount: 0,
      reviewedNonEnforceableAdvisoryCount: 3,
      informationalOrphanRecordCount: 45_983,
      phaseFindingCount: 0,
      physicalFindingCount: 0,
    });
    expect(
      decoded.canonicalProof.reviewedNonEnforceableAdvisoryCount +
        decoded.canonicalProof.informationalOrphanRecordCount,
    ).toBe(45_986);
  });

  test("rejects the ambiguous legacy aggregate and abbreviated producer commit", async () => {
    const lineage = await readJson(LINEAGE_PATH);
    const ambiguous = structuredClone(asRecord(lineage.value, "lineage"));
    const ambiguousProof = asRecord(ambiguous["canonicalProof"], "canonical proof");
    delete ambiguousProof["graphFindingCount"];
    delete ambiguousProof["enforceableViolationCount"];
    delete ambiguousProof["reviewedNonEnforceableAdvisoryCount"];
    delete ambiguousProof["informationalOrphanRecordCount"];
    delete ambiguousProof["phaseFindingCount"];
    delete ambiguousProof["physicalFindingCount"];
    ambiguousProof["findingOrViolationCount"] = 0;

    expect(() => decodeStrict(Rc23DeltaAuditSchema)(ambiguous)).toThrow();

    const abbreviated = structuredClone(asRecord(lineage.value, "lineage"));
    asRecord(abbreviated["sourceCommits"], "source commits")["mtaWikiImmutableRc23"] = "d40ee4b6";
    expect(() => decodeStrict(Rc23DeltaAuditSchema)(abbreviated)).toThrow();
  });

  test("binds replay claims to checked-in bytes and records the automatic deploy", async () => {
    const replay = asRecord((await readJson(REPLAY_PATH)).value, "replay");
    const runs = asRecord(replay["runs"], "runs");
    const expectedOutputs = [
      {
        run: asRecord(runs["operationalOccurrenceImport"], "import run"),
        hash: "27049c650366c91453f39919d574456eb28d5fab9cb8dce43afc5ceccdf99232",
        bytes: 1_229_311,
      },
      {
        run: asRecord(runs["candidateMerge"], "candidate run"),
        hash: "60422e951226b97abe40ae3705469084c5134488e666084284771e1b60ab22b5",
        bytes: 1_132_675,
      },
      {
        run: asRecord(runs["lineageAudit"], "lineage run"),
        hash: "3de53aea97bb5c7423101f84938b6f67f47cf7df69526f113c7606810c997dbc",
        bytes: 14_120,
      },
    ] as const;

    for (const expected of expectedOutputs) {
      const outputPath = expected.run["outputPath"];
      if (typeof outputPath !== "string") throw new TypeError("outputPath must be a string");
      const output = new Uint8Array(
        await Bun.file(join(REPOSITORY_ROOT, outputPath)).arrayBuffer(),
      );
      expect(output.byteLength).toBe(expected.bytes);
      expect(sha256(output)).toBe(expected.hash);
      expect(expected.run["runCount"]).toBe(2);
      expect(expected.run["byteIdentical"]).toBe(true);
      expect(asStringArray(expected.run["sha256ByRun"], "run hashes")).toEqual([
        expected.hash,
        expected.hash,
      ]);
    }

    expect(replay["mtaWikiImmutableReleaseCommit"]).toBe(
      "d40ee4b62c069f2d8df131a18fe1a71bab9cdbbf",
    );
    expect(asRecord(replay["observedPostMergeDeployment"], "deployment")).toMatchObject({
      occurred: true,
      mergeCommit: "27ceded6373ceaf7e5630bd13ec4605471fc21e4",
      workflowRunId: 29_625_533_041,
      deployJobId: 88_029_151_351,
      conclusion: "success",
      authorizedByThisRecord: false,
    });
    expect(replay["authorizesDeployment"]).toBe(false);
    expect(replay["approvalState"]).toBe("awaiting_approval");
    expect(replay["approvalReceiptPresent"]).toBe(false);
    expect(replay["approvedCandidateCount"]).toBe(0);
  });
});
