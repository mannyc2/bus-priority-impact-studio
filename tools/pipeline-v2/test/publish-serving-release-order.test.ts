import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("publish serving release ordering", () => {
  test("runs completeness, ordinary D1, R2, then final catalog registration", async () => {
    const script = await readFile(
      join(import.meta.dir, "../../../scripts/publish-serving-release.sh"),
      "utf8",
    );
    const gate = script.indexOf("check-publish-completeness.ts");
    const schema = script.indexOf('--file "$schema_sql"');
    const seed = script.indexOf('--file "$seed_sql"');
    const r2 = script.indexOf("publish r2-artifacts");
    const registration = script.indexOf('--file "$map_release_registration_sql"');
    expect(gate).toBeGreaterThan(0);
    expect(schema).toBeGreaterThan(gate);
    expect(seed).toBeGreaterThan(schema);
    expect(r2).toBeGreaterThan(seed);
    expect(registration).toBeGreaterThan(r2);
    expect(script.indexOf("aborting before remote mutation")).toBeGreaterThan(gate);
    expect(
      script.indexOf('map_release_registration_sql="$export_dir/map-release-registration.sql"'),
    ).toBeGreaterThan(0);
  });
});
