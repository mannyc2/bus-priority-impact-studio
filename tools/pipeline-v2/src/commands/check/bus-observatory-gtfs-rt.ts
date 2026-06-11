import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
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
    expectedMonthFileDates: string[];
    foundMonthFileDates: string[];
    missingMonthFileDates: string[];
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
  objects: BusObservatoryObject[];
  qa: {
    rowLevelQaRequired: true;
    checksBeforeUse: string[];
    limitations: string[];
  };
  nextActions: string[];
  artifactPath?: string;
};

const S3_BUCKET_URL = "https://busobservatory-lake.s3.amazonaws.com";
const S3_PREFIX = "feeds/nyct_mta_bus_gtfsrt/";
const FEED_NAME = "nyct_mta_bus_gtfsrt";

export const BusObservatoryAvailabilityResultSchema = z.object({
  sourceId: z.literal("bus_observatory_nyct_mta_bus_gtfsrt"),
  checkedAt: z.string().min(1),
  requestedMonth: z.string().regex(/^\d{4}-\d{2}$/),
  provider: z.object({
    name: z.literal("Bus Observatory"),
    organization: z.literal("Jacobs Urban Tech Hub at Cornell Tech"),
    documentationUrl: z.literal("https://api.busobservatory.org/nyct"),
    bucket: z.literal("busobservatory-lake"),
    prefix: z.literal("feeds/nyct_mta_bus_gtfsrt/"),
    license: z.literal("CC BY-NC 4.0"),
    attributionRequired: z.literal(true),
  }),
  provenance: z.object({
    gtfsRtSource: z.literal("third_party_recovered"),
    officialMtaBackfill: z.literal(false),
    officialSelfCollected: z.literal(false),
    rawFormat: z.literal("parquet"),
    feedName: z.literal("nyct_mta_bus_gtfsrt"),
    compactedWindowNote: z.string().min(1),
  }),
  coverage: z.object({
    expectedMonthFileDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    foundMonthFileDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    missingMonthFileDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    bridgeFileDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bridgeFilePresent: z.boolean(),
    fileCount: z.number().int().nonnegative(),
    totalSizeBytes: z.number().int().nonnegative(),
    minFileSizeBytes: z.number().int().nonnegative().nullable(),
    maxFileSizeBytes: z.number().int().nonnegative().nullable(),
    status: z.enum(["full_month_candidate", "partial_month_candidate", "missing"]),
    candidateLabel: z.enum([
      "third_party_full_month_candidate_pending_row_level_qa",
      "third_party_partial_month_candidate",
      "third_party_missing",
    ]),
  }),
  objects: z.array(
    z.object({
      key: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      lastModified: z.string().min(1),
      sizeBytes: z.number().int().nonnegative(),
      url: z.string().url(),
    }),
  ),
  qa: z.object({
    rowLevelQaRequired: z.literal(true),
    checksBeforeUse: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
  }),
  nextActions: z.array(z.string().min(1)),
  artifactPath: z.string().min(1).optional(),
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
    return BusObservatoryAvailabilityResultSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    ) as BusObservatoryAvailabilityResult;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
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

  const parsed = BusObservatoryAvailabilityResultSchema.parse(
    result,
  ) as BusObservatoryAvailabilityResult;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, parsed);
  return parsed;
}

export default defineCommand({
  path: ["check", "bus-observatory-gtfs-rt"],
  summary: "Check Bus Observatory S3 for recovered GTFS-RT parquet files for a calendar month.",
  input: {
    options: z.object({
      year: arg.positiveInt().optional().describe("Calendar year (defaults to current)"),
      month: arg.positiveInt().optional().describe("Calendar month, 1-12 (defaults to current)"),
      artifactRoot: z.string().optional().describe("Artifact root directory"),
      output: z.string().optional().describe("Override artifact JSON path"),
    }),
  },
  output: z.object({
    sourceId: z.string(),
    checkedAt: z.string(),
    requestedMonth: z.string(),
    coverage: z.unknown(),
    objects: z.array(z.unknown()),
    nextActions: z.array(z.string()),
    artifactPath: z.string().optional(),
  }).passthrough(),
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
