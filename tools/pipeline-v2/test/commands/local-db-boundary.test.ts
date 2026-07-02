import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function commandSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return commandSourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("pipeline command local DB boundaries", () => {
  test("do not use Liche local DB middleware/context plumbing", () => {
    const files = commandSourceFiles(join(import.meta.dir, "../../src/commands"));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");

      expect(source).not.toContain("withLocalDb");
      expect(source).not.toContain("localDbFromCtx");
      expect(source).not.toContain("openLocalPipelineDb");
    }
  });

  test("keeps Liche local DB middleware helpers deleted from the shared DB module", () => {
    const source = readFileSync(join(import.meta.dir, "../../src/lib/local-db.ts"), "utf8");

    expect(source).not.toContain("withLocalDb");
    expect(source).not.toContain("localDbFromCtx");
    expect(source).not.toContain("middleware");
  });
});
