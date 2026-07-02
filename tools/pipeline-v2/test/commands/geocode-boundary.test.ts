import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const geocodeCommandFiles = [
  "311.ts",
  "nypd-collisions.ts",
  "parking-violations.ts",
  "permits.ts",
  "traffic-speeds.ts",
  "traffic-volumes.ts",
];

describe("geocode command boundaries", () => {
  test("use the Effect local DB layer with spatialite instead of Liche local DB middleware", () => {
    for (const file of geocodeCommandFiles) {
      const source = readFileSync(
        join(import.meta.dir, "../../src/commands/geocode", file),
        "utf8",
      );

      expect(source).toContain("runLocalDbCommandBoundary({");
      expect(source).toContain("localDbOptions: { spatial: true }");
      expect(source).not.toContain("withLocalDb");
      expect(source).not.toContain("localDbFromCtx");
    }
  });
});
