import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { inspectStructFields } from "../../src/cli/schema-introspect.ts";

describe("native CLI schema introspection", () => {
  test("reports primitive, optional, default, array, and description metadata", () => {
    const options = Schema.Struct({
      name: Schema.String.annotate({ description: "Display name" }),
      count: Schema.optionalKey(Schema.Number),
      enabled: Schema.Boolean.pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed(true)),
      ).annotate({ description: "Enable the operation" }),
      routes: Schema.Array(Schema.String),
    });

    expect(inspectStructFields(options)).toEqual([
      {
        key: "name",
        description: "Display name",
        optional: false,
        hasDefault: false,
        defaultValue: undefined,
        baseType: "string",
      },
      {
        key: "count",
        description: undefined,
        optional: true,
        hasDefault: false,
        defaultValue: undefined,
        baseType: "number",
      },
      {
        key: "enabled",
        description: "Enable the operation",
        optional: true,
        hasDefault: true,
        defaultValue: true,
        baseType: "boolean",
      },
      {
        key: "routes",
        description: undefined,
        optional: false,
        hasDefault: false,
        defaultValue: undefined,
        baseType: "array",
      },
    ]);
  });

  test("rejects record-like option schemas", () => {
    expect(() => inspectStructFields(Schema.Record(Schema.String, Schema.String))).toThrow(
      "CLI options schema must be a struct with named fields.",
    );
  });
});
