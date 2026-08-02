import { describe, expect, test } from "bun:test";

describe("candidate-addressed D1 inputs", () => {
  test("has no frozen timeline or detector compatibility decoder", async () => {
    const [inputs, exporter, capability] = await Promise.all([
      Bun.file(new URL("../../../src/commands/export/d1-inputs.ts", import.meta.url)).text(),
      Bun.file(new URL("../../../src/commands/export/d1.ts", import.meta.url)).text(),
      Bun.file(
        new URL("../../../src/commands/export/route-capability-manifest.ts", import.meta.url),
      ).text(),
    ]);

    for (const source of [inputs, exporter, capability]) {
      expect(source).not.toContain("routeTimelineProjectionPath");
      expect(source).not.toContain("detectorReadinessManifestPath");
      expect(source).not.toContain("route-timeline-serving-projection.json");
    }
    expect(inputs).toContain("routeEvidenceIndexPath");
    expect(inputs).not.toContain('join(input.artifactRoot, "docs")');
  });
});
