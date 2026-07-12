import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { exportResponse } from "@nyc-transit-kit/soda3/client";
import { Effect } from "effect";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  runPipelineSoda3Effect,
  type SocrataFetch,
  type Soda3ExportFormat,
  socrataAppTokenFromEnv,
  soda3ExportUrl,
  soda3RangeHeader,
} from "../../lib/soda3.ts";

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
  const url = soda3ExportUrl(source.domain, source.dataset_id, format).href;
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

  const response = await runPipelineSoda3Effect(
    source,
    url,
    exportResponse({
      domain: source.domain,
      datasetId: source.dataset_id,
      format,
      query,
      range: {
        start: range.start,
        end: range.endInclusive ?? range.start,
      },
    }),
    {
      fetcher: inputs.fetcher,
      appToken,
    },
  );
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
    options: Schema.Struct({
      source: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Socrata source id from knowledge/raw/source_manifest.yaml",
      }),
      format: Schema.Literals(["csv", "json", "geojson"]).pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultFormat)),
      ),
      query: Schema.optionalKey(Schema.String).annotate({
        description: "Optional SoQL query body for the export request",
      }),
      rangeStart: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThanOrEqualTo(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRangeStart))),
      rangeEnd: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThanOrEqualTo(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRangeEndInclusive))),
      execute: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Send the live SODA3 request" }),
    }),
  },
  output: Schema.Struct({
    command: Schema.Literal("sources:soda3-range-probe"),
    checkedAt: Schema.String,
    sourceId: Schema.String,
    domain: Schema.String,
    datasetId: Schema.String,
    exportUrl: Schema.String,
    format: Schema.Literals(["csv", "json", "geojson"]),
    query: Schema.String,
    rangeHeader: Schema.String,
    dryRun: Schema.Boolean,
    tokenConfigured: Schema.Boolean,
    httpStatus: Schema.NullOr(Schema.Number),
    ok: Schema.NullOr(Schema.Boolean),
    rangeSatisfied: Schema.NullOr(Schema.Boolean),
    contentRange: Schema.NullOr(Schema.String),
    acceptRanges: Schema.NullOr(Schema.String),
    contentLengthBytes: Schema.NullOr(Schema.Number),
    contentType: Schema.NullOr(Schema.String),
    byteLength: Schema.NullOr(Schema.Number),
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
