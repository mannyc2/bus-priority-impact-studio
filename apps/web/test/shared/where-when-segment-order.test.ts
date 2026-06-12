import { describe, expect, test } from "bun:test";
import { prioritizeWhereWhenSegments } from "../../src/components/route/SlowSegments";

const segment = (id: string) => ({ id, label: id });

describe("prioritizeWhereWhenSegments", () => {
  test("floats detector-targeted segments ahead of generic fallback rows", () => {
    const visible = prioritizeWhereWhenSegments(
      [segment("detector"), segment("slow-2")],
      [segment("slow-1"), segment("slow-2"), segment("slow-3")],
    );

    expect(visible.map((row) => row.id)).toEqual(["detector", "slow-2", "slow-1", "slow-3"]);
  });

  test("keeps generic rows when no detector-targeted segments exist", () => {
    const visible = prioritizeWhereWhenSegments([], [segment("slow-1"), segment("slow-2")]);

    expect(visible.map((row) => row.id)).toEqual(["slow-1", "slow-2"]);
  });
});
