import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
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
    options: Schema.Struct({
      query: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Search query (required)",
      }),
      domain: Schema.optionalKey(Schema.String).annotate({
        description: "Socrata domain (default data.ny.gov)",
      }),
      category: Schema.optionalKey(Schema.String),
      agency: Schema.optionalKey(Schema.String),
      tags: Schema.optionalKey(Schema.String),
      limit: Schema.optionalKey(arg.number().check(Schema.isInt()).check(Schema.isGreaterThan(0))),
      offset: Schema.optionalKey(
        arg.number().check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      order: Schema.optionalKey(Schema.String),
    }),
  },
  output: Schema.Struct({
    command: Schema.Literal("sources:catalog-search"),
    checkedAt: Schema.String,
    domain: Schema.String,
    query: Schema.String,
    filters: Schema.Struct({
      category: Schema.NullOr(Schema.String),
      agency: Schema.NullOr(Schema.String),
      tags: Schema.NullOr(Schema.String),
      limit: Schema.Number,
      offset: Schema.Number,
      order: Schema.String,
    }),
    catalogUrl: Schema.NullOr(Schema.String),
    resultSetSize: Schema.Number,
    returned: Schema.Number,
    warnings: Schema.Array(Schema.Unknown),
    results: Schema.Array(Schema.Unknown),
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
