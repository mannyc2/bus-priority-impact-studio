import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { defineIngestCommand } from "../../../src/commands/ingest/_define-ingest-command.ts";
import { dbOptions } from "../../../src/lib/local-db.ts";

describe("defineIngestCommand", () => {
  test("routes descriptor execution through the local DB command boundary", async () => {
    const command = defineIngestCommand({
      path: ["ingest", "fixture"],
      summary: "Fixture ingest.",
      options: dbOptions,
      output: Schema.Struct({ path: Schema.String }),
      operation: "runFixtureIngest",
      runner: async (local) => ({ path: local.path }),
    });

    await expect(
      command.run({ ctx: { isTty: false }, input: { options: { db: ":memory:" } } }),
    ).resolves.toEqual({ path: ":memory:" });
  });
});
