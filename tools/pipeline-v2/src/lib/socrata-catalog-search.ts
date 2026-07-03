import * as z from "zod";
import { SocrataDatasetIdSchema, type SocrataFetch } from "@bp/sources/core";

export type { SocrataFetch } from "@bp/sources/core";

const defaultCatalogDomain = "data.ny.gov";

export const defaultSocrataCatalogBoostDomains = {
  "data.cityofnewyork.us": 0.6,
  "health.data.ny.gov": 0.7,
  "data.buffalony.gov": 0.6,
} as const;

export type SocrataCatalogSearchOptions = {
  domain?: string | undefined;
  query: string;
  category?: string | undefined;
  agency?: string | undefined;
  tags?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  order?: string | undefined;
  searchContext?: string | undefined;
  audience?: string | undefined;
  approvalStatus?: string | undefined;
  published?: boolean | undefined;
  explicitlyHidden?: boolean | undefined;
  showUnsupportedFederatedAssets?: boolean | undefined;
  boostDomains?: Record<string, number> | undefined;
  fetcher?: SocrataFetch | undefined;
};

export type RichSocrataCatalogSearchClientOptions = {
  domain?: string | undefined;
  fetcher?: SocrataFetch | undefined;
};

const SocrataCatalogDomainMetadataSchema = z
  .object({
    key: z.string().min(1),
    value: z.string().min(1),
  })
  .passthrough();

const SocrataCatalogResourceSchema = z
  .object({
    name: z.string().min(1),
    id: z.string().optional(),
    description: z.string().nullable().optional(),
    attribution: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    data_updated_at: z.string().nullable().optional(),
    publication_date: z.string().nullable().optional(),
    columns_field_name: z.array(z.string()).optional(),
    columns_name: z.array(z.string()).optional(),
  })
  .passthrough();

const SocrataCatalogClassificationSchema = z
  .object({
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    domain_category: z.string().nullable().optional(),
    domain_tags: z.array(z.string()).default([]),
    domain_metadata: z.array(SocrataCatalogDomainMetadataSchema).default([]),
  })
  .passthrough();

const SocrataCatalogResultSchema = z
  .object({
    resource: SocrataCatalogResourceSchema,
    classification: SocrataCatalogClassificationSchema.optional(),
    metadata: z
      .object({
        domain: z.string().optional(),
      })
      .passthrough()
      .optional(),
    permalink: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
  })
  .passthrough();

const RawSocrataCatalogResponseSchema = z
  .object({
    results: z.array(SocrataCatalogResultSchema).default([]),
    resultSetSize: z.coerce.number().int().nonnegative().optional(),
    warnings: z.array(z.unknown()).default([]),
  })
  .passthrough();

type RawSocrataCatalogResult = z.output<typeof SocrataCatalogResultSchema>;

export type SocrataCatalogSearchResult = {
  datasetId: z.output<typeof SocrataDatasetIdSchema> | null;
  name: string;
  resourceType: string | null;
  domain: string;
  permalink: string | null;
  link: string | null;
  description: string | null;
  attribution: string | null;
  updatedAt: string | null;
  dataUpdatedAt: string | null;
  publicationDate: string | null;
  category: string | null;
  tags: string[];
  agency: string | null;
  owner: string | null;
  granularity: string | null;
  coverage: string | null;
  timePeriod: string | null;
  postingFrequency: string | null;
  columnFieldNames: string[];
  columnNames: string[];
};

export type SocrataCatalogSearchResponse = {
  url?: string | undefined;
  resultSetSize: number;
  returned: number;
  warnings: unknown[];
  results: SocrataCatalogSearchResult[];
};

function setSearchParam(
  url: URL,
  name: string,
  value: string | number | boolean | undefined,
): void {
  if (value !== undefined) {
    url.searchParams.set(name, String(value));
  }
}

function catalogDomain(options: { domain?: string | undefined }): string {
  const domain = options.domain?.trim() || defaultCatalogDomain;
  if (!/^[a-z0-9.-]+$/i.test(domain)) {
    throw new Error(`Invalid Socrata catalog domain: ${domain}`);
  }

  return domain;
}

export function buildSocrataCatalogSearchUrl(options: SocrataCatalogSearchOptions): URL {
  const domain = catalogDomain(options);
  const query = options.query.trim();
  if (query.length === 0) {
    throw new Error("Socrata catalog search query must not be empty.");
  }

  const url = new URL("/api/catalog/v1", `https://${domain}`);
  setSearchParam(url, "explicitly_hidden", options.explicitlyHidden ?? false);
  setSearchParam(url, "limit", options.limit ?? 20);
  setSearchParam(url, "offset", options.offset ?? 0);
  setSearchParam(url, "order", options.order ?? "relevance");
  setSearchParam(url, "published", options.published ?? true);
  setSearchParam(url, "q", query);
  setSearchParam(url, "search_context", options.searchContext ?? domain);
  setSearchParam(
    url,
    "show_unsupported_data_federated_assets",
    options.showUnsupportedFederatedAssets ?? false,
  );
  setSearchParam(url, "tags", options.tags ?? "");
  setSearchParam(url, "approval_status", options.approvalStatus ?? "approved");
  setSearchParam(url, "audience", options.audience ?? "public");
  setSearchParam(url, "categories", options.category);
  setSearchParam(url, "Dataset-Information_Agency", options.agency);

  const boostDomains = options.boostDomains ?? defaultSocrataCatalogBoostDomains;
  for (const [boostDomain, weight] of Object.entries(boostDomains)) {
    setSearchParam(url, `boostDomains[${boostDomain}]`, weight);
  }

  return url;
}

function nullableString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function domainMetadataValue(result: RawSocrataCatalogResult, key: string): string | null {
  const value = result.classification?.domain_metadata.find((entry) => entry.key === key)?.value;
  return nullableString(value);
}

function normalizeSocrataCatalogResult(
  result: RawSocrataCatalogResult,
): SocrataCatalogSearchResult {
  const parsedDatasetId = SocrataDatasetIdSchema.safeParse(result.resource.id);
  const category =
    nullableString(result.classification?.domain_category) ??
    nullableString(result.classification?.categories[0]);
  const tags = [
    ...(result.classification?.domain_tags ?? []),
    ...(result.classification?.tags ?? []),
  ].filter((tag, index, allTags) => tag.trim().length > 0 && allTags.indexOf(tag) === index);

  return {
    datasetId: parsedDatasetId.success ? parsedDatasetId.data : null,
    name: result.resource.name,
    resourceType: nullableString(result.resource.type),
    domain: result.metadata?.domain ?? defaultCatalogDomain,
    permalink: nullableString(result.permalink),
    link: nullableString(result.link),
    description: nullableString(result.resource.description),
    attribution: nullableString(result.resource.attribution),
    updatedAt: nullableString(result.resource.updatedAt),
    dataUpdatedAt: nullableString(result.resource.data_updated_at),
    publicationDate: nullableString(result.resource.publication_date),
    category,
    tags,
    agency: domainMetadataValue(result, "Dataset-Information_Agency"),
    owner: domainMetadataValue(result, "Dataset-Summary_Dataset-Owner"),
    granularity: domainMetadataValue(result, "Dataset-Summary_Granularity"),
    coverage: domainMetadataValue(result, "Dataset-Summary_Coverage"),
    timePeriod: domainMetadataValue(result, "Dataset-Summary_Time-Period"),
    postingFrequency: domainMetadataValue(result, "Dataset-Summary_Posting-Frequency"),
    columnFieldNames: result.resource.columns_field_name ?? [],
    columnNames: result.resource.columns_name ?? [],
  };
}

export function parseSocrataCatalogSearchResponse(input: unknown): SocrataCatalogSearchResponse {
  const parsed = RawSocrataCatalogResponseSchema.parse(input);
  const results = parsed.results.map(normalizeSocrataCatalogResult);

  return {
    resultSetSize: parsed.resultSetSize ?? results.length,
    returned: results.length,
    warnings: parsed.warnings,
    results,
  };
}

export async function searchSocrataCatalog(
  options: SocrataCatalogSearchOptions,
): Promise<SocrataCatalogSearchResponse> {
  const url = buildSocrataCatalogSearchUrl(options);
  const response = await (options.fetcher ?? fetch)(url);

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Socrata catalog search failed with HTTP ${response.status}: ${url}`);
  }

  const parsed = parseSocrataCatalogSearchResponse(await response.json());
  return { ...parsed, url: url.toString() };
}

export class RichSocrataCatalogSearchClient {
  readonly domain: string;
  readonly fetcher: SocrataFetch | undefined;

  constructor(options: RichSocrataCatalogSearchClientOptions = {}) {
    this.domain = catalogDomain(options);
    this.fetcher = options.fetcher;
  }

  search(
    options: Omit<SocrataCatalogSearchOptions, "domain" | "fetcher">,
  ): Promise<SocrataCatalogSearchResponse> {
    return searchSocrataCatalog({
      ...options,
      domain: this.domain,
      fetcher: this.fetcher,
    });
  }
}
