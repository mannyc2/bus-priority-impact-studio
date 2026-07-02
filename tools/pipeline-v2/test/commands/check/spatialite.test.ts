import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLocalPipelineDb } from "@bp/db/local";
import { runCheckSpatialite } from "../../../src/commands/check/spatialite.ts";
import type { OpenLocalPipelineDb } from "../../../src/lib/local-db.ts";

const commandPath = join(import.meta.dir, "../../../src/commands/check/spatialite.ts");

function makeLocal(spatialite: OpenLocalPipelineDb["spatialite"]): OpenLocalPipelineDb {
  const sqlite = new Database(":memory:");
  return {
    db: createLocalPipelineDb(sqlite),
    sqlite,
    path: "fixture.sqlite",
    spatialite,
  };
}

describe("check spatialite command", () => {
  test("requests spatialite through the Effect local DB layer", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { spatial: true }");
    expect(source).not.toContain("withLocalDb");
    expect(source).not.toContain("localDbFromCtx");
  });

  test("reports the loaded spatialite extension metadata", () => {
    const local = makeLocal({ path: "/tmp/mod_spatialite.so", version: "5.1.0" });
    try {
      expect(runCheckSpatialite({ local })).toEqual({
        ok: true,
        path: "/tmp/mod_spatialite.so",
        version: "5.1.0",
      });
    } finally {
      local.sqlite.close();
    }
  });

  test("reports unavailable spatialite without throwing", () => {
    const local = makeLocal(null);
    try {
      expect(runCheckSpatialite({ local })).toEqual({
        ok: false,
        path: null,
        version: null,
      });
    } finally {
      local.sqlite.close();
    }
  });
});
