import { Schema } from "effect";

type DecodePolicy = "error" | "ignore" | "preserve";

function decoder(policy: DecodePolicy) {
  return <S extends Schema.ConstraintDecoder<unknown>>(schema: S) =>
    Schema.decodeUnknownSync(schema, { onExcessProperty: policy });
}

function resultDecoder(policy: DecodePolicy) {
  return <S extends Schema.ConstraintDecoder<unknown>>(schema: S) =>
    Schema.decodeUnknownResult(schema, { onExcessProperty: policy });
}

export const decodeStrict = decoder("error");
export const decodeStrip = decoder("ignore");
export const decodePreserve = decoder("preserve");

export const decodeEitherStrict = resultDecoder("error");
export const decodeEitherStrip = resultDecoder("ignore");
export const decodeEitherPreserve = resultDecoder("preserve");
