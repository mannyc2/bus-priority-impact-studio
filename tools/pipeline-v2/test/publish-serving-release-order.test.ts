import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  advanceServingPublicationPhase,
  type ServingPublicationPhase,
} from "../src/lib/serving-publication.ts";

describe("protected serving publication ordering", () => {
  test("allows only the activation-last forward state machine", () => {
    const phases: ServingPublicationPhase[] = [
      "candidate_validated",
      "migrations_applied",
      "blobs_uploaded",
      "d1_staged",
      "candidate_verified",
      "activated",
      "production_smoke_passed",
      "complete",
    ];
    let current = phases[0];
    if (current === undefined) throw new Error("missing initial phase");
    for (const next of phases.slice(1)) current = advanceServingPublicationPhase(current, next);
    expect(current).toBe("complete");
    expect(() => advanceServingPublicationPhase("candidate_validated", "activated")).toThrow(
      "Invalid serving publication transition",
    );
    expect(() => advanceServingPublicationPhase("d1_staged", "complete")).toThrow(
      "Invalid serving publication transition",
    );
    expect(advanceServingPublicationPhase("candidate_validated", "no_op")).toBe("no_op");
    expect(advanceServingPublicationPhase("activated", "rolled_back")).toBe("rolled_back");
  });

  test("the protected workflow orders one wrapper, closed staging, activation, rollback, and cleanup", async () => {
    const workflow = await readFile(
      join(import.meta.dir, "../../../.github/workflows/publication.yml"),
      "utf8",
    );
    const classify = workflow.indexOf("--action classify");
    const migrate = workflow.indexOf("--action migrate");
    const blobs = workflow.indexOf("--action blobs");
    const d1 = workflow.indexOf("--action d1");
    const verify = workflow.indexOf("--action verify");
    const finalize = workflow.indexOf("--action finalize");
    const rollback = workflow.indexOf("--action rollback");
    const cleanup = workflow.indexOf("workers/services/bus-priority-plan098-operator");
    expect(classify).toBeGreaterThan(0);
    expect(migrate).toBeGreaterThan(classify);
    expect(blobs).toBeGreaterThan(migrate);
    expect(d1).toBeGreaterThan(blobs);
    expect(verify).toBeGreaterThan(d1);
    expect(finalize).toBeGreaterThan(verify);
    expect(rollback).toBeGreaterThan(finalize);
    expect(cleanup).toBeGreaterThan(rollback);
    expect(workflow).toContain("environment:\n      name: production");
    expect(workflow).toContain("group: serving-production-publication");
    expect(workflow).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(workflow).not.toContain("R2_ACCESS_KEY_ID");
    expect(workflow).not.toContain("R2_SECRET_ACCESS_KEY");
    expect(workflow).not.toMatch(/uses: [^\n]+@(v|main|master)\b/u);
    expect(workflow).toContain("steps.finalize.outcome != 'success'");
  });

  test("semantic no-op exits before migrations and records zero serving mutations", async () => {
    const script = await readFile(
      join(import.meta.dir, "../scripts/run-serving-publication-production.ts"),
      "utf8",
    );
    const comparison = script.indexOf("activeCandidate.candidate.semanticInputFingerprint");
    const migration = script.indexOf('if (action === "migrate")');
    expect(comparison).toBeGreaterThan(0);
    expect(migration).toBeGreaterThan(comparison);
    expect(script).toContain("contentPutCount: 0");
    expect(script).toContain("servingWriteCount: 0");
    expect(script).toContain("releaseWriteCount: 0");
    expect(script).toContain("pointerWriteCount: 0");
    expect(script).toContain('action: "read-receipt"');
    expect(script).toContain('outcome: "completion-adopted"');
    expect(script).toContain('outcome: "rollback-adopted"');
  });
});
