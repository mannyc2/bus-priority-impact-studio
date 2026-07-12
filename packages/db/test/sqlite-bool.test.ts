import { describe, expect, test } from "bun:test";
import { sqliteBool } from "../src/d1/queries/shared.js";

describe("sqliteBool", () => {
  test("normalizes SQLite boolean row values", () => {
    expect(sqliteBool(0)).toBe(false);
    expect(sqliteBool(1)).toBe(true);
    expect(sqliteBool(false)).toBe(false);
    expect(sqliteBool(true)).toBe(true);
  });
});
