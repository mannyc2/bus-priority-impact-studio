import { describe, expect, test } from "bun:test";

describe("studio release D1 replay boundary", () => {
  test("loads serving export rows through the Effect D1 replay boundary", async () => {
    const source = await Bun.file(
      new URL("../../../src/commands/studio/release.ts", import.meta.url),
    ).text();

    expect(source).toContain("runD1ReplayBoundary({");
    expect(source).toContain("loadStudioReleaseD1Context");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new Database");
    expect(source).not.toContain("createBunSqliteServingDb");
  });
});
