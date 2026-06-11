import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fromRepoRoot } from "../../../src/lib/paths.ts";

const commandPath = fromRepoRoot("tools/pipeline-v2/src/commands/map/artifacts.ts");

describe("map artifacts command boundary", () => {
  test("delegates manifest, path, and hash policy to applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).not.toContain('import { createHash } from "node:crypto"');
    expect(source).not.toContain("function hashBytes");
    expect(source).not.toContain("function verifyArtifactFile");
    expect(source).not.toContain("function artifactPayloadIssues");
    expect(source).not.toContain("function isMapArtifactManifest");
    expect(source).not.toContain("export type MapArtifactManifest =");
  });
});
