import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";

export function decodeSchemaStrict<S extends Schema.Constraint>(
  schema: S,
  input: unknown,
): S["Type"] {
  const serviceFree = Schema.make<Schema.Codec<S["Type"], S["Encoded"], never, unknown>>(
    schema.ast,
  );
  return decodeStrict(serviceFree)(input);
}
