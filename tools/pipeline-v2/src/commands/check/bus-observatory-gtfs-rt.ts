import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { decodeStrip } from "@bp/domain/decode";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export type BusObservatoryAvailabilityInputs = {
  year?: number | undefined;
  month?: number | undefined;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  fetcher?: typeof fetch | undefined;
};

type BusObservatoryObject = {
  key: string;
  date: string;
  lastModified: string;
  sizeBytes: number;
  url: string;
};

type BusObservatoryAvailabilityStatus =
  | "full_month_candidate"
  | "partial_month_candidate"
  | "missing";

export type BusObservatoryAvailabilityResult = {
  sourceId: "bus_observatory_nyct_mta_bus_gtfsrt";
  checkedAt: string;
  requestedMonth: string;
  provider: {
    name: "Bus Observatory";
    organization: "Jacobs Urban Tech Hub at Cornell Tech";
    documentationUrl: "https://api.busobservatory.org/nyct";
    bucket: "busobservatory-lake";
    prefix: "feeds/nyct_mta_bus_gtfsrt/";
    license: "CC BY-NC 4.0";
    attributionRequired: true;
  };
  provenance: {
    gtfsRtSource: "third_party_recovered";
    officialMtaBackfill: false;
    officialSelfCollected: false;
    rawFormat: "parquet";
    feedName: "nyct_mta_bus_gtfsrt";
    compactedWindowNote: string;
  };
  coverage: {
    expectedMonthFileDates: readonly string[];
    foundMonthFileDates: readonly string[];
    missingMonthFileDates: readonly string[];
    bridgeFileDate: string;
    bridgeFilePresent: boolean;
    fileCount: number;
    totalSizeBytes: number;
    minFileSizeBytes: number | null;
    maxFileSizeBytes: number | null;
    status: BusObservatoryAvailabilityStatus;
    candidateLabel:
      | "third_party_full_month_candidate_pending_row_level_qa"
      | "third_party_partial_month_candidate"
      | "third_party_missing";
  };
  objects: readonly BusObservatoryObject[];
  qa: {
    rowLevelQaRequired: true;
    checksBeforeUse: readonly string[];
    limitations: readonly string[];
  };
  nextActions: readonly string[];
  artifactPath?: string;
};

const S3_BUCKET_URL = "https://busobservatory-lake.s3.amazonaws.com";
const S3_PREFIX = "feeds/nyct_mta_bus_gtfsrt/";
const FEED_NAME = "nyct_mta_bus_gtfsrt";

export const BusObservatoryAvailabilityResultSchema = Schema.Struct({
  sourceId: Schema.Literal("bus_observatory_nyct_mta_bus_gtfsrt"),
  checkedAt: Schema.String.check(Schema.isMinLength(1)),
  requestedMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  provider: Schema.Struct({
    name: Schema.Literal("Bus Observatory"),
    organization: Schema.Literal("Jacobs Urban Tech Hub at Cornell Tech"),
    documentationUrl: Schema.Literal("https://api.busobservatory.org/nyct"),
    bucket: Schema.Literal("busobservatory-lake"),
    prefix: Schema.Literal("feeds/nyct_mta_bus_gtfsrt/"),
    license: Schema.Literal("CC BY-NC 4.0"),
    attributionRequired: Schema.Literal(true),
  }),
  provenance: Schema.Struct({
    gtfsRtSource: Schema.Literal("third_party_recovered"),
    officialMtaBackfill: Schema.Literal(false),
    officialSelfCollected: Schema.Literal(false),
    rawFormat: Schema.Literal("parquet"),
    feedName: Schema.Literal("nyct_mta_bus_gtfsrt"),
    compactedWindowNote: Schema.String.check(Schema.isMinLength(1)),
  }),
  coverage: Schema.Struct({
    expectedMonthFileDates: Schema.Array(
      Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
    ),
    foundMonthFileDates: Schema.Array(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
    missingMonthFileDates: Schema.Array(
      Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
    ),
    bridgeFileDate: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
    bridgeFilePresent: Schema.Boolean,
    fileCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    totalSizeBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    minFileSizeBytes: Schema.NullOr(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    maxFileSizeBytes: Schema.NullOr(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    status: Schema.Literals(["full_month_candidate", "partial_month_candidate", "missing"]),
    candidateLabel: Schema.Literals([
      "third_party_full_month_candidate_pending_row_level_qa",
      "third_party_partial_month_candidate",
      "third_party_missing",
    ]),
  }),
  objects: Schema.Array(
    Schema.Struct({
      key: Schema.String.check(Schema.isMinLength(1)),
      date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
      lastModified: Schema.String.check(Schema.isMinLength(1)),
      sizeBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      url: Schema.String.check(Schema.isPattern(/^https?:\/\/\S+$/)),
    }),
  ),
  qa: Schema.Struct({
    rowLevelQaRequired: Schema.Literal(true),
    checksBeforeUse: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
    limitations: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  }),
  nextActions: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  artifactPath: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function nextMonthDate(year: number, month: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function expectedMonthDates(year: number, month: number): string[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, index) =>
    isoDate(year, month, index + 1),
  );
}

function defaultOutputPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "source-availability", `bus-observatory-gtfs-rt-${month}.json`);
}

export function busObservatoryAvailabilityArtifactPath(
  artifactRoot: string,
  month: string,
): string {
  return defaultOutputPath(artifactRoot, month);
}

export async function readBusObservatoryAvailabilityArtifact(
  artifactRoot: string,
  month: string,
): Promise<BusObservatoryAvailabilityResult | null> {
  const path = busObservatoryAvailabilityArtifactPath(artifactRoot, month);
  try {
    return decodeStrip(BusObservatoryAvailabilityResultSchema)(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function objectUrl(key: string): string {
  return `${S3_BUCKET_URL}/${encodeURIComponent(key).replaceAll("%2F", "/")}`;
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function parseS3Objects(xml: string): BusObservatoryObject[] {
  const contents = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
  const objects: BusObservatoryObject[] = [];
  for (const content of contents) {
    const block = content[1] ?? "";
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1];
    const lastModified = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1];
    const size = /<Size>([\s\S]*?)<\/Size>/.exec(block)?.[1];
    if (key === undefined || lastModified === undefined || size === undefined) continue;
    const decodedKey = escapeXmlText(key);
    const date = new RegExp(`COMPACTED_${FEED_NAME}_(\\d{4}-\\d{2}-\\d{2})_`).exec(decodedKey)?.[1];
    if (date === undefined) continue;
    objects.push({
      key: decodedKey,
      date,
      lastModified: escapeXmlText(lastModified),
      sizeBytes: Number.parseInt(size, 10),
      url: objectUrl(decodedKey),
    });
  }
  return objects;
}

async function listObjectsForPrefix(
  prefix: string,
  fetcher: typeof fetch,
): Promise<BusObservatoryObject[]> {
  const url = `${S3_BUCKET_URL}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Bus Observatory S3 listing failed (${response.status}) for ${prefix}`);
  }
  return parseS3Objects(await response.text());
}

export async function runCheckBusObservatoryGtfsRt(
  inputs: BusObservatoryAvailabilityInputs = {},
): Promise<BusObservatoryAvailabilityResult> {
  const now = new Date();
  const year = inputs.year ?? now.getUTCFullYear();
  const month = inputs.month ?? now.getUTCMonth() + 1;
  const requestedMonth = isoMonth(year, month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const outputPath = inputs.output ?? defaultOutputPath(artifactRoot, requestedMonth);
  const fetcher = inputs.fetcher ?? fetch;
  const expectedDates = expectedMonthDates(year, month);
  const next = nextMonthDate(year, month);
  const bridgeFileDate = isoDate(next.year, next.month, 1);
  const monthPrefix = `${S3_PREFIX}COMPACTED_${FEED_NAME}_${requestedMonth}`;
  const bridgePrefix = `${S3_PREFIX}COMPACTED_${FEED_NAME}_${bridgeFileDate}`;
  const [monthObjects, bridgeObjects] = await Promise.all([
    listObjectsForPrefix(monthPrefix, fetcher),
    listObjectsForPrefix(bridgePrefix, fetcher),
  ]);
  const objects = [...monthObjects, ...bridgeObjects].sort(
    (left, right) => left.date.localeCompare(right.date) || left.key.localeCompare(right.key),
  );
  const foundMonthFileDates = expectedDates.filter((date) =>
    monthObjects.some((object) => object.date === date),
  );
  const missingMonthFileDates = expectedDates.filter((date) => !foundMonthFileDates.includes(date));
  const bridgeFilePresent = bridgeObjects.some((object) => object.date === bridgeFileDate);
  const sizes = objects.map((object) => object.sizeBytes);
  const fullMonthCandidate = missingMonthFileDates.length === 0 && bridgeFilePresent;
  const partialMonthCandidate = foundMonthFileDates.length > 0 || bridgeFilePresent;
  const status: BusObservatoryAvailabilityStatus = fullMonthCandidate
    ? "full_month_candidate"
    : partialMonthCandidate
      ? "partial_month_candidate"
      : "missing";
  const result: BusObservatoryAvailabilityResult = {
    sourceId: "bus_observatory_nyct_mta_bus_gtfsrt",
    checkedAt: new Date().toISOString(),
    requestedMonth,
    provider: {
      name: "Bus Observatory",
      organization: "Jacobs Urban Tech Hub at Cornell Tech",
      documentationUrl: "https://api.busobservatory.org/nyct",
      bucket: "busobservatory-lake",
      prefix: S3_PREFIX,
      license: "CC BY-NC 4.0",
      attributionRequired: true,
    },
    provenance: {
      gtfsRtSource: "third_party_recovered",
      officialMtaBackfill: false,
      officialSelfCollected: false,
      rawFormat: "parquet",
      feedName: FEED_NAME,
      compactedWindowNote:
        "Bus Observatory files are compacted 24-hour windows ending near the timestamp in the filename and do not correspond exactly to calendar days; include the first following-month file for full local/UTC month QA.",
    },
    coverage: {
      expectedMonthFileDates: expectedDates,
      foundMonthFileDates,
      missingMonthFileDates,
      bridgeFileDate,
      bridgeFilePresent,
      fileCount: objects.length,
      totalSizeBytes: sizes.reduce((total, size) => total + size, 0),
      minFileSizeBytes: sizes.length > 0 ? Math.min(...sizes) : null,
      maxFileSizeBytes: sizes.length > 0 ? Math.max(...sizes) : null,
      status,
      candidateLabel: fullMonthCandidate
        ? "third_party_full_month_candidate_pending_row_level_qa"
        : partialMonthCandidate
          ? "third_party_partial_month_candidate"
          : "third_party_missing",
    },
    objects,
    qa: {
      rowLevelQaRequired: true,
      checksBeforeUse: [
        "Read Parquet row groups and verify timestamp coverage from the requested month start through the next month start.",
        "Measure timestamp gaps and daily batch cadence.",
        "Verify route_id, vehicle_id, latitude, longitude, and timestamp density.",
        "Map route ids to local route catalog and quantify public-route coverage.",
        "Run observed-headway and route observed-reliability builders with provenance set to third_party_recovered before promotion.",
      ],
      limitations: [
        "This is third-party recovered data, not official MTA replay/backfill.",
        "The license is CC BY-NC 4.0 and requires attribution; production/commercial use needs legal/product review.",
        "File presence and byte size prove availability, not analytical fitness.",
      ],
    },
    nextActions: fullMonthCandidate
      ? [
          `Download ${objects.length} Parquet file(s) for ${requestedMonth} plus bridge date ${bridgeFileDate}.`,
          "Build a Parquet-to-local GTFS-RT import path or conversion job with third-party provenance.",
          "Run row-level timestamp, route, vehicle, and observed-headway QA before labeling March as a recovered observed release candidate.",
        ]
      : [
          "Search alternate third-party archives or contact Bus Observatory before using this source for month recovery.",
        ],
    artifactPath: outputPath,
  };

  const parsed = decodeStrip(BusObservatoryAvailabilityResultSchema)(result);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, parsed);
  return parsed;
}

export default defineCommand({
  path: ["check", "bus-observatory-gtfs-rt"],
  summary: "Check Bus Observatory S3 for recovered GTFS-RT parquet files for a calendar month.",
  input: {
    options: Schema.Struct({
      year: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "Calendar year (defaults to current)",
      }),
      month: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "Calendar month, 1-12 (defaults to current)",
      }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Artifact root directory",
      }),
      output: Schema.optionalKey(Schema.String).annotate({
        description: "Override artifact JSON path",
      }),
    }),
  },
  output: Schema.Struct({
    sourceId: Schema.String,
    checkedAt: Schema.String,
    requestedMonth: Schema.String,
    coverage: Schema.Unknown,
    objects: Schema.Array(Schema.Unknown),
    nextActions: Schema.Array(Schema.String),
    artifactPath: Schema.optionalKey(Schema.String),
  }),
  async run({ input }) {
    return runCheckBusObservatoryGtfsRt({
      year: input.options.year,
      month: input.options.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
    });
  },
});
