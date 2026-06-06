import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/intervention-evaluation.ts");

describe("route intervention-evaluation command boundary", () => {
  test("keeps intervention event construction, comparisons, and local DB writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runRouteInterventionEvaluation({");
    expect(source).toContain("loadDocumentOperationalDateAssertions(");
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
