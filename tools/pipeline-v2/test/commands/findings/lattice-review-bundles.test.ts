import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/findings/lattice-review-bundles.ts",
  import.meta.url,
);

describe("findings lattice-review-bundles boundary", () => {
  test("keeps route shaping, preview construction, and renderers in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/review-packets"');
    expect(source).toContain("buildLatticeOpportunityPreviewArtifact({");
    expect(source).toContain("renderLatticeOpportunityPreviewMarkdown(artifact)");
    expect(source).toContain("renderLatticeOpportunityPreviewHtml(artifact)");
    expect(source).not.toContain("@bp/analytics");
    expect(source).not.toContain("SPEED_DETECTORS");
    expect(source).not.toContain("buildLatticeOpportunityBundles");
    expect(source).not.toContain("routeInputFromSource");
  });
});
