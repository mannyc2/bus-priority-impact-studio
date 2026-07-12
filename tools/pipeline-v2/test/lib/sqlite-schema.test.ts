import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  SqlNullableNumberSchema,
  SqlNumberSchema,
} from "../../src/lib/local-db-aggregates/sqlite-schema.ts";

describe("SQLite numeric schemas", () => {
  test("decodes SQLite number representations without changing valid values", () => {
    expect(decodeStrict(SqlNumberSchema)(12.5)).toBe(12.5);
    expect(decodeStrict(SqlNumberSchema)(12n)).toBe(12);
    expect(decodeStrict(SqlNumberSchema)("12.5")).toBe(12.5);
    expect(decodeStrict(SqlNumberSchema)("Infinity")).toBe(Number.POSITIVE_INFINITY);
  });

  test("rejects non-numeric strings", () => {
    expect(() => decodeStrict(SqlNumberSchema)("not-a-number")).toThrow();
  });

  test("normalizes nullable SQLite representations", () => {
    expect(decodeStrict(SqlNullableNumberSchema)(null)).toBeNull();
    expect(decodeStrict(SqlNullableNumberSchema)(undefined)).toBeNull();
    expect(decodeStrict(SqlNullableNumberSchema)("")).toBeNull();
    expect(decodeStrict(SqlNullableNumberSchema)("7.25")).toBe(7.25);
  });
});
