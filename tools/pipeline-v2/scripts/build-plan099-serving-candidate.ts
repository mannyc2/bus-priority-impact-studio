import { Database } from "bun:sqlite";
import { copyFile, link, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { freshnessForDataAsOf } from "@bp/domain/studio";
import {
  canonicalServingJson,
  canonicalServingJsonBytes,
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
} from "@bp/domain/studio/serving-release";
import { assertCandidateSourceRegistry, logicalDatasetById } from "../src/lib/logical-datasets.ts";
import {
  buildServingCandidateFromDescriptors,
  renderServingD1CandidateSeedFromCandidate,
  type ServingCandidateArtifactDescriptor,
  servingD1ProjectionInventoryFromCandidate,
  servingSha256,
} from "../src/lib/serving-candidate.ts";

type Args = {
  baseline: string;
  backfill: string;
  sourceCommit: string;
  output: string;
  activeReleaseId: string;
  reviewedCoverageEnd: string;
};

type PartitionReceipt = {
  datasetId: string;
  sourceId: string;
  partition: string;
  snapshotSha256: string;
  rowCount: number;
};

type HistoryTrendRow = {
  month: string;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  ridership: number | null;
  transfers: number | null;
  hasSpeedTrend: number;
  hasRidershipTrend: number;
};

type HistoryWaitRow = {
  month: string;
  waitAssessment: number | null;
  waitTripsPassing: number;
  waitScheduledTrips: number;
};

type HistorySizePoint = Omit<HistoryTrendRow, "hasSpeedTrend" | "hasRidershipTrend"> & {
  routeId: string;
  hasSpeedTrend: boolean;
  hasRidershipTrend: boolean;
  waitAssessment: number | null;
  waitTripsPassing: number;
  waitScheduledTrips: number;
  hasWaitAssessment: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Plan 099 candidate builder requires --name value arguments.");
    }
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value.length === 0) throw new Error(`Missing ${key}.`);
    return value;
  };
  const sourceCommit = required("--source-commit");
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new Error("Invalid --source-commit.");
  return {
    baseline: required("--baseline"),
    backfill: required("--backfill"),
    sourceCommit,
    output: required("--output"),
    activeReleaseId: required("--active-release-id"),
    reviewedCoverageEnd: required("--reviewed-coverage-end"),
  };
}

async function applySqlDirectory(database: Database, path: string): Promise<void> {
  const files = (await readdir(path)).filter((file) => file.endsWith(".sql")).toSorted();
  for (const file of files) database.exec(await Bun.file(join(path, file)).text());
}

async function readPartitionReceipts(root: string, datasetId: string): Promise<PartitionReceipt[]> {
  const directory = join(root, datasetId);
  const sourceDirectories = await readdir(directory, { withFileTypes: true });
  const receipts: PartitionReceipt[] = [];
  for (const sourceDirectory of sourceDirectories) {
    if (!sourceDirectory.isDirectory()) continue;
    const sourceRoot = join(directory, sourceDirectory.name);
    for (const file of (await readdir(sourceRoot))
      .filter((name) => name.endsWith(".receipt.json"))
      .toSorted()) {
      const receipt = (await Bun.file(join(sourceRoot, file)).json()) as PartitionReceipt;
      const rowsPath = join(sourceRoot, `${receipt.partition}.rows.json`);
      const bytes = new Uint8Array(await Bun.file(rowsPath).arrayBuffer());
      if (servingSha256(bytes) !== receipt.snapshotSha256) {
        throw new Error(`Backfill snapshot drifted: ${datasetId}/${receipt.partition}.`);
      }
      const rows: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(rows) || rows.length !== receipt.rowCount) {
        throw new Error(`Backfill row count drifted: ${datasetId}/${receipt.partition}.`);
      }
      receipts.push(receipt);
    }
  }
  return receipts.toSorted(
    (left, right) =>
      left.partition.localeCompare(right.partition) || left.sourceId.localeCompare(right.sourceId),
  );
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function canonicalRouteId(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const upper = value.trim().toUpperCase();
  return ({ Q06: "Q6", Q07: "Q7", Q08: "Q8", Q09: "Q9" } as Record<string, string>)[upper] ?? upper;
}

function monthIndex(value: string): number {
  const [year, month] = value.split("-").map(Number);
  if (year === undefined || month === undefined) throw new Error(`Invalid month ${value}.`);
  return year * 12 + month - 1;
}

function monthFromIndex(value: number): string {
  return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
}

function coverage(months: readonly string[]) {
  const unique = [...new Set(months)].toSorted();
  const start = unique[0] ?? null;
  const end = unique.at(-1) ?? null;
  const missingIntervals: Array<{ start: string; end: string }> = [];
  if (start !== null && end !== null) {
    const present = new Set(unique);
    let gapStart: number | null = null;
    for (let index = monthIndex(start); index <= monthIndex(end); index += 1) {
      if (!present.has(monthFromIndex(index))) gapStart ??= index;
      else if (gapStart !== null) {
        missingIntervals.push({ start: monthFromIndex(gapStart), end: monthFromIndex(index - 1) });
        gapStart = null;
      }
    }
    if (gapStart !== null) missingIntervals.push({ start: monthFromIndex(gapStart), end });
  }
  return { start, end, missingIntervals, monthCount: unique.length };
}

function requiredCoverage(
  datasetId: string,
  value: ReturnType<typeof coverage>,
): { start: string; end: string; missingIntervals: Array<{ start: string; end: string }> } {
  if (value.start === null || value.end === null) {
    throw new Error(`${datasetId} has no reproducible covered partition.`);
  }
  return { start: value.start, end: value.end, missingIntervals: value.missingIntervals };
}

async function ingestBackfill(input: {
  database: Database;
  candidateId: string;
  backfillRoot: string;
}): Promise<{ ridershipReceipts: PartitionReceipt[]; waitReceipts: PartitionReceipt[] }> {
  const routeIds = new Set(
    (
      input.database
        .query("SELECT route_id AS routeId FROM route_catalog_v2 WHERE candidate_id = ?")
        .all(input.candidateId) as Array<{ routeId: string }>
    ).map((row) => row.routeId),
  );
  const ridershipReceipts = await readPartitionReceipts(input.backfillRoot, "route-ridership");
  const upsertTrend = input.database.query(`
    INSERT INTO route_month_trend_v2(
      route_id, month, speed_observation_count, speed_bus_trip_count, average_speed_mph,
      ridership, transfers, has_speed_trend, has_ridership_trend, candidate_id
    ) VALUES (?, ?, 0, 0, NULL, ?, ?, 0, 1, ?)
    ON CONFLICT(candidate_id, route_id, month) DO UPDATE SET
      ridership = excluded.ridership,
      transfers = excluded.transfers,
      has_ridership_trend = 1
  `);
  for (const receipt of ridershipReceipts) {
    const rows = (await Bun.file(
      join(
        input.backfillRoot,
        receipt.datasetId,
        receipt.sourceId,
        `${receipt.partition}.rows.json`,
      ),
    ).json()) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const routeId = canonicalRouteId(row["bus_route"]);
      if (routeId === null || !routeIds.has(routeId)) continue;
      upsertTrend.run(
        routeId,
        receipt.partition,
        numberValue(row["ridership"]),
        numberValue(row["transfers"]),
        input.candidateId,
      );
    }
  }

  const waitReceipts = await readPartitionReceipts(input.backfillRoot, "route-reliability");
  const insertWait = input.database.query(`
    INSERT INTO route_wait_assessment_v2(
      route_id, month, assessment_row_count, trips_passing_wait,
      scheduled_trips, wait_assessment, candidate_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const receipt of waitReceipts) {
    const rows = (await Bun.file(
      join(
        input.backfillRoot,
        receipt.datasetId,
        receipt.sourceId,
        `${receipt.partition}.rows.json`,
      ),
    ).json()) as Array<Record<string, unknown>>;
    const aggregates = new Map<string, { rowCount: number; passing: number; scheduled: number }>();
    for (const row of rows) {
      const routeId = canonicalRouteId(row["route_id"]);
      if (routeId === null || !routeIds.has(routeId)) continue;
      const aggregate = aggregates.get(routeId) ?? { rowCount: 0, passing: 0, scheduled: 0 };
      aggregate.rowCount += 1;
      aggregate.passing += numberValue(row["number_of_trips_passing_wait"]);
      aggregate.scheduled += numberValue(row["number_of_scheduled_trips"]);
      aggregates.set(routeId, aggregate);
    }
    for (const [routeId, aggregate] of [...aggregates.entries()].toSorted(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const waitAssessment =
        aggregate.scheduled === 0
          ? null
          : Math.round((aggregate.passing / aggregate.scheduled) * 1_000_000) / 1_000_000;
      insertWait.run(
        routeId,
        receipt.partition,
        aggregate.rowCount,
        aggregate.passing,
        aggregate.scheduled,
        waitAssessment,
        input.candidateId,
      );
    }
  }
  return { ridershipReceipts, waitReceipts };
}

async function enrichCapabilityArtifact(input: {
  database: Database;
  candidateId: string;
  baseline: string;
  baselineManifest: ServingCandidateManifestV1;
}): Promise<{ descriptor: ServingCandidateArtifactDescriptor; body: Uint8Array }> {
  const logicalId = "studio/v2/routes/route-capability-manifest.json";
  const prior = input.baselineManifest.artifacts.find(
    (artifact) => artifact.logicalId === logicalId,
  );
  if (prior === undefined) throw new Error("Baseline route capability manifest is absent.");
  const manifest = (await Bun.file(join(input.baseline, "objects", prior.key)).json()) as {
    publishedAt: string;
    routes: Array<{
      routeId: string;
      surfaces: Record<string, Record<string, unknown>>;
    }>;
  };
  for (const route of manifest.routes) {
    const trendRows = input.database
      .query(
        `SELECT month, has_speed_trend AS hasSpeed, has_ridership_trend AS hasRidership
         FROM route_month_trend_v2 WHERE candidate_id = ? AND route_id = ? ORDER BY month`,
      )
      .all(input.candidateId, route.routeId) as Array<{
      month: string;
      hasSpeed: number;
      hasRidership: number;
    }>;
    const waitRows = input.database
      .query(
        `SELECT month FROM route_wait_assessment_v2
         WHERE candidate_id = ? AND route_id = ? AND wait_assessment IS NOT NULL ORDER BY month`,
      )
      .all(input.candidateId, route.routeId) as Array<{ month: string }>;
    const setSurface = (key: string, months: readonly string[], grain: string) => {
      const range = coverage(months);
      if (range.end === null) return;
      const existing = route.surfaces[key] ?? {};
      route.surfaces[key] = {
        ...existing,
        state: range.missingIntervals.length === 0 ? "ready" : "partial",
        reason:
          range.missingIntervals.length === 0
            ? null
            : `${range.missingIntervals.length} missing interval(s)`,
        depth: {
          monthsCovered: range.monthCount,
          grains: [grain],
          coverageStart: range.start,
          coverageEnd: range.end,
          missingIntervals: range.missingIntervals,
        },
        dataAsOf: range.end,
        freshness: freshnessForDataAsOf(range.end, manifest.publishedAt.slice(0, 7)),
      };
    };
    setSurface(
      "speedHistory",
      trendRows.filter((row) => row.hasSpeed === 1).map((row) => row.month),
      "route_month",
    );
    setSurface(
      "ridership",
      trendRows.filter((row) => row.hasRidership === 1).map((row) => row.month),
      "route_month",
    );
    setSurface(
      "waitAssessment",
      waitRows.map((row) => row.month),
      "route_month",
    );
  }
  const body = canonicalServingJsonBytes(manifest);
  const digest = servingSha256(body);
  return {
    body,
    descriptor: {
      logicalId,
      key: `serving/blobs/sha256/${digest.slice(0, 2)}/${digest}.json`,
      sha256: digest,
      bytes: body.byteLength,
      mediaType: prior.mediaType,
      schemaId: prior.schemaId,
    },
  };
}

async function materializeObjects(input: {
  baseline: string;
  output: string;
  baselineManifest: ServingCandidateManifestV1;
  descriptors: readonly ServingCandidateArtifactDescriptor[];
  replacement: { descriptor: ServingCandidateArtifactDescriptor; body: Uint8Array };
}): Promise<void> {
  for (const descriptor of input.descriptors) {
    const target = join(input.output, "objects", descriptor.key);
    await mkdir(dirname(target), { recursive: true });
    if (descriptor.logicalId === input.replacement.descriptor.logicalId) {
      await Bun.write(target, input.replacement.body);
      continue;
    }
    const prior = input.baselineManifest.artifacts.find(
      (artifact) => artifact.logicalId === descriptor.logicalId,
    );
    if (prior === undefined || prior.sha256 !== descriptor.sha256) {
      throw new Error(`Reused artifact drifted: ${descriptor.logicalId}.`);
    }
    const source = join(input.baseline, "objects", prior.key);
    try {
      await link(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EXDEV") await copyFile(source, target);
      else if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baselineManifest = decodeStrict(ServingCandidateManifestV1Schema)(
    await Bun.file(join(args.baseline, "candidate.manifest.json")).json(),
  );
  const database = new Database(":memory:");
  await applySqlDirectory(database, fromRepo("packages/db/migrations/d1"));
  await applySqlDirectory(database, fromRepo("packages/db/migrations/d1-v2/active"));
  database.exec(await Bun.file(join(args.baseline, "candidate-seed.sql")).text());
  const baselineInventory = servingD1ProjectionInventoryFromCandidate(
    database,
    baselineManifest.candidateId,
  );
  if (baselineInventory.projectionSha256 !== baselineManifest.d1.projectionSha256) {
    throw new Error("Baseline candidate seed does not reproduce its manifest projection hash.");
  }
  const backfill = await ingestBackfill({
    database,
    candidateId: baselineManifest.candidateId,
    backfillRoot: args.backfill,
  });
  const d1 = servingD1ProjectionInventoryFromCandidate(database, baselineManifest.candidateId);
  const replacement = await enrichCapabilityArtifact({
    database,
    candidateId: baselineManifest.candidateId,
    baseline: args.baseline,
    baselineManifest,
  });
  const artifacts = baselineManifest.artifacts
    .map((artifact) =>
      artifact.logicalId === replacement.descriptor.logicalId ? replacement.descriptor : artifact,
    )
    .toSorted((left, right) => left.logicalId.localeCompare(right.logicalId));
  const baselineSnapshots = baselineManifest.datasets.flatMap(
    (dataset) => dataset.sourceSnapshotIds,
  );
  const speedCoverage = requiredCoverage(
    "route-speed",
    coverage(
      (
        database
          .query(
            `SELECT DISTINCT month FROM route_month_trend_v2
             WHERE candidate_id = ? AND has_speed_trend = 1 ORDER BY month`,
          )
          .all(baselineManifest.candidateId) as Array<{ month: string }>
      ).map((row) => row.month),
    ),
  );
  const ridershipCoverage = requiredCoverage(
    "route-ridership",
    coverage(
      backfill.ridershipReceipts
        .filter((receipt) => receipt.rowCount > 0)
        .map((receipt) => receipt.partition),
    ),
  );
  const reliabilityCoverage = requiredCoverage(
    "route-reliability",
    coverage(
      backfill.waitReceipts
        .filter((receipt) => receipt.rowCount > 0)
        .map((receipt) => receipt.partition),
    ),
  );
  const datasets: ServingCandidateManifestV1["datasets"] = [
    {
      datasetId: "reviewed-serving",
      grain: "month",
      coverage: { start: "2023-04", end: args.reviewedCoverageEnd, missingIntervals: [] },
      sourceIds: [],
      sourceSnapshotIds: [args.activeReleaseId],
    },
    ...[
      {
        datasetId: "route-speed",
        coverage: speedCoverage,
        snapshotIds: baselineSnapshots,
      },
      {
        datasetId: "route-ridership",
        coverage: ridershipCoverage,
        snapshotIds: backfill.ridershipReceipts.map((receipt) => receipt.snapshotSha256),
      },
      {
        datasetId: "route-reliability",
        coverage: reliabilityCoverage,
        snapshotIds: backfill.waitReceipts.map((receipt) => receipt.snapshotSha256),
      },
    ].map(({ datasetId, coverage: datasetCoverage, snapshotIds }) => {
      const descriptor = logicalDatasetById(datasetId);
      return {
        datasetId,
        grain: descriptor.grain,
        coverage: datasetCoverage,
        sourceIds: [...descriptor.sourceIds],
        sourceSnapshotIds: [...new Set(snapshotIds)].toSorted(),
      };
    }),
    ...(
      [
        ["route-schedule", "snapshot", null, "snapshot:2026", baselineSnapshots],
        [
          "route-customer-journey",
          "snapshot",
          null,
          `snapshot:${baselineManifest.candidateId}`,
          baselineSnapshots,
        ],
        [
          "route-identity",
          "snapshot",
          null,
          `snapshot:${baselineManifest.candidateId}`,
          baselineSnapshots,
        ],
        [
          "interventions",
          "snapshot",
          null,
          `snapshot:${baselineManifest.candidateId}`,
          baselineSnapshots,
        ],
        [
          "geometry-map",
          "snapshot",
          null,
          `snapshot:${baselineManifest.candidateId}`,
          baselineSnapshots,
        ],
        [
          "route-equity",
          "snapshot",
          null,
          `snapshot:${baselineManifest.candidateId}`,
          baselineSnapshots,
        ],
      ] as const
    ).map(([datasetId, grain, start, end, snapshotIds]) => {
      const descriptor = logicalDatasetById(datasetId);
      return {
        datasetId,
        grain,
        coverage: { start, end, missingIntervals: [] },
        sourceIds: [...descriptor.sourceIds],
        sourceSnapshotIds: [...new Set(snapshotIds)].toSorted(),
      };
    }),
  ];
  assertCandidateSourceRegistry({ datasets });
  const semanticInputFingerprint = servingSha256(
    canonicalServingJson({
      datasets,
      d1ProjectionSha256: d1.projectionSha256,
      artifacts: artifacts.map((artifact) => ({
        logicalId: artifact.logicalId,
        sha256: artifact.sha256,
      })),
    }),
  );
  const candidate = buildServingCandidateFromDescriptors({
    schemaVersion: 1,
    semanticInputFingerprint,
    sourceCommit: args.sourceCommit,
    builderVersions: [
      { name: "gen17-reviewed-catchup", version: "1" },
      { name: "plan099-logical-dataset-history", version: "1" },
      { name: "plan106-resolved-transit-consumer", version: "1" },
    ],
    datasets,
    artifacts,
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: d1.projectionSha256,
      rowCounts: d1.rowCounts,
    },
    exactIdentity: {
      projectionSha256: d1.exactIdentityProjectionSha256,
      routeCount: d1.exactIdentityRouteCount,
    },
  });
  const seed = renderServingD1CandidateSeedFromCandidate(
    database,
    baselineManifest.candidateId,
    candidate.manifest.candidateId,
  );
  const seedBytes = new TextEncoder().encode(seed);
  const historySizes = (
    database
      .query(
        `SELECT route_id AS routeId, COUNT(*) AS pointCount
         FROM (
           SELECT route_id, month FROM route_month_trend_v2 WHERE candidate_id = ?
           UNION
           SELECT route_id, month FROM route_wait_assessment_v2 WHERE candidate_id = ?
         )
         GROUP BY route_id ORDER BY pointCount DESC, route_id`,
      )
      .all(baselineManifest.candidateId, baselineManifest.candidateId) as Array<{
      routeId: string;
      pointCount: number;
    }>
  ).slice(0, 10);
  const started = performance.now();
  const largestPayloads = historySizes.map(({ routeId, pointCount }) => {
    const trendRows = database
      .query(
        `SELECT
           month, speed_observation_count AS speedObservationCount,
           speed_bus_trip_count AS speedBusTripCount, average_speed_mph AS averageSpeedMph,
           ridership, transfers, has_speed_trend AS hasSpeedTrend,
           has_ridership_trend AS hasRidershipTrend
         FROM route_month_trend_v2 WHERE candidate_id = ? AND route_id = ? ORDER BY month`,
      )
      .all(baselineManifest.candidateId, routeId) as HistoryTrendRow[];
    const waitRows = database
      .query(
        `SELECT month, wait_assessment AS waitAssessment,
           trips_passing_wait AS waitTripsPassing, scheduled_trips AS waitScheduledTrips
         FROM route_wait_assessment_v2 WHERE candidate_id = ? AND route_id = ? ORDER BY month`,
      )
      .all(baselineManifest.candidateId, routeId) as HistoryWaitRow[];
    const points = new Map<string, HistorySizePoint>(
      trendRows.map((row) => [
        row.month,
        {
          routeId,
          month: row.month,
          speedObservationCount: row.speedObservationCount,
          speedBusTripCount: row.speedBusTripCount,
          averageSpeedMph: row.averageSpeedMph,
          ridership: row.ridership,
          transfers: row.transfers,
          hasSpeedTrend: row.hasSpeedTrend === 1,
          hasRidershipTrend: row.hasRidershipTrend === 1,
          waitAssessment: null,
          waitTripsPassing: 0,
          waitScheduledTrips: 0,
          hasWaitAssessment: false,
        },
      ]),
    );
    for (const wait of waitRows) {
      const prior = points.get(wait.month);
      points.set(wait.month, {
        routeId,
        month: wait.month,
        speedObservationCount: prior?.speedObservationCount ?? 0,
        speedBusTripCount: prior?.speedBusTripCount ?? 0,
        averageSpeedMph: prior?.averageSpeedMph ?? null,
        ridership: prior?.ridership ?? null,
        transfers: prior?.transfers ?? null,
        hasSpeedTrend: prior?.hasSpeedTrend ?? false,
        hasRidershipTrend: prior?.hasRidershipTrend ?? false,
        waitAssessment: wait.waitAssessment,
        waitTripsPassing: wait.waitTripsPassing,
        waitScheduledTrips: wait.waitScheduledTrips,
        hasWaitAssessment: wait.waitAssessment !== null,
      });
    }
    const rows = [...points.values()].toSorted((left, right) =>
      String(left.month).localeCompare(String(right.month)),
    );
    return { routeId, pointCount, bytes: canonicalServingJsonBytes(rows).byteLength };
  });
  const latencyMs = Math.round((performance.now() - started) * 1000) / 1000;
  const largestBytes = Math.max(0, ...largestPayloads.map((entry) => entry.bytes));
  if (largestBytes > 3_000_000)
    throw new Error("Expanded route history exceeds the low-single-digit MB review bound.");
  await mkdir(args.output, { recursive: true });
  await materializeObjects({
    baseline: args.baseline,
    output: args.output,
    baselineManifest,
    descriptors: artifacts,
    replacement,
  });
  const inventory = {
    schemaVersion: 1,
    entries: [
      {
        ...replacement.descriptor,
        sourcePath: join(args.output, "objects", replacement.descriptor.key),
      },
    ],
  };
  const stagePlan = {
    schemaVersion: 1,
    sourceCommit: args.sourceCommit,
    activeCandidateId: baselineManifest.candidateId,
    candidateId: candidate.manifest.candidateId,
    candidateManifestKey: candidate.manifestKey,
    candidateManifestSha256: candidate.manifestSha256,
    semanticInputFingerprint,
    compatibilityCoverageEnd: args.reviewedCoverageEnd,
    artifactCount: artifacts.length,
    uploadArtifactCount: inventory.entries.length,
    uploadBytes: inventory.entries.reduce((sum, entry) => sum + entry.bytes, 0),
    candidateSeedSha256: servingSha256(seedBytes),
    candidateSeedBytes: seedBytes.byteLength,
    d1,
    sizeSanity: { largestBytes, largestPayloads, localSpotCheckMs: latencyMs, decision: "accept" },
  };
  await Promise.all([
    Bun.write(join(args.output, "candidate.manifest.json"), candidate.manifestBytes),
    Bun.write(join(args.output, "candidate-seed.sql"), seedBytes),
    Bun.write(join(args.output, "upload-inventory.json"), `${canonicalServingJson(inventory)}\n`),
    Bun.write(join(args.output, "stage-plan.json"), `${canonicalServingJson(stagePlan)}\n`),
  ]);
  database.close();
  console.log(
    canonicalServingJson({
      candidateId: candidate.manifest.candidateId,
      manifestSha256: candidate.manifestSha256,
      seedSha256: servingSha256(seedBytes),
      artifactCount: artifacts.length,
      uploadArtifactCount: inventory.entries.length,
      d1RowCounts: d1.rowCounts,
      sizeSanity: stagePlan.sizeSanity,
    }),
  );
}

function fromRepo(path: string): string {
  return join(import.meta.dir, "../../..", path);
}

await main();
