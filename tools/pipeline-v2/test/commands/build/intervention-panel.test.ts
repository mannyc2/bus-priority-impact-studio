import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/intervention-panel.ts");

describe("build intervention-panel command boundary", () => {
  test("keeps local comparison SQL and artifact construction in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/causal"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("loadInterventionPanelLocalDbRows({");
    expect(source).toContain("buildInterventionPanelArtifact({");
    expect(source).not.toContain("local_route_intervention_comparison");
    expect(source).not.toContain("comparison_route_ids.split");
    expect(source).not.toContain("claimStrength");
  });
});
