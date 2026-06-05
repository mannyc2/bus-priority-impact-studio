import {
  buildSoda3ExportUrl,
  buildSoda3SoqlQuery,
  createSoda3Client,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "@bp/sources/clients/socrata";
import type { SocrataManifestSource } from "@bp/sources/registry";
import { fetchWithSocrataAppToken } from "./socrata-token.ts";

export type PipelineSoda3Client = {
  rows(query: Soda3SoqlQuery): Promise<readonly SocrataRow[]>;
  exportUrl(format: "csv" | "json" | "geojson"): string;
};

export type PipelineSoda3ClientOptions = {
  fetcher?: SocrataFetch | undefined;
  pageSize?: number | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  timeoutMs?: number | undefined;
};

export function createSoda3SourceClient(
  source: SocrataManifestSource,
  options: PipelineSoda3ClientOptions = {},
): PipelineSoda3Client {
  const client = createSoda3Client({
    domain: source.domain,
    fetcher: fetchWithSocrataAppToken(options.fetcher),
    pageSize: options.pageSize,
    retryCount: options.retryCount,
    retryDelayMs: options.retryDelayMs,
    timeoutMs: options.timeoutMs,
  });

  return {
    rows(query) {
      const request = {
        datasetId: source.dataset_id,
        body: {
          query: buildSoda3SoqlQuery(query),
          includeSynthetic: false,
        },
      };

      return query.limit === undefined && query.offset === undefined
        ? client.queryAllRows(request)
        : client.queryRows(request);
    },
    exportUrl(format) {
      return buildSoda3ExportUrl(source.domain, source.dataset_id, format).href;
    },
  };
}

export function fetchSoda3RowsForSource(
  source: SocrataManifestSource,
  query: Soda3SoqlQuery,
  options: PipelineSoda3ClientOptions = {},
): Promise<readonly SocrataRow[]> {
  return createSoda3SourceClient(source, options).rows(query);
}

export type { SocrataFetch, SocrataRow, Soda3SoqlQuery };
