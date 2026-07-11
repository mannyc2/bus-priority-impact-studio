import {
  decodeEitherPreserve,
  decodeEitherStrict,
  decodeEitherStrip,
  decodePreserve,
  decodeStrict,
  decodeStrip,
} from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";

const NotNaN = Schema.makeFilter<number>((value) => !Number.isNaN(value), {
  message: "Expected number, received NaN",
});

export const CoercedNumberSchema = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Number.check(NotNaN), {
    decode: SchemaGetter.transform(Number),
    encode: SchemaGetter.passthrough(),
  }),
);

export function serviceFreeSchema<S extends Schema.Constraint>(
  schema: S,
): Schema.Codec<S["Type"], S["Encoded"], never, unknown> {
  return Schema.make<Schema.Codec<S["Type"], S["Encoded"], never, unknown>>(schema.ast);
}

export function decodeSchemaStrict<S extends Schema.Constraint>(
  schema: S,
  input: unknown,
): S["Type"] {
  return decodeStrict(serviceFreeSchema(schema))(input);
}

export function decodeSchemaStrip<S extends Schema.Constraint>(
  schema: S,
  input: unknown,
): S["Type"] {
  return decodeStrip(serviceFreeSchema(schema))(input);
}

export function decodeSchemaPreserve<S extends Schema.Constraint>(
  schema: S,
  input: unknown,
): S["Type"] {
  return decodePreserve(serviceFreeSchema(schema))(input);
}

export function decodeSchemaEitherStrict<S extends Schema.Constraint>(schema: S, input: unknown) {
  return decodeEitherStrict(serviceFreeSchema(schema))(input);
}

export function decodeSchemaEitherStrip<S extends Schema.Constraint>(schema: S, input: unknown) {
  return decodeEitherStrip(serviceFreeSchema(schema))(input);
}

export function decodeSchemaEitherPreserve<S extends Schema.Constraint>(schema: S, input: unknown) {
  return decodeEitherPreserve(serviceFreeSchema(schema))(input);
}
