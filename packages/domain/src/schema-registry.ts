import { Schema } from "effect";

export type SchemaStability = "draft" | "stable";

export type ProjectSchemaMeta = {
  id: string;
  title: string;
  description: string;
  stability: SchemaStability;
};

export const projectSchemaRegistry = new Map<Schema.Top, ProjectSchemaMeta>();

export function registerProjectSchema<const TSchema extends Schema.Top>(
  schema: TSchema,
  metadata: ProjectSchemaMeta,
): TSchema["Rebuild"] {
  const withGlobalMeta = schema.annotate({
    id: metadata.id,
    title: metadata.title,
    description: metadata.description,
  });

  projectSchemaRegistry.set(withGlobalMeta, metadata);

  return withGlobalMeta;
}

export function toProjectJsonSchema(schema: Schema.Top): unknown {
  const document = Schema.toJsonSchemaDocument(schema, {
    // Registered public contracts are closed objects. Forward-compatible
    // serving projections use permissive decode policies at their read edges.
    additionalProperties: false,
    generateDescriptions: true,
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
  };
}
