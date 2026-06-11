import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

describe("local DB test migration root", () => {
  test("test helpers use the live Drizzle migration journal", async () => {
    const staleRoot = ["migrations", "local"].join("/");
    const testRoot = fileURLToPath(new URL(".", import.meta.url));
    const filesWithStaleRoot: string[] = [];
    const glob = new Bun.Glob("*.test.ts");

    for await (const path of glob.scan({ cwd: testRoot, onlyFiles: true })) {
      const text = await Bun.file(new URL(path, import.meta.url)).text();
      if (text.includes(staleRoot)) {
        filesWithStaleRoot.push(path);
      }
    }

    expect(filesWithStaleRoot).toEqual([]);
  });
});
