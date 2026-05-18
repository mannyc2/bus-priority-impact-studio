import { describe, expect, test } from "bun:test";
import { cn } from "../../src/lib/utils.js";

describe("cn", () => {
  test("joins truthy class names", () => {
    expect(cn("one", false, undefined, "two", null, "three")).toBe("one two three");
  });
});
