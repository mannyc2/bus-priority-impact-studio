import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { runPipelineFileSystemBoundary } from "../../src/effect/file-system.ts";

describe("pipeline file-system Effect boundary", () => {
  test("writes parent directories and reads JSON through the service", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-file-system-"));
    try {
      const path = join(root, "nested", "artifact.json");
      const result = await runPipelineFileSystemBoundary({
        command: "fixture.files",
        operation: "writeAndRead",
        run: (files) =>
          Effect.gen(function* () {
            yield* files.writeText({
              command: "fixture.files",
              operation: "writeArtifact",
              path,
              contents: `${JSON.stringify({ ok: true })}\n`,
            });
            return yield* files.readJsonIfExists({
              command: "fixture.files",
              operation: "readArtifact",
              path,
            });
          }),
      });

      expect(result).toEqual({ ok: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns null for optional reads of missing files", async () => {
    const result = await runPipelineFileSystemBoundary({
      command: "fixture.files",
      operation: "optionalRead",
      run: (files) =>
        files.readTextIfExists({
          command: "fixture.files",
          operation: "readMissing",
          path: join(tmpdir(), "bp-definitely-missing.json"),
        }),
    });

    expect(result).toBeNull();
  });

  test("wraps JSON parse failures in typed file-system errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-file-system-"));
    try {
      const path = join(root, "bad.json");
      await expect(
        runPipelineFileSystemBoundary({
          command: "fixture.files",
          operation: "parseBadJson",
          run: (files) =>
            Effect.gen(function* () {
              yield* files.writeText({
                command: "fixture.files",
                operation: "writeBadJson",
                path,
                contents: "{",
              });
              return yield* files.readJsonIfExists({
                command: "fixture.files",
                operation: "readBadJson",
                path,
              });
            }),
        }),
      ).rejects.toMatchObject({
        _tag: "PipelineFileSystemError",
        command: "fixture.files",
        operation: "readBadJson",
        path,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
