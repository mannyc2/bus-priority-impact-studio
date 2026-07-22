import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  StudyPhysicalScopeBindingsArtifactSchema,
  type StudyReviewFileReceipt,
  type StudyReviewInputsArtifactV1,
  StudyReviewInputsArtifactV1Schema,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

const ISO_MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

type AvailabilityArtifact = {
  sourceId: "bus_segment_speeds_2025";
  releaseDecision: { latestCompleteMonth: string | null; lastBuiltMonth: string | null };
  months: Array<{
    isoMonth: string;
    rowCount: number;
    routeCount: number;
    busTripCount: number;
    status: string;
  }>;
};

type SpineManifest = {
  artifactKind: "studio_route_speed_spine_manifest";
  schemaVersion: 1;
  source: {
    startMonth: string;
    endMonth: string | null;
    toleranceMeters: number;
    artifactRoot: string;
  };
  summary: { routeCount: number; artifactWrittenRouteCount: number };
  routes: Array<{
    routeId: string;
    routeSlug: string;
    readiness: "series_ready" | "series_ready_with_gaps" | "needs_pattern_review" | "failed";
    artifactPath: string;
    artifactWritten: boolean;
  }>;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileReceipt(path: string): Promise<StudyReviewFileReceipt> {
  const [bytes, metadata] = await Promise.all([readFile(path), stat(path)]);
  if (!metadata.isFile()) throw new Error(`Review input is not a file: ${path}`);
  return { sha256: sha256(bytes), byteCount: metadata.size };
}

function decodeJson<T>(bytes: Uint8Array, path: string): T {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch (cause) {
    throw new Error(`Invalid review input JSON at ${path}: ${String(cause)}`);
  }
}

function logicalQuerySha256(local: OpenLocalPipelineDb, header: string, sql: string): string {
  const hash = createHash("sha256").update(`${header}\n`);
  for (const row of local.sqlite.query<{ line: string }, []>(sql).iterate()) {
    hash.update(row.line);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function nextMonth(month: string): string {
  const [year = 0, value = 0] = month.split("-").map(Number);
  const nextIndex = year * 12 + value;
  return `${Math.floor(nextIndex / 12)}-${String((nextIndex % 12) + 1).padStart(2, "0")}`;
}

function outcomeLogicalSha256(
  local: OpenLocalPipelineDb,
  startMonth: string,
  endMonth: string,
): string {
  const sql = `
    SELECT json_array(
      route_id, month, row_rank, timestamp, day_of_week, hour_of_day, direction, borough,
      route_type, stop_order, timepoint_stop_id, timepoint_stop_name,
      timepoint_stop_latitude, timepoint_stop_longitude, next_timepoint_stop_id,
      next_timepoint_stop_name, next_timepoint_stop_latitude, next_timepoint_stop_longitude,
      road_distance_miles, average_travel_time_minutes, average_road_speed_mph, bus_trip_count
    ) AS line
    FROM local_route_segment_speed
    WHERE month >= '${startMonth}' AND month <= '${endMonth}'
    ORDER BY route_id, month, row_rank
  `;
  return logicalQuerySha256(local, `study-outcome-projection-v1|${startMonth}|${endMonth}`, sql);
}

function laneTableLogicalSha256(
  local: OpenLocalPipelineDb,
  table: "local_bus_lane" | "local_bus_lane_coordinate",
): string {
  const sql =
    table === "local_bus_lane"
      ? `SELECT json_array(segment_id, street, borough, facility, direction, traffic_direction,
          hours, days, lane_type, lane_subtype, lane_width, open_date, shape_length) AS line
         FROM local_bus_lane ORDER BY segment_id`
      : `SELECT json_array(segment_id, coordinate_rank, longitude, latitude) AS line
         FROM local_bus_lane_coordinate ORDER BY segment_id, coordinate_rank`;
  return logicalQuerySha256(local, `${table}-projection-v1`, sql);
}

function resolveSpineArtifactPath(manifest: SpineManifest, path: string): string {
  if (isAbsolute(path)) return path;
  if (isAbsolute(manifest.source.artifactRoot)) return resolve(manifest.source.artifactRoot, path);
  return resolve(path);
}

export async function buildStudyReviewInputsArtifact(input: {
  local: OpenLocalPipelineDb;
  analysisMonth: string;
  availabilityPath: string;
  spineManifestPath: string;
  scopeBindingsPath: string;
}): Promise<StudyReviewInputsArtifactV1> {
  const [availabilityBytes, manifestBytes, scopeBindings] = await Promise.all([
    readFile(input.availabilityPath),
    readFile(input.spineManifestPath),
    readJsonArtifact(input.scopeBindingsPath, StudyPhysicalScopeBindingsArtifactSchema, "strict"),
  ]);
  const availability = decodeJson<AvailabilityArtifact>(availabilityBytes, input.availabilityPath);
  const manifest = decodeJson<SpineManifest>(manifestBytes, input.spineManifestPath);
  if (
    !ISO_MONTH_RE.test(input.analysisMonth) ||
    !ISO_MONTH_RE.test(manifest.source.startMonth) ||
    manifest.source.endMonth === null ||
    !ISO_MONTH_RE.test(manifest.source.endMonth)
  ) {
    throw new Error("Review inputs contain an invalid analysis or spine-bound month");
  }
  if (
    availability.sourceId !== "bus_segment_speeds_2025" ||
    availability.releaseDecision.latestCompleteMonth !== input.analysisMonth ||
    availability.releaseDecision.lastBuiltMonth === null ||
    !ISO_MONTH_RE.test(availability.releaseDecision.lastBuiltMonth)
  ) {
    throw new Error(
      "Availability receipt does not prove the requested latest complete month and prior build boundary",
    );
  }
  if (
    manifest.artifactKind !== "studio_route_speed_spine_manifest" ||
    manifest.schemaVersion !== 1 ||
    manifest.source.endMonth !== input.analysisMonth ||
    manifest.summary.routeCount !== manifest.routes.length ||
    manifest.summary.artifactWrittenRouteCount !== manifest.routes.length ||
    manifest.routes.some((route) => !route.artifactWritten)
  ) {
    throw new Error("Speed-spine manifest is incomplete or does not match the analysis month");
  }
  if (scopeBindings.analysisMonth !== input.analysisMonth) {
    throw new Error("Physical-scope binding artifact does not match the analysis month");
  }
  const dbMonths = input.local.sqlite
    .query<
      { month: string; rowCount: number; routeCount: number; busTripCount: number },
      [string, string]
    >(
      `SELECT month, COUNT(*) AS rowCount, COUNT(DISTINCT route_id) AS routeCount,
              SUM(bus_trip_count) AS busTripCount
       FROM local_route_segment_speed
       WHERE month >= ? AND month <= ?
       GROUP BY month ORDER BY month`,
    )
    .all(manifest.source.startMonth, input.analysisMonth);
  const cellMonths = input.local.sqlite
    .query<
      { month: string; rowCount: number; routeCount: number; busTripCount: number },
      [string, string]
    >(
      `SELECT month, COUNT(*) AS rowCount, COUNT(DISTINCT route_id) AS routeCount,
              COALESCE(SUM(bus_trip_count), 0) AS busTripCount
       FROM local_route_segment_speed_cell
       WHERE month >= ? AND month <= ?
       GROUP BY month ORDER BY month`,
    )
    .all(manifest.source.startMonth, input.analysisMonth);
  if (
    dbMonths.length === 0 ||
    dbMonths[0]?.month !== manifest.source.startMonth ||
    dbMonths.at(-1)?.month !== input.analysisMonth
  ) {
    throw new Error("Outcome snapshot coverage is empty or does not match the spine bounds");
  }
  const requiredRefreshMonths: string[] = [];
  for (
    let month = nextMonth(availability.releaseDecision.lastBuiltMonth);
    month <= input.analysisMonth;
    month = nextMonth(month)
  ) {
    requiredRefreshMonths.push(month);
  }
  for (const expectedMonth of requiredRefreshMonths) {
    const availabilityMonth = availability.months.find((month) => month.isoMonth === expectedMonth);
    if (availabilityMonth?.status !== "complete") {
      throw new Error(
        `Availability receipt does not prove complete refresh month ${expectedMonth}`,
      );
    }
    const dbMonth = cellMonths.find((month) => month.month === availabilityMonth.isoMonth);
    if (
      dbMonth === undefined ||
      dbMonth.rowCount !== availabilityMonth.rowCount ||
      dbMonth.routeCount !== availabilityMonth.routeCount ||
      dbMonth.busTripCount !== availabilityMonth.busTripCount
    ) {
      throw new Error(
        `Outcome snapshot does not match availability for ${availabilityMonth.isoMonth}`,
      );
    }
  }
  const latestCellMonth = cellMonths.find((month) => month.month === input.analysisMonth);
  if (latestCellMonth === undefined) {
    throw new Error("Latest official outcome month has no raw-cell completeness receipt");
  }
  const routes = await Promise.all(
    manifest.routes
      .toSorted((left, right) => left.routeId.localeCompare(right.routeId))
      .map(async (route) => ({
        routeId: route.routeId,
        readiness: route.readiness,
        artifactKey: join("studio/v2/routes", route.routeSlug, "speed-spine.json"),
        artifact: await fileReceipt(resolveSpineArtifactPath(manifest, route.artifactPath)),
      })),
  );
  const speedSpineLogicalSha256 = sha256(
    JSON.stringify({
      startMonth: manifest.source.startMonth,
      endMonth: input.analysisMonth,
      toleranceMeters: manifest.source.toleranceMeters,
      routes,
    }),
  );
  const rowCount = dbMonths.reduce((sum, month) => sum + month.rowCount, 0);
  const busTripCount = dbMonths.reduce((sum, month) => sum + month.busTripCount, 0);
  const routeCount = (
    input.local.sqlite
      .query<{ count: number }, [string, string]>(
        `SELECT COUNT(DISTINCT route_id) AS count FROM local_route_segment_speed
         WHERE month >= ? AND month <= ?`,
      )
      .get(manifest.source.startMonth, input.analysisMonth) ?? { count: 0 }
  ).count;
  const artifact: StudyReviewInputsArtifactV1 = {
    artifactKind: "bp.studio.study_review_inputs.v1",
    schemaVersion: 1,
    analysisMonth: input.analysisMonth,
    outcomeSnapshot: {
      sourceId: "bus_segment_speeds_2025",
      sourceTable: "local_route_segment_speed",
      projectionVersion: "study-outcome-projection-v1",
      coverageStartMonth: manifest.source.startMonth,
      coverageEndMonth: input.analysisMonth,
      rowCount,
      routeCount,
      busTripCount,
      months: dbMonths.map((month) => ({ ...month })),
      logicalSha256: outcomeLogicalSha256(
        input.local,
        manifest.source.startMonth,
        input.analysisMonth,
      ),
      availability: {
        latestCompleteMonth: input.analysisMonth,
        artifact: await fileReceipt(input.availabilityPath),
      },
    },
    speedSpineSnapshot: {
      startMonth: manifest.source.startMonth,
      endMonth: input.analysisMonth,
      toleranceMeters: manifest.source.toleranceMeters,
      routeCount: routes.length,
      logicalSha256: speedSpineLogicalSha256,
      manifest: await fileReceipt(input.spineManifestPath),
      routes,
    },
    physicalScopeSnapshot: {
      bindings: await fileReceipt(input.scopeBindingsPath),
      candidateSetId: scopeBindings.candidateSetId,
      analysisMonth: scopeBindings.analysisMonth,
      localBusLaneSha256: laneTableLogicalSha256(input.local, "local_bus_lane"),
      localBusLaneCoordinateSha256: laneTableLogicalSha256(
        input.local,
        "local_bus_lane_coordinate",
      ),
    },
    engineVersion: "segment-matched-did-v2",
    reviewPolicyVersion: "plan074-admission-v1",
  };
  return Schema.decodeUnknownSync(StudyReviewInputsArtifactV1Schema, {
    onExcessProperty: "error",
  })(artifact);
}

export async function runSnapshotStudyReviewInputs(input: {
  local: OpenLocalPipelineDb;
  analysisMonth: string;
  availabilityPath: string;
  spineManifestPath: string;
  scopeBindingsPath: string;
  outputPath: string;
}): Promise<{ outputPath: string; analysisMonth: string; routeCount: number; rowCount: number }> {
  const artifact = await buildStudyReviewInputsArtifact(input);
  await writeJson(input.outputPath, artifact);
  return {
    outputPath: input.outputPath,
    analysisMonth: artifact.analysisMonth,
    routeCount: artifact.speedSpineSnapshot.routeCount,
    rowCount: artifact.outcomeSnapshot.rowCount,
  };
}

export default defineCommand({
  path: ["study", "snapshot-review-inputs"],
  summary: "Bind one immutable outcome, spine, scope, and estimator review cut.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      analysisMonth: Schema.String.check(Schema.isPattern(ISO_MONTH_RE)),
      availability: Schema.String,
      spineManifest: Schema.String,
      scopeBindings: Schema.String,
      output: Schema.String,
    }),
  },
  output: Schema.Struct({
    outputPath: Schema.String,
    analysisMonth: Schema.String,
    routeCount: Schema.Number,
    rowCount: Schema.Number,
  }),
  run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { readonly: true },
      command: "study.snapshot-review-inputs",
      operation: "runSnapshotStudyReviewInputs",
      run: (local) =>
        runSnapshotStudyReviewInputs({
          local,
          analysisMonth: input.options.analysisMonth,
          availabilityPath: fromCliPath(input.options.availability),
          spineManifestPath: fromCliPath(input.options.spineManifest),
          scopeBindingsPath: fromCliPath(input.options.scopeBindings),
          outputPath: fromCliPath(input.options.output),
        }),
    });
  },
});
