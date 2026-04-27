import * as z from "zod";

export type SchemaStability = "draft" | "stable";

export type ProjectSchemaMeta = {
  id: string;
  title: string;
  description: string;
  stability: SchemaStability;
};

export const projectSchemaRegistry = z.registry<ProjectSchemaMeta>();

export function registerProjectSchema<const TSchema extends z.ZodType>(
  schema: TSchema,
  metadata: ProjectSchemaMeta,
): TSchema {
  const withGlobalMeta = schema.meta({
    id: metadata.id,
    title: metadata.title,
    description: metadata.description,
  }) as TSchema;

  projectSchemaRegistry.add(withGlobalMeta, metadata);

  return withGlobalMeta;
}

export function toProjectJsonSchema(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, {
    metadata: z.globalRegistry,
    target: "draft-2020-12",
    unrepresentable: "throw",
  });
}
