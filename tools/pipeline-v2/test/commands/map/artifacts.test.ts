import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  normalizeBusLaneBorough,
  normalizeBusLaneOpenDate,
} from "../../../src/commands/map/artifacts.ts";
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

  test("normalizes publishable NYC DOT bus-lane boroughs and dates", () => {
    expect(normalizeBusLaneBorough("MAN")).toBe("Manhattan");
    expect(normalizeBusLaneBorough("QNS")).toBe("Queens");
    expect(normalizeBusLaneBorough("BX, MN")).toBeNull();
    expect(normalizeBusLaneOpenDate("4/3/1986")).toBe("1986-04-03");
    expect(normalizeBusLaneOpenDate("09/02/12")).toBe("2012-09-02");
    expect(normalizeBusLaneOpenDate("8/24/82, 10/10/10")).toBeNull();
    expect(normalizeBusLaneOpenDate("2/30/2020")).toBeNull();
  });
});
