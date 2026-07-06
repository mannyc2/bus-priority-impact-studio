import { describe, expect, test } from "bun:test";
import { formatResult } from "../../src/cli/json-output.ts";

describe("CLI JSON output", () => {
  test("keeps --json as the command result object without a framework envelope", () => {
    const result = { sources: ["bus_hourly_ridership_2025"] };
    expect(formatResult(result, { json: true, fullOutput: false })).toBe(
      JSON.stringify(result, null, 2),
    );
  });

  test("does not print undefined command results", () => {
    expect(formatResult(undefined, { json: false, fullOutput: false })).toBeNull();
  });
});
