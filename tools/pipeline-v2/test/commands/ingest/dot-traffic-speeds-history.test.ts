import { describe, expect, test } from "bun:test";

describe("ingest dot-traffic-speeds-history boundary", () => {
  test("uses the Effect local DB boundary for local DB writes", async () => {
    const source = await Bun.file(
      new URL(
        "../../../src/commands/ingest/dot-traffic-speeds-history.ts",
        import.meta.url,
      ),
    ).text();

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("ingestDotTrafficSpeedsHistory");
    expect(source).toContain('import type { Database } from "bun:sqlite"');
    expect(source).not.toContain("Database as BunDatabase");
    expect(source).not.toContain("new BunDatabase");
  });
});
