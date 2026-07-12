import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("publish serving release ordering", () => {
  test("runs completeness before every remote mutation", async () => {
    const script = await readFile(
      join(import.meta.dir, "../../../scripts/publish-serving-release.sh"),
      "utf8",
    );
    const gate = script.indexOf("check-publish-completeness.ts");
    expect(gate).toBeGreaterThan(0);
    for (const mutation of ["wrangler d1 execute", "publish r2-artifacts"]) {
      expect(script.indexOf(mutation)).toBeGreaterThan(gate);
    }
    expect(script.indexOf("aborting before remote mutation")).toBeGreaterThan(gate);
  });
});
