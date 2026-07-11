import { Result, Schema, SchemaAST } from "effect";

export type CliSchemaBaseType = "array" | "boolean" | "number" | "string" | undefined;

export type CliSchemaField = {
  key: string;
  description: string | undefined;
  optional: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
  baseType: CliSchemaBaseType;
};

export function serviceFreeSchema(
  schema: Schema.Constraint,
): Schema.Codec<unknown, unknown, never, unknown> {
  return Schema.make<Schema.Codec<unknown, unknown, never, unknown>>(schema.ast);
}

export function inspectStructFields(schema: Schema.Constraint): CliSchemaField[] {
  const ast = schema.ast;
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    throw new Error("CLI options schema must be a struct with named fields.");
  }

  return ast.propertySignatures.map((property) => {
    if (typeof property.name !== "string") {
      throw new Error("CLI option keys must be strings.");
    }

    const fieldSchema = serviceFreeSchema(Schema.make(property.type));
    const decoded = Schema.decodeUnknownResult(Schema.Struct({ value: fieldSchema }))({});
    const hasDefault = Result.isSuccess(decoded) && Object.hasOwn(decoded.success, "value");

    return {
      key: property.name,
      description: SchemaAST.resolveDescription(property.type),
      optional: SchemaAST.isOptional(SchemaAST.toEncoded(property.type)),
      hasDefault,
      defaultValue: hasDefault && Result.isSuccess(decoded) ? decoded.success.value : undefined,
      baseType: baseType(property.type),
    };
  });
}

function baseType(ast: SchemaAST.AST): CliSchemaBaseType {
  const type = SchemaAST.toType(ast);
  switch (type._tag) {
    case "Arrays":
      return "array";
    case "Boolean":
      return "boolean";
    case "Number":
      return "number";
    case "String":
    case "TemplateLiteral":
      return "string";
    case "Literal":
      switch (typeof type.literal) {
        case "string":
          return "string";
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        default:
          return undefined;
      }
    case "Union": {
      const members = new Set(
        type.types
          .filter((member) => !SchemaAST.isNull(member) && !SchemaAST.isUndefined(member))
          .map(baseType),
      );
      return members.size === 1 ? members.values().next().value : undefined;
    }
    default:
      return undefined;
  }
}
