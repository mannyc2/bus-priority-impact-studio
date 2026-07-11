import { describe, expect, test } from "bun:test";
import { decodeEitherStrict, decodePreserve, decodeStrict, decodeStrip } from "@bp/domain/decode";
import { Result, Schema } from "effect";

const Person = Schema.Struct({
  name: Schema.String,
  address: Schema.Struct({ zip: Schema.String }),
});

describe("domain decode policies", () => {
  test("strict rejects unknown keys", () => {
    expect(() =>
      decodeStrict(Person)({
        name: "Ada",
        address: { zip: "10001" },
        extra: true,
      }),
    ).toThrow();
    expect(
      Result.isFailure(
        decodeEitherStrict(Person)({
          name: "Ada",
          address: { zip: "10001" },
          extra: true,
        }),
      ),
    ).toBe(true);
  });

  test("strip drops unknown keys", () => {
    expect(
      decodeStrip(Person)({
        name: "Ada",
        address: { zip: "10001" },
        extra: true,
      }),
    ).toEqual({
      name: "Ada",
      address: { zip: "10001" },
    });
  });

  test("preserve keeps unknown keys", () => {
    const decoded = decodePreserve(Person)({
      name: "Ada",
      address: { zip: "10001" },
      extra: true,
    });
    expect(decoded.name).toBe("Ada");
    expect(decoded.address.zip).toBe("10001");
    expect(decoded).toHaveProperty("extra", true);
  });

  test("nested failures retain the field path", () => {
    expect(() => decodeStrict(Person)({ name: "Ada", address: { zip: 10001 } })).toThrow(
      /address.*zip/s,
    );
  });
});
