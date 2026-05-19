import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createLocalPipelineDb } from "@bp/db/local";
import { type Geoclient, GeoclientHttpError } from "@bp/sources/nyc-geoclient";
import { Geocoder } from "../src/lib/geocoder.js";

function createFixtureDb(): { sqlite: Database; db: ReturnType<typeof createLocalPipelineDb> } {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_address_geocode (
      raw_key text PRIMARY KEY NOT NULL,
      source_label text NOT NULL,
      input_kind text NOT NULL,
      input_json text NOT NULL,
      physical_id text,
      lat real,
      lng real,
      confidence text,
      error_reason text,
      geocoded_at text NOT NULL,
      raw_response text
    );
    CREATE TABLE local_lion_segment (
      physical_id text PRIMARY KEY NOT NULL,
      street_name text,
      borough text
    );
    INSERT INTO local_lion_segment (physical_id, street_name, borough)
    VALUES ('12345', 'BADWAY', 'X');
  `);
  return { sqlite, db: createLocalPipelineDb(sqlite) };
}

describe("Geocoder", () => {
  let sqlite: Database | null = null;
  const originalWarn = console.warn;

  afterEach(() => {
    console.warn = originalWarn;
    sqlite?.close();
    sqlite = null;
  });

  test("caches non-auth Geoclient 4xx responses as durable misses before fuzzy fallback", async () => {
    console.warn = () => {};
    const fixture = createFixtureDb();
    sqlite = fixture.sqlite;
    const geoclient: Geoclient = {
      address: async () => {
        throw new GeoclientHttpError("bad address", 400);
      },
      intersection: async () => null,
      search: async () => null,
    };
    const geocoder = new Geocoder({
      db: fixture.db,
      sqlite: fixture.sqlite,
      sourceLabel: "test_source",
      geoclient,
    });

    const outcome = await geocoder.resolve({
      kind: "address",
      houseNumber: "1",
      street: "BADWAY",
      borough: "bronx",
    });

    expect(outcome.physicalId).toBeNull();
    expect(outcome.confidence).toBe("geoclient_http_400");

    const cached = fixture.sqlite
      .query<{ error_reason: string | null; physical_id: string | null }, []>(
        "SELECT error_reason, physical_id FROM local_address_geocode",
      )
      .get();
    expect(cached).toEqual({ error_reason: "geoclient_http_400", physical_id: null });
  });
});
