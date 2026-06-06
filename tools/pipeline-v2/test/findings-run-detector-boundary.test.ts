import { describe, expect, test } from "bun:test";

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
});
