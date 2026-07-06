import type { Brand } from "effect";
import { Effect, Schema, SchemaGetter } from "effect";

type ParseMode = "strip" | "strict" | "passthrough";
type SchemaKind =
  | "string"
  | "number"
  | "boolean"
  | "bigint"
  | "array"
  | "object"
  | "record"
  | "tuple"
  | "union"
  | "literal"
  | "unknown";

export type SafeParseResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        issues: ReadonlyArray<{
          path: ReadonlyArray<string | number>;
          message: string;
          code?: string;
          keys?: ReadonlyArray<string>;
        }>;
      };
    };

export interface ZodType<T = unknown, Optional extends boolean = boolean> extends Schema.Schema<T> {
  readonly Type: T;
  readonly __optional?: Optional;
  parse(input: unknown): T;
  safeParse(input: unknown): SafeParseResult<T>;
  optional(): ZodType<T | undefined, true>;
  nullable(): ZodType<T | null, Optional>;
  default(value: T): ZodType<T, false>;
  transform<TOutput>(transformer: (value: T) => TOutput): ZodType<TOutput, false>;
  superRefine(refiner: (value: T, context: RefinementContext) => void): ZodType<T, Optional>;
  readonly(): ZodType<Readonly<T>, Optional>;
  describe(description: string): ZodType<T, Optional>;
  meta(metadata: Record<string, unknown>): ZodType<T, Optional>;
  brand<B extends string>(): ZodType<T & Brand.Brand<B>, Optional>;
}

export interface ZodString<Optional extends boolean = false> extends ZodType<string, Optional> {
  min(length: number): ZodString<Optional>;
  max(length: number): ZodString<Optional>;
  length(length: number): ZodString<Optional>;
  regex(pattern: RegExp, message?: string): ZodString<Optional>;
  email(): ZodString<Optional>;
  url(): ZodString<Optional>;
}

export interface ZodNumber<Optional extends boolean = false> extends ZodType<number, Optional> {
  int(): ZodNumber<Optional>;
  min(value: number): ZodNumber<Optional>;
  max(value: number): ZodNumber<Optional>;
  nonnegative(): ZodNumber<Optional>;
  positive(): ZodNumber<Optional>;
}

export interface ZodEnum<TValues extends readonly [string, ...string[]]>
  extends ZodType<TValues[number], false> {
  readonly options: TValues;
}

export interface ZodArray<TItem extends ZodType, Optional extends boolean = false>
  extends ZodType<Array<output<TItem>>, Optional> {
  min(length: number): ZodArray<TItem, Optional>;
  max(length: number): ZodArray<TItem, Optional>;
  length(length: number): ZodArray<TItem, Optional>;
}

type OutputShape<TShape extends Record<string, ZodType>> = {
  [K in keyof TShape as TShape[K] extends ZodType<unknown, true> ? never : K]: output<TShape[K]>;
} & {
  [K in keyof TShape as TShape[K] extends ZodType<unknown, true> ? K : never]?: output<TShape[K]>;
};

export interface ZodObject<TShape extends Record<string, ZodType> = Record<string, ZodType>>
  extends ZodType<OutputShape<TShape>> {
  strict(): ZodObject<TShape>;
  strip(): ZodObject<TShape>;
  passthrough(): ZodObject<TShape>;
  describe(description: string): ZodObject<TShape>;
  meta(metadata: Record<string, unknown>): ZodObject<TShape>;
  extend<TExtension extends Record<string, ZodType>>(
    extension: TExtension,
  ): ZodObject<TShape & TExtension>;
}

export type ZodTypeAny = ZodType<unknown>;
export type output<TSchema extends ZodType> = TSchema extends ZodType<infer T> ? T : never;
export type input<TSchema extends ZodType> = TSchema["Encoded"];

export type RefinementIssue = {
  path?: ReadonlyArray<string | number>;
  message: string;
  code?: string;
};

export type RefinementContext = {
  addIssue(issue: RefinementIssue): void;
};

export type SchemaInfo = {
  kind: SchemaKind | undefined;
  description: string | undefined;
  optional: boolean;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
  innerType: ZodType | undefined;
};

const modeBySchema = new WeakMap<object, ParseMode>();
const kindBySchema = new WeakMap<object, SchemaKind>();
const objectFieldsBySchema = new WeakMap<object, Record<string, ZodType>>();
const descriptionBySchema = new WeakMap<object, string>();
const optionalBySchema = new WeakMap<object, boolean>();
const nullableBySchema = new WeakMap<object, boolean>();
const defaultBySchema = new WeakMap<object, unknown>();
const innerTypeBySchema = new WeakMap<object, ZodType>();

function parseOptionsFor(schema: object): { onExcessProperty?: "error" | "ignore" | "preserve" } {
  const mode = modeBySchema.get(schema);
  if (mode === "strict") return { onExcessProperty: "error" };
  if (mode === "passthrough") return { onExcessProperty: "preserve" };
  return { onExcessProperty: "ignore" };
}

function makeIssue(error: unknown): { path: ReadonlyArray<string | number>; message: string } {
  return { path: [], message: error instanceof Error ? error.message : String(error) };
}

function cloneSchema<T, Optional extends boolean>(
  schema: ZodType<T, Optional>,
  mode = modeBySchema.get(schema),
): ZodType<T, Optional> {
  const clone = Object.create(schema) as ZodType<T, Optional>;
  const fields = objectFieldsBySchema.get(schema);
  if (fields !== undefined) objectFieldsBySchema.set(clone, fields);
  const kind = kindBySchema.get(schema);
  if (kind !== undefined) kindBySchema.set(clone, kind);
  const description = descriptionBySchema.get(schema);
  if (description !== undefined) descriptionBySchema.set(clone, description);
  const optional = optionalBySchema.get(schema);
  if (optional !== undefined) optionalBySchema.set(clone, optional);
  const nullable = nullableBySchema.get(schema);
  if (nullable !== undefined) nullableBySchema.set(clone, nullable);
  if (defaultBySchema.has(schema)) defaultBySchema.set(clone, defaultBySchema.get(schema));
  const innerType = innerTypeBySchema.get(schema);
  if (innerType !== undefined) innerTypeBySchema.set(clone, innerType);
  if (mode !== undefined) modeBySchema.set(clone, mode);
  return enhance(clone);
}

function check<T, Optional extends boolean>(
  schema: ZodType<T, Optional>,
  filter: unknown,
): ZodType<T, Optional> {
  const checked = (schema as { check: (filter: unknown) => Schema.Schema<T> }).check(filter);
  return copyMetadata(schema, enhance(checked as ZodType<T, Optional>));
}

function annotate<T, Optional extends boolean>(
  schema: ZodType<T, Optional>,
  metadata: Record<string, unknown>,
): ZodType<T, Optional> {
  const annotated = (
    schema as { annotate: (metadata: Record<string, unknown>) => Schema.Schema<T> }
  ).annotate(metadata);
  return copyMetadata(schema, enhance(annotated as ZodType<T, Optional>));
}

function copyMetadata<T, Optional extends boolean>(
  from: ZodType<unknown>,
  to: ZodType<T, Optional>,
): ZodType<T, Optional> {
  const mode = modeBySchema.get(from);
  if (mode !== undefined) modeBySchema.set(to, mode);
  const kind = kindBySchema.get(from);
  if (kind !== undefined) kindBySchema.set(to, kind);
  const fields = objectFieldsBySchema.get(from);
  if (fields !== undefined) objectFieldsBySchema.set(to, fields);
  const description = descriptionBySchema.get(from);
  if (description !== undefined) descriptionBySchema.set(to, description);
  const optional = optionalBySchema.get(from);
  if (optional !== undefined) optionalBySchema.set(to, optional);
  const nullable = nullableBySchema.get(from);
  if (nullable !== undefined) nullableBySchema.set(to, nullable);
  if (defaultBySchema.has(from)) defaultBySchema.set(to, defaultBySchema.get(from));
  const innerType = innerTypeBySchema.get(from);
  if (innerType !== undefined) innerTypeBySchema.set(to, innerType);
  return enhance(to);
}

function rememberWrapper<T, Optional extends boolean>(
  wrapper: ZodType<T, Optional>,
  inner: ZodType,
): ZodType<T, Optional> {
  innerTypeBySchema.set(wrapper, inner);
  return wrapper;
}

function withDescription<T, Optional extends boolean>(
  schema: ZodType<T, Optional>,
  description: string,
): ZodType<T, Optional> {
  descriptionBySchema.set(schema, description);
  Object.defineProperty(schema, "description", {
    value: description,
    configurable: true,
    enumerable: false,
  });
  return schema;
}

function enhance<T, Optional extends boolean = false>(
  schema: ZodType<T, Optional>,
): ZodType<T, Optional> {
  Object.assign(schema, {
    parse(input: unknown): T {
      return Schema.decodeUnknownSync(schema as never, parseOptionsFor(schema))(input) as T;
    },
    safeParse(input: unknown): SafeParseResult<T> {
      try {
        return { success: true, data: schema.parse(input) };
      } catch (error) {
        return { success: false, error: { issues: [makeIssue(error)] } };
      }
    },
    optional(): ZodType<T | undefined, true> {
      const optionalSchema = copyMetadata(
        schema,
        enhance(Schema.optional(schema as never) as unknown as ZodType<T | undefined, true>),
      );
      optionalBySchema.set(optionalSchema, true);
      return rememberWrapper(optionalSchema, schema);
    },
    nullable(): ZodType<T | null, Optional> {
      const nullableSchema = copyMetadata(
        schema,
        enhance(Schema.NullOr(schema as never) as unknown as ZodType<T | null, Optional>),
      );
      nullableBySchema.set(nullableSchema, true);
      return rememberWrapper(nullableSchema, schema);
    },
    default(value: T): ZodType<T, false> {
      const defaultSchema = copyMetadata(
        schema,
        enhance(
          (schema as Schema.Schema<T>).pipe(
            Schema.withDecodingDefaultType(Effect.succeed(value)),
          ) as unknown as ZodType<T, false>,
        ),
      );
      defaultBySchema.set(defaultSchema, value);
      return rememberWrapper(defaultSchema, schema);
    },
    transform<TOutput>(transformer: (value: T) => TOutput): ZodType<TOutput, false> {
      const outputSchema = Schema.Unknown as Schema.Schema<TOutput>;
      const transformed = (schema as Schema.Schema<T>).pipe(
        Schema.decodeTo(outputSchema, {
          decode: SchemaGetter.transform<Schema.Codec.Encoded<typeof outputSchema>, T>(
            (value) => transformer(value) as Schema.Codec.Encoded<typeof outputSchema>,
          ),
          encode: SchemaGetter.transform<T, Schema.Codec.Encoded<typeof outputSchema>>(
            (value) => value as unknown as T,
          ),
        }),
      );
      return copyMetadata(schema, enhance(transformed as unknown as ZodType<TOutput, false>));
    },
    superRefine(refiner: (value: T, context: RefinementContext) => void): ZodType<T, Optional> {
      return check(
        schema,
        Schema.makeFilter<T>((value) => {
          const issues: RefinementIssue[] = [];
          refiner(value, {
            addIssue(issue) {
              issues.push(issue);
            },
          });
          return issues.map((issue) => ({
            path: issue.path ?? [],
            issue: issue.message,
          }));
        }),
      );
    },
    readonly(): ZodType<Readonly<T>, Optional> {
      return cloneSchema(schema as unknown as ZodType<Readonly<T>, Optional>);
    },
    describe(description: string): ZodType<T, Optional> {
      return withDescription(annotate(schema, { description }), description);
    },
    meta(metadata: Record<string, unknown>): ZodType<T, Optional> {
      return annotate(schema, metadata);
    },
    brand<B extends string>(): ZodType<T & Brand.Brand<B>, Optional> {
      const identifier = "DomainBrand" as B;
      return copyMetadata(
        schema,
        enhance(
          (schema as Schema.Schema<T>).pipe(Schema.brand(identifier)) as unknown as ZodType<
            T & Brand.Brand<B>,
            Optional
          >,
        ),
      );
    },
  });

  const kind = kindBySchema.get(schema);
  if (kind === "string") {
    Object.assign(schema, {
      min(length: number): ZodString<Optional> {
        return check(schema, Schema.isMinLength(length)) as unknown as ZodString<Optional>;
      },
      max(length: number): ZodString<Optional> {
        return check(schema, Schema.isMaxLength(length)) as unknown as ZodString<Optional>;
      },
      length(length: number): ZodString<Optional> {
        return check(
          schema,
          Schema.isLengthBetween(length, length),
        ) as unknown as ZodString<Optional>;
      },
      regex(pattern: RegExp, _message?: string): ZodString<Optional> {
        return check(schema, Schema.isPattern(pattern)) as unknown as ZodString<Optional>;
      },
      email(): ZodString<Optional> {
        return check(
          schema,
          Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
        ) as unknown as ZodString<Optional>;
      },
      url(): ZodString<Optional> {
        return check(schema, Schema.isPattern(/^https?:\/\/\S+$/)) as unknown as ZodString<Optional>;
      },
    });
  }

  if (kind === "number") {
    Object.assign(schema, {
      int(): ZodNumber<Optional> {
        return check(schema, Schema.isInt()) as unknown as ZodNumber<Optional>;
      },
      min(value: number): ZodNumber<Optional> {
        return check(
          schema,
          Schema.isGreaterThanOrEqualTo(value),
        ) as unknown as ZodNumber<Optional>;
      },
      max(value: number): ZodNumber<Optional> {
        return check(schema, Schema.isLessThanOrEqualTo(value)) as unknown as ZodNumber<Optional>;
      },
      nonnegative(): ZodNumber<Optional> {
        return check(schema, Schema.isGreaterThanOrEqualTo(0)) as unknown as ZodNumber<Optional>;
      },
      positive(): ZodNumber<Optional> {
        return check(schema, Schema.isGreaterThan(0)) as unknown as ZodNumber<Optional>;
      },
    });
  }

  if (kind === "array") {
    Object.assign(schema, {
      min(length: number): ZodArray<ZodType, Optional> {
        return check(schema, Schema.isMinLength(length)) as unknown as ZodArray<ZodType, Optional>;
      },
      max(length: number): ZodArray<ZodType, Optional> {
        return check(schema, Schema.isMaxLength(length)) as unknown as ZodArray<ZodType, Optional>;
      },
      length(length: number): ZodArray<ZodType, Optional> {
        return check(schema, Schema.isLengthBetween(length, length)) as unknown as ZodArray<
          ZodType,
          Optional
        >;
      },
    });
  }

  if (kind === "object") {
    Object.assign(schema, {
      strict(): ZodObject<Record<string, ZodType>> {
        return cloneSchema(
          schema as unknown as ZodObject<Record<string, ZodType>>,
          "strict",
        ) as unknown as ZodObject<Record<string, ZodType>>;
      },
      strip(): ZodObject<Record<string, ZodType>> {
        return cloneSchema(
          schema as unknown as ZodObject<Record<string, ZodType>>,
          "strip",
        ) as unknown as ZodObject<Record<string, ZodType>>;
      },
      passthrough(): ZodObject<Record<string, ZodType>> {
        return cloneSchema(
          schema as unknown as ZodObject<Record<string, ZodType>>,
          "passthrough",
        ) as unknown as ZodObject<Record<string, ZodType>>;
      },
      extend<TExtension extends Record<string, ZodType>>(
        extension: TExtension,
      ): ZodObject<Record<string, ZodType>> {
        const fields = objectFieldsBySchema.get(schema);
        if (fields === undefined) throw new Error("Cannot extend a non-object schema.");
        const extended = object({ ...fields, ...extension });
        const mode = modeBySchema.get(schema);
        if (mode !== undefined) modeBySchema.set(extended, mode);
        return extended as ZodObject<Record<string, ZodType>>;
      },
    });
  }

  return schema;
}

function withKind<T, Optional extends boolean>(
  schema: Schema.Schema<T>,
  kind: SchemaKind,
): ZodType<T, Optional> {
  const tagged = schema as ZodType<T, Optional>;
  kindBySchema.set(tagged, kind);
  return enhance(tagged);
}

export function string(): ZodString {
  return withKind<string, false>(Schema.String, "string") as ZodString;
}

export function number(): ZodNumber {
  return withKind<number, false>(Schema.Number, "number") as ZodNumber;
}

export function boolean(): ZodType<boolean> {
  return withKind<boolean, false>(Schema.Boolean, "boolean");
}

export function bigint(): ZodType<bigint> {
  return withKind<bigint, false>(Schema.BigInt, "bigint");
}

export function unknown(): ZodType<unknown> {
  return withKind<unknown, false>(Schema.Unknown, "unknown");
}

export function undefined_(): ZodType<undefined> {
  return withKind<undefined, false>(Schema.Undefined, "literal");
}

export { undefined_ as undefined };

export function null_(): ZodType<null> {
  return withKind<null, false>(Schema.Null, "literal");
}

export { null_ as null };

export function url(): ZodString {
  return string().regex(/^https?:\/\/\S+$/);
}

export const iso = {
  datetime(): ZodString {
    return string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  },
};

export function literal<const TValue extends string | number | boolean | null>(
  value: TValue,
): ZodType<TValue> {
  if (value === null) return null_() as unknown as ZodType<TValue>;
  return withKind<TValue, false>(
    Schema.Literal(value) as unknown as Schema.Schema<TValue>,
    "literal",
  );
}

export function enum_<const TValues extends readonly [string, ...string[]]>(
  values: TValues,
): ZodEnum<TValues> {
  const schema = withKind<TValues[number], false>(
    Schema.Literals(values),
    "union",
  ) as unknown as ZodEnum<TValues>;
  Object.defineProperty(schema, "options", {
    value: values,
    enumerable: true,
  });
  return schema;
}

export { enum_ as enum };

export function array<TItem extends ZodType>(item: TItem): ZodArray<TItem> {
  return withKind<Array<output<TItem>>, false>(
    Schema.Array(item as never) as unknown as Schema.Schema<Array<output<TItem>>>,
    "array",
  ) as unknown as ZodArray<TItem>;
}

export function tuple<const TItems extends readonly ZodType[]>(
  items: TItems,
): ZodType<{ [K in keyof TItems]: output<TItems[K]> }> {
  return withKind(
    Schema.Tuple(items as never) as unknown as Schema.Schema<{
      [K in keyof TItems]: output<TItems[K]>;
    }>,
    "tuple",
  ) as ZodType<{ [K in keyof TItems]: output<TItems[K]> }>;
}

export function object<const TShape extends Record<string, ZodType>>(
  shape: TShape,
): ZodObject<TShape> {
  const structShape = Object.fromEntries(
    Object.entries(shape).map(([key, field]) => [
      key,
      optionalBySchema.get(field) === true || defaultBySchema.has(field)
        ? Schema.optionalKey(field as never)
        : field,
    ]),
  ) as TShape;
  const schema = withKind<OutputShape<TShape>, false>(
    Schema.Struct(structShape as never) as unknown as Schema.Schema<OutputShape<TShape>>,
    "object",
  ) as unknown as ZodObject<TShape>;
  objectFieldsBySchema.set(schema, shape);
  modeBySchema.set(schema, "strip");
  return schema;
}

export function strictObject<const TShape extends Record<string, ZodType>>(
  shape: TShape,
): ZodObject<TShape> {
  return object(shape).strict();
}

export function record<TKey extends ZodType<string>, TValue extends ZodType>(
  key: TKey,
  value: TValue,
): ZodType<Record<output<TKey>, output<TValue>>> {
  return withKind<Record<output<TKey>, output<TValue>>, false>(
    Schema.Record(key as never, value as never) as unknown as Schema.Schema<
      Record<output<TKey>, output<TValue>>
    >,
    "record",
  );
}

export function union<const TMembers extends readonly ZodType[]>(
  members: TMembers,
): ZodType<output<TMembers[number]>> {
  return withKind<output<TMembers[number]>, false>(
    Schema.Union(members as never) as unknown as Schema.Schema<output<TMembers[number]>>,
    "union",
  );
}

export function discriminatedUnion<const TMembers extends readonly ZodType[]>(
  _key: string,
  members: TMembers,
): ZodType<output<TMembers[number]>> {
  return union(members);
}

export function preprocess<TSchema extends ZodType>(
  prepare: (value: unknown) => unknown,
  target: TSchema,
): ZodType<output<TSchema>> {
  const schema = Schema.Unknown.pipe(
    Schema.decodeTo(target, {
      decode: SchemaGetter.transform<Schema.Codec.Encoded<TSchema>, unknown>(
        (value) => prepare(value) as Schema.Codec.Encoded<TSchema>,
      ),
      encode: SchemaGetter.passthrough(),
    }),
  );
  return copyMetadata(target, enhance(schema as unknown as ZodType<output<TSchema>>));
}

export const coerce = {
  string(): ZodString {
    return preprocess((value) => String(value), string()) as ZodString;
  },
  number(): ZodNumber {
    return preprocess(
      (value) => Number(value),
      number().superRefine((value, context) => {
        if (Number.isNaN(value)) {
          context.addIssue({ message: "Expected number, received NaN" });
        }
      }),
    ) as ZodNumber;
  },
  boolean(): ZodType<boolean> {
    return preprocess((value) => Boolean(value), boolean());
  },
};

export function codec<TInput extends ZodType, TOutput extends ZodType>(
  inputSchema: TInput,
  outputSchema: TOutput,
  handlers: {
    decode: (value: output<TInput>) => output<TOutput>;
    encode: (value: output<TOutput>) => output<TInput>;
  },
): ZodType<output<TOutput>> {
  const schema = inputSchema.pipe(
    Schema.decodeTo(outputSchema, {
      decode: SchemaGetter.transform<Schema.Codec.Encoded<TOutput>, TInput["Type"]>(
        (value) => handlers.decode(value as output<TInput>) as Schema.Codec.Encoded<TOutput>,
      ),
      encode: SchemaGetter.transform<TInput["Type"], TOutput["Encoded"]>(
        (value) => handlers.encode(value as output<TOutput>) as TInput["Type"],
      ),
    }),
  );
  return copyMetadata(outputSchema, enhance(schema as unknown as ZodType<output<TOutput>>));
}

export function decode<TSchema extends ZodType>(schema: TSchema, input: unknown): output<TSchema> {
  return schema.parse(input) as output<TSchema>;
}

export function getObjectShape(schema: ZodType | undefined): Record<string, ZodType> {
  if (schema === undefined) return {};
  return objectFieldsBySchema.get(schema) ?? {};
}

export function getSchemaInfo(schema: ZodType): SchemaInfo {
  return {
    kind: kindBySchema.get(schema),
    description: descriptionBySchema.get(schema),
    optional: optionalBySchema.get(schema) === true,
    nullable: nullableBySchema.get(schema) === true,
    hasDefault: defaultBySchema.has(schema),
    defaultValue: defaultBySchema.get(schema),
    innerType: innerTypeBySchema.get(schema),
  };
}

export function toJsonSchema(schema: ZodType): unknown {
  const document = Schema.toJsonSchemaDocument(schema, {
    additionalProperties: modeBySchema.get(schema) === "passthrough",
    generateDescriptions: true,
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
  };
}
