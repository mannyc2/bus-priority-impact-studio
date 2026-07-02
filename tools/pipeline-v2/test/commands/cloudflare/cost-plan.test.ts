import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCloudflareCostPlan } from "../../../src/commands/cloudflare/cost-plan.ts";

let tmp: string | undefined;

afterEach(async () => {
  if (tmp !== undefined) {
    await rm(tmp, { force: true, recursive: true });
    tmp = undefined;
  }
});

describe("runCloudflareCostPlan", () => {
  it("estimates D1 paid-plan overage from SQL plus an export summary", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-cost-plan-"));
    const seedPath = join(tmp, "seed.sql");
    const summaryPath = join(tmp, "export-summary.json");
    await writeFile(
      seedPath,
      [
        `delete from "route_scorecard" where "month" = '2099-01';`,
        `insert into "route_scorecard" ("route_id", "month") values ('M1', '2099-01');`,
        `insert into "route_scorecard" ("route_id", "month") values ('M2', '2099-01');`,
      ].join("\n"),
    );
    await writeFile(summaryPath, JSON.stringify({ schemaVersion: 1, routeScorecardRowCount: 2 }));

    const plan = await runCloudflareCostPlan({
      d1SqlPaths: [seedPath],
      summaryPaths: [summaryPath],
    });

    expect(plan.usageEstimate.insertedRowsLowerBound).toBe(2);
    expect(plan.usageEstimate.replacementRowsWrittenEstimate).toBe(4);
    expect(plan.usageEstimate.deleteStatementCount).toBe(1);
    expect(plan.cost.overageLikelyFromThisOperationAlone).toBe(false);
    expect(plan.cost.lines.find((l) => l.metric === "d1_rows_written")?.quantity).toBe(4);
  });

  it("falls back to insert statement count when no summary is given", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-cost-plan-"));
    const seedPath = join(tmp, "seed.sql");
    await writeFile(
      seedPath,
      [
        `insert into "x" ("a") values (1);`,
        `insert into "x" ("a") values (2);`,
        `insert into "x" ("a") values (3);`,
      ].join("\n"),
    );

    const plan = await runCloudflareCostPlan({ d1SqlPaths: [seedPath] });

    expect(plan.usageEstimate.insertedRowsLowerBound).toBe(3);
    expect(plan.usageEstimate.deleteStatementCount).toBe(0);
    expect(plan.usageEstimate.replacementRowsWrittenEstimate).toBe(3);
  });

  it("rejects an empty d1SqlPaths array", async () => {
    await expect(runCloudflareCostPlan({ d1SqlPaths: [] })).rejects.toThrow(
      /at least one d1Sql path/i,
    );
  });
});
