import { Schema, SchemaGetter } from "effect";

const NotNaN = Schema.makeFilter<number>((value) => !Number.isNaN(value), {
  message: "Expected number, received NaN",
});

const BigIntToNumber = Schema.BigInt.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform(Number),
    encode: SchemaGetter.transform(BigInt),
  }),
);

const StringToNumber = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.decodeTo(Schema.Number.check(NotNaN), {
    decode: SchemaGetter.transform(Number),
    encode: SchemaGetter.transform(String),
  }),
);

export const SqlNumberSchema = Schema.Union([Schema.Number, BigIntToNumber, StringToNumber]);

const NullFromUndefined = Schema.Undefined.pipe(
  Schema.decodeTo(Schema.Null, {
    decode: SchemaGetter.transform(() => null),
    encode: SchemaGetter.transform(() => undefined),
  }),
);

const NullFromEmptyString = Schema.Literal("").pipe(
  Schema.decodeTo(Schema.Null, {
    decode: SchemaGetter.transform(() => null),
    encode: SchemaGetter.transform(() => ""),
  }),
);

export const SqlNullableNumberSchema = Schema.Union([
  Schema.Null,
  NullFromUndefined,
  NullFromEmptyString,
  SqlNumberSchema,
]);
