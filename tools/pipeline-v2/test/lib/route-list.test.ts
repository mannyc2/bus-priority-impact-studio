import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { writeJson } from "../../src/lib/json.ts";
import { loadRouteListFromFile, mergeRoutesWithFile } from "../../src/lib/route-list.ts";

describe("route-list helper", () => {
  test("loads, trims, dedupes, and sorts route ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-route-list-"));
    try {
      const path = join(root, "routes.json");
      await writeJson(path, [" M15 ", "B44", "M15"]);

      await expect(loadRouteListFromFile(path)).resolves.toEqual(["B44", "M15"]);
      await expect(mergeRoutesWithFile(["Q44", "B44"], path)).resolves.toEqual([
        "B44",
        "M15",
        "Q44",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects missing and malformed route list files", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-route-list-"));
    try {
      const missingPath = join(root, "missing.json");
      const malformedPath = join(root, "malformed.json");
      await writeJson(malformedPath, ["M15", 42]);

      await expect(loadRouteListFromFile(missingPath)).rejects.toThrow(
        `Route list file not found: ${missingPath}`,
      );
      await expect(loadRouteListFromFile(malformedPath)).rejects.toThrow(
        "Route list file contains a non-string route id at index 1.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps raw Bun reads out of the route-list helper", async () => {
    const source = await readFile(resolve(import.meta.dir, "../../src/lib/route-list.ts"), "utf8");

    expect(source).toContain("readJsonIfExists");
    expect(source).not.toContain("Bun.file");
  });
});
