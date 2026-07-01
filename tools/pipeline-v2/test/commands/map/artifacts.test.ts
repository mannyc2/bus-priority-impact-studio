import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fromRepoRoot } from "../../../src/lib/paths.ts";

const commandPath = fromRepoRoot("tools/pipeline-v2/src/commands/map/artifacts.ts");

describe("map artifacts command boundary", () => {
  test("delegates path, manifest, and hash policy to analytics while keeping file reads in pipeline", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/analytics/evaluation"');
    expect(source).not.toContain('import { createHash } from "node:crypto"');
    expect(source).not.toContain("function hashBytes");
    expect(source).not.toContain("function artifactPayloadIssues");
    expect(source).not.toContain("function isMapArtifactManifest");
    expect(source).not.toContain("export type MapArtifactManifest =");
  });
});
