import { defineCommand, z } from "@liche/core";
import { SocrataCatalogClient } from "@bp/sources";

export default defineCommand({
  path: ["sources", "catalog-search"],
  summary: "Search a Socrata catalog (default data.ny.gov) for datasets.",
  input: {
    options: z.object({
      query: z.string().min(1).describe("Search query (required)"),
      domain: z.string().optional().describe("Socrata domain (default data.ny.gov)"),
      category: z.string().optional(),
      agency: z.string().optional(),
      tags: z.string().optional(),
      limit: z.coerce.number().int().positive().optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
      order: z.string().optional(),
    }),
  },
  output: z.object({
    command: z.literal("sources:catalog-search"),
    checkedAt: z.string(),
    domain: z.string(),
    query: z.string(),
    filters: z.object({
      category: z.string().nullable(),
      agency: z.string().nullable(),
      tags: z.string().nullable(),
      limit: z.number(),
      offset: z.number(),
      order: z.string(),
    }),
    catalogUrl: z.string().nullable(),
    resultSetSize: z.number(),
    returned: z.number(),
    warnings: z.array(z.unknown()),
    results: z.array(z.unknown()),
  }),
  async run({ input }) {
    const domain = input.options.domain?.trim() || "data.ny.gov";
    const query = input.options.query.trim();
    if (query.length === 0) {
      throw new Error("sources:catalog-search requires --query.");
    }
    const limit = input.options.limit ?? 20;
    const offset = input.options.offset ?? 0;
    const order = input.options.order ?? "relevance";

    const client = new SocrataCatalogClient({ domain });
    const response = await client.search({
      query,
      category: input.options.category,
      agency: input.options.agency,
      tags: input.options.tags,
      limit,
      offset,
      order,
    });

    return {
      command: "sources:catalog-search" as const,
      checkedAt: new Date().toISOString(),
      domain,
      query,
      filters: {
        category: input.options.category ?? null,
        agency: input.options.agency ?? null,
        tags: input.options.tags ?? null,
        limit,
        offset,
        order,
      },
      catalogUrl: response.url ?? null,
      resultSetSize: response.resultSetSize,
      returned: response.returned,
      warnings: response.warnings,
      results: response.results,
    };
  },
});
