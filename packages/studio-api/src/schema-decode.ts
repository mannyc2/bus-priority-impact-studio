import {
  decodeEitherPreserve,
  decodeEitherStrict,
  decodeEitherStrip,
  decodeStrict,
} from "@bp/domain/decode";
import { Schema, SchemaIssue } from "effect";

function serviceFreeSchema<S extends Schema.Constraint>(
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

export function decodeSchemaEitherStrict<S extends Schema.Constraint>(schema: S, input: unknown) {
  return decodeEitherStrict(serviceFreeSchema(schema))(input);
}

export function decodeSchemaEitherStrip<S extends Schema.Constraint>(schema: S, input: unknown) {
  return decodeEitherStrip(serviceFreeSchema(schema))(input);
}

export function decodeSchemaEitherPreserve<S extends Schema.Constraint>(schema: S, input: unknown) {
  return decodeEitherPreserve(serviceFreeSchema(schema))(input);
}

export function schemaErrorIssues(error: Schema.SchemaError) {
  return SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues;
}
