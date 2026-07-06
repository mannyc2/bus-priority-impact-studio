import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as z from "@bp/domain/schema-compat";

import {
  readJsonArtifact,
  readJsonIfExists,
  readOptionalJsonArtifact,
  writeJson,
} from "../../src/lib/json.ts";

describe("pipeline JSON helper", () => {
  test("writes pretty JSON through the Effect file-system boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-json-helper-"));
    try {
      const path = join(root, "nested", "artifact.json");
      await writeJson(path, { ok: true });

      await expect(readFile(path, "utf8")).resolves.toBe('{\n  "ok": true\n}\n');
      await expect(readJsonIfExists<{ ok: boolean }>(path)).resolves.toEqual({ ok: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("validates required and optional artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-json-helper-"));
    try {
      const path = join(root, "artifact.json");
      const missingPath = join(root, "missing.json");
      const schema = z.object({ routeId: z.string() });

      await writeJson(path, { routeId: "M15" });

      await expect(readJsonArtifact(path, schema)).resolves.toEqual({ routeId: "M15" });
      await expect(readOptionalJsonArtifact(missingPath, schema)).resolves.toBeNull();
      await expect(readJsonArtifact(missingPath, schema)).rejects.toThrow(
        `Artifact not found at ${missingPath}`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps raw Bun filesystem APIs out of the shared JSON helper", async () => {
    const source = await readFile(resolve(import.meta.dir, "../../src/lib/json.ts"), "utf8");

    expect(source).toContain("runPipelineFileSystemBoundary");
    expect(source).not.toContain("Bun.file");
    expect(source).not.toContain("Bun.write");
  });
});
