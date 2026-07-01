import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createLocalPipelineDb } from "@bp/db/local";
import { Layer } from "effect";
import {
  runLocalDbCommandBoundary,
  LocalDbCommandServiceLayer,
  runLocalDbCommand,
} from "../../src/effect/local-db-command.ts";
import { LocalDbConnection } from "../../src/effect/local-db.ts";
import { runPipelineEffect } from "../../src/effect/runtime.ts";
import type { OpenLocalPipelineDb } from "../../src/lib/local-db.ts";

function makeFixtureLocalDb(): OpenLocalPipelineDb {
  const sqlite = new Database(":memory:");
  return {
    db: createLocalPipelineDb(sqlite),
    sqlite,
    path: "fixture.sqlite",
    spatialite: null,
  };
}

describe("local DB command Effect workflows", () => {
  test("runs command tasks through the injected local DB connection", async () => {
    const local = makeFixtureLocalDb();
    const layer = LocalDbCommandServiceLayer.pipe(
      Layer.provide(Layer.succeed(LocalDbConnection, local)),
    );

    try {
      await expect(
        runPipelineEffect(
          runLocalDbCommand({
            command: "fixture.command",
            operation: "fixtureTask",
            spanAttributes: {
              routeId: "B41",
            },
            run: async (db) => ({
              path: db.path,
            }),
          }),
          layer,
        ),
      ).resolves.toEqual({
        path: "fixture.sqlite",
      });
    } finally {
      local.sqlite.close();
    }
  });

  test("preserves typed command errors at the runtime boundary", async () => {
    const local = makeFixtureLocalDb();
    const layer = LocalDbCommandServiceLayer.pipe(
      Layer.provide(Layer.succeed(LocalDbConnection, local)),
    );

    try {
      await expect(
        runPipelineEffect(
          runLocalDbCommand({
            command: "fixture.command",
            operation: "fixtureTask",
            run: async () => {
              throw new Error("boom");
            },
          }),
          layer,
        ),
      ).rejects.toMatchObject({
        _tag: "PipelineLocalDbCommandError",
        command: "fixture.command",
        operation: "fixtureTask",
      });
    } finally {
      local.sqlite.close();
    }
  });

  test("runs the CLI boundary helper with an opened local DB layer", async () => {
    await expect(
      runLocalDbCommandBoundary({
        dbPath: ":memory:",
        command: "fixture.boundary",
        operation: "fixtureTask",
        run: async (db) => ({
          path: db.path,
          spatialite: db.spatialite,
        }),
      }),
    ).resolves.toEqual({
      path: ":memory:",
      spatialite: null,
    });
  });
});
