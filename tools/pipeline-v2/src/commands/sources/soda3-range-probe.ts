import {
  buildSoda3ExportUrl,
  createSoda3Client,
  type SocrataFetch,
  type Soda3ExportFormat,
  soda3RangeHeader,
} from "@bp/sources/clients/socrata";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { defineCommand, z } from "@liche/core";
import { fromRepoRoot } from "../../lib/paths.ts";
import { fetchWithSocrataAppToken, socrataAppTokenFromEnv } from "../../lib/socrata-token.ts";

const defaultFormat: Soda3ExportFormat = "csv";
const defaultRangeStart = 0;
const defaultRangeEndInclusive = 255;

export type Soda3RangeProbeInputs = {
  sourceId: string;
  manifestText?: string | undefined;
  format?: Soda3ExportFormat | undefined;
  query?: string | undefined;
  rangeStart?: number | undefined;
  rangeEndInclusive?: number | undefined;
  execute?: boolean | undefined;
  fetcher?: SocrataFetch | undefined;
  appToken?: string | null | undefined;
  now?: (() => Date) | undefined;
};

export type Soda3RangeProbeResult = {
  command: "sources:soda3-range-probe";
  checkedAt: string;
  sourceId: string;
  domain: string;
  datasetId: string;
  exportUrl: string;
  format: Soda3ExportFormat;
  query: string;
  rangeHeader: string;
  dryRun: boolean;
  tokenConfigured: boolean;
  httpStatus: number | null;
  ok: boolean | null;
  rangeSatisfied: boolean | null;
  contentRange: string | null;
  acceptRanges: string | null;
  contentLengthBytes: number | null;
  contentType: string | null;
  byteLength: number | null;
};

function parseContentLength(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeQuery(query: string | undefined, fallbackQuery: string | undefined): string {
  const selected = query?.trim() || fallbackQuery?.trim() || "SELECT * LIMIT 1";
  if (selected.length === 0) {
    throw new Error("SODA3 range probe query cannot be empty.");
  }
  return selected;
}

export async function runSoda3RangeProbe(
  inputs: Soda3RangeProbeInputs,
): Promise<Soda3RangeProbeResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);
  const source = getSocrataSource(manifest, inputs.sourceId);
  const format = inputs.format ?? source.backfill?.format ?? defaultFormat;
  const query = normalizeQuery(inputs.query, source.backfill?.defaultQuery);
  const range = {
    start: inputs.rangeStart ?? defaultRangeStart,
    endInclusive: inputs.rangeEndInclusive ?? defaultRangeEndInclusive,
  };
  const appToken = inputs.appToken === undefined ? socrataAppTokenFromEnv() : inputs.appToken;
  const client = createSoda3Client({
    domain: source.domain,
    fetcher: fetchWithSocrataAppToken(inputs.fetcher, appToken),
    retryCount: 0,
  });
  const url = buildSoda3ExportUrl(source.domain, source.dataset_id, format).href;
  const rangeHeader = soda3RangeHeader(range);
  const dryRun = inputs.execute !== true;
  const checkedAt = (inputs.now ?? (() => new Date()))().toISOString();

  if (dryRun) {
    return {
      command: "sources:soda3-range-probe",
      checkedAt,
      sourceId: source.id,
      domain: source.domain,
      datasetId: source.dataset_id,
      exportUrl: url,
      format,
      query,
      rangeHeader,
      dryRun: true,
      tokenConfigured: appToken !== null,
      httpStatus: null,
      ok: null,
      rangeSatisfied: null,
      contentRange: null,
      acceptRanges: null,
      contentLengthBytes: null,
      contentType: null,
      byteLength: null,
    };
  }

  if (appToken === null) {
    throw new Error("SOCRATA_APP_TOKEN is required for sources:soda3-range-probe --execute.");
  }

  const orderingSpecifier = source.backfill?.orderingSpecifier;
  const response = await client.export({
    datasetId: source.dataset_id,
    format,
    body: {
      query,
      ...(orderingSpecifier === undefined ? {} : { orderingSpecifier }),
    },
    byteRange: range,
  });
  const bytes = await response.arrayBuffer();
  const contentRange = response.headers.get("content-range");

  return {
    command: "sources:soda3-range-probe",
    checkedAt,
    sourceId: source.id,
    domain: source.domain,
    datasetId: source.dataset_id,
    exportUrl: url,
    format,
    query,
    rangeHeader,
    dryRun: false,
    tokenConfigured: true,
    httpStatus: response.status,
    ok: response.ok,
    rangeSatisfied: response.status === 206 && contentRange !== null,
    contentRange,
    acceptRanges: response.headers.get("accept-ranges"),
    contentLengthBytes: parseContentLength(response.headers.get("content-length")),
    contentType: response.headers.get("content-type"),
    byteLength: bytes.byteLength,
  };
}

export default defineCommand({
  path: ["sources", "soda3-range-probe"],
  summary: "Dry-run or execute an opt-in SODA3 export byte-range probe.",
  input: {
    options: z.object({
      source: z
        .string()
        .min(1)
        .describe("Socrata source id from knowledge/raw/source_manifest.yaml"),
      format: z.enum(["csv", "json", "geojson"]).default(defaultFormat),
      query: z.string().optional().describe("Optional SoQL query body for the export request"),
      rangeStart: z.coerce.number().int().nonnegative().default(defaultRangeStart),
      rangeEnd: z.coerce.number().int().nonnegative().default(defaultRangeEndInclusive),
      execute: z.coerce.boolean().default(false).describe("Send the live SODA3 request"),
    }),
  },
  output: z.object({
    command: z.literal("sources:soda3-range-probe"),
    checkedAt: z.string(),
    sourceId: z.string(),
    domain: z.string(),
    datasetId: z.string(),
    exportUrl: z.string(),
    format: z.enum(["csv", "json", "geojson"]),
    query: z.string(),
    rangeHeader: z.string(),
    dryRun: z.boolean(),
    tokenConfigured: z.boolean(),
    httpStatus: z.number().nullable(),
    ok: z.boolean().nullable(),
    rangeSatisfied: z.boolean().nullable(),
    contentRange: z.string().nullable(),
    acceptRanges: z.string().nullable(),
    contentLengthBytes: z.number().nullable(),
    contentType: z.string().nullable(),
    byteLength: z.number().nullable(),
  }),
  async run({ input }) {
    return runSoda3RangeProbe({
      sourceId: input.options.source,
      format: input.options.format,
      query: input.options.query,
      rangeStart: input.options.rangeStart,
      rangeEndInclusive: input.options.rangeEnd,
      execute: input.options.execute,
    });
  },
});
