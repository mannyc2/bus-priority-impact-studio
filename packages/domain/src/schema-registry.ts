import type { ZodType } from "./schema-compat.js";
import { toJsonSchema } from "./schema-compat.js";

export type SchemaStability = "draft" | "stable";

export type ProjectSchemaMeta = {
  id: string;
  title: string;
  description: string;
  stability: SchemaStability;
};

export const projectSchemaRegistry = new Map<ZodType, ProjectSchemaMeta>();

export function registerProjectSchema<const TSchema extends ZodType>(
  schema: TSchema,
  metadata: ProjectSchemaMeta,
): TSchema {
  const withGlobalMeta = schema.meta({
    id: metadata.id,
    title: metadata.title,
    description: metadata.description,
  }) as TSchema;

  projectSchemaRegistry.set(withGlobalMeta, metadata);

  return withGlobalMeta;
}

export function toProjectJsonSchema(schema: ZodType): unknown {
  return toJsonSchema(schema);
}
