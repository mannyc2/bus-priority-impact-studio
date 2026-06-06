import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const commandPath = "tools/pipeline-v2/src/commands/brief/artifacts.ts";

describe("brief artifacts command boundary", () => {
  test("delegates brief rendering and file metadata to applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/route-briefs"');
    expect(source).toContain("routeBriefFiles(route)");
    expect(source).toContain("corridorBriefFiles(corridor)");
    expect(source).toContain("briefFileMetadata(file)");
    expect(source).toContain("buildObservedReliabilityWindows({");
    expect(source).not.toContain('import { createHash } from "node:crypto"');
    expect(source).not.toContain("function observedWindow");
    expect(source).not.toContain("function expectedWaitMinutes");
    expect(source).not.toContain("function quantile");
    expect(source).not.toContain("function monthTimeBounds");
    expect(source).not.toContain("function routeJson");
    expect(source).not.toContain("function routeMarkdown");
    expect(source).not.toContain("function corridorJson");
    expect(source).not.toContain("function corridorMarkdown");
    expect(source).not.toContain("function htmlPage");
    expect(source).not.toContain("function routeBriefKey");
    expect(source).not.toContain("function corridorBriefKey");
  });
});
