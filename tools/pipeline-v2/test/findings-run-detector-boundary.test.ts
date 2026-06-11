import { describe, expect, test } from "bun:test";

function extractModuleSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of text.matchAll(pattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) specifiers.push(specifier);
  }

  return specifiers;
}

describe("findings run-detector boundary", () => {
  test("keeps detector study logic out of the pipeline command", async () => {
    const text = await Bun.file(
      new URL("../src/commands/findings/run-detector.ts", import.meta.url),
    ).text();

    expect(text).toContain("@bp/applied-research/detector-runs");
    expect(text).toContain("@bp/applied-research/local-db");
    expect(text).not.toContain("@bp/analytics");
    expect(text).not.toContain("detectSpeedPaceHotspots");
    expect(text).not.toContain("detectHeadwayReliabilityEwt");
    expect(text).not.toContain("detectDelayConcentration");
  });

  test("keeps pipeline-v2 source from importing the analytics detector registry directly", async () => {
    const glob = new Bun.Glob("**/*.ts");
    const srcRoot = new URL("../src/", import.meta.url);

    for await (const path of glob.scan({ cwd: srcRoot.pathname, onlyFiles: true })) {
      const text = await Bun.file(new URL(path, srcRoot)).text();
      const specifiers = extractModuleSpecifiers(text);
      expect(specifiers, `src/${path}`).not.toContain("@bp/analytics/registry");
    }
  });
});
