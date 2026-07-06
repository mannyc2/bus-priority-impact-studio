import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import {
  RichSocrataCatalogSearchClient,
  type SocrataFetch,
} from "../../lib/socrata-catalog-search.ts";

type SocrataCatalogSearchResponse = Awaited<ReturnType<RichSocrataCatalogSearchClient["search"]>>;

export type SearchSourceCatalogArgs = {
  query?: string | undefined;
  domain?: string | undefined;
  category?: string | undefined;
  agency?: string | undefined;
  tags?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  order?: string | undefined;
  fetcher?: SocrataFetch | undefined;
};

export type SourceCatalogSearchResult = {
  command: "sources:catalog-search";
  checkedAt: string;
  domain: string;
  query: string;
  filters: {
    category: string | null;
    agency: string | null;
    tags: string | null;
    limit: number;
    offset: number;
    order: string;
  };
  catalogUrl: string | null;
  resultSetSize: number;
  returned: number;
  warnings: unknown[];
  results: SocrataCatalogSearchResponse["results"];
};

export async function searchSourceCatalog(
  args: SearchSourceCatalogArgs = {},
): Promise<SourceCatalogSearchResult> {
  const domain = args.domain?.trim() || "data.ny.gov";
  const query = args.query?.trim();
  if (query === undefined || query.length === 0) {
    throw new Error("sources:catalog-search requires --query.");
  }
  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;
  const order = args.order ?? "relevance";
  const client = new RichSocrataCatalogSearchClient({ domain, fetcher: args.fetcher });
  const response = await client.search({
    query,
    category: args.category,
    agency: args.agency,
    tags: args.tags,
    limit,
    offset,
    order,
  });

  return {
    command: "sources:catalog-search",
    checkedAt: new Date().toISOString(),
    domain,
    query,
    filters: {
      category: args.category ?? null,
      agency: args.agency ?? null,
      tags: args.tags ?? null,
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
}

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
    return searchSourceCatalog({
      query: input.options.query,
      domain: input.options.domain,
      category: input.options.category,
      agency: input.options.agency,
      tags: input.options.tags,
      limit: input.options.limit,
      offset: input.options.offset,
      order: input.options.order,
    });
  },
});
