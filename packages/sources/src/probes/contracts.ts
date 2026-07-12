import type { SocrataColumnSchema, SocrataFetch, SocrataMetadata } from "../core/index.js";
import type { ManifestSource } from "../registry/manifest.js";

export const probeSchemaVersion = 1;

export type FetchLike = SocrataFetch;
export type ProbeStatus = "active" | "blocked" | "skipped";
export type HttpMethod = "GET" | "HEAD";
export type HttpTransport = "curl" | "fetch";

export type HttpProbe = {
  method: HttpMethod;
  transport: HttpTransport;
  status: number;
  ok: boolean;
  finalUrl: string;
  contentType?: string;
  contentLengthBytes?: number;
  lastModified?: string;
  etag?: string;
  responseDate?: string;
};

export type SourceProbeBase = {
  schemaVersion: typeof probeSchemaVersion;
  sourceId: string;
  sourceType: ManifestSource["type"];
  sourcePriority: ManifestSource["priority"];
  manifestStatus: string;
  checkedAt: string;
  probeStatus: ProbeStatus;
  statusRecommendation: ProbeStatus;
  url?: string;
  redactedUrl?: string;
  http?: HttpProbe;
  error?: string;
};

export type SourceProbeOutput = SourceProbeBase & {
  socrata?: {
    datasetId: string;
    domain: string;
    metadataUrl: string;
    columnsUrl: string;
    rowsCsvUrl: string;
    rowCountUrl: string;
    name: string;
    columnCount: number;
    rowCount?: number;
    rowCountError?: string;
    rowsUpdatedAt?: number;
    rowsUpdatedAtIso?: string;
  };
  socrataDataset?: {
    metadata: SocrataMetadata;
    columns: ReadonlyArray<typeof SocrataColumnSchema.Type>;
  };
};

export type ProbeOptions = {
  fetcher?: FetchLike;
  headFallback?: ((url: string) => Promise<HttpProbe>) | undefined;
  now?: () => Date;
  busTimeApiKey?: string;
};

function checkedAt(options: ProbeOptions): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

export function createBaseProbe(
  source: ManifestSource,
  options: ProbeOptions,
  probeStatus: ProbeStatus,
): SourceProbeBase {
  return {
    schemaVersion: probeSchemaVersion,
    sourceId: source.id,
    sourceType: source.type,
    sourcePriority: source.priority,
    manifestStatus: source.status,
    checkedAt: checkedAt(options),
    probeStatus,
    statusRecommendation: probeStatus,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
