import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/intervention-evaluation.ts");

describe("route intervention-evaluation command boundary", () => {
  test("keeps intervention event construction, comparisons, and local DB writes in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain('from "../../effect/route-local-db.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runRouteInterventionEvaluationCommand({");
    expect(source).toContain("makeRouteLocalDbCommandLayer({");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain('from "@bp/applied-research/route-briefs"');
    expect(source).not.toContain("listAceRoutes");
    expect(source).not.toContain("listBusLanes");
    expect(source).not.toContain("replaceRouteInterventionEvaluationRows");
    expect(source).not.toContain("buildPeerComparison");
    expect(source).not.toContain("busLaneMatches");
    expect(source).not.toContain("documentAnchorInterventionType");
  });
});
