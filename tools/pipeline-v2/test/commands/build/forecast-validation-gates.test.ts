import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/build/forecast-validation-gates.ts",
);

describe("build forecast-validation-gates command boundary", () => {
  test("keeps forecasting validation logic and local SQL in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/forecasting"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("loadSegmentDaypartHistoryLocalDbRows({");
    expect(source).toContain("buildForecastValidationGatesArtifact({");
    expect(source).not.toContain("local_route_segment_speed");
    expect(source).not.toContain("hour_of_day BETWEEN");
  });
});
