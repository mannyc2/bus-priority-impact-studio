import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parkingViolationMatchAuditPath } from "@bp/analytics/artifacts";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  buildParkingViolationMatchAuditArtifact,
  countParkingViolationLocationGroups,
  hydrateParkingViolationLionRawFields,
  type RawLionParkingMatchHydrationRow,
  refreshParkingViolationLocationKeys,
  runBuildParkingViolationMatchesLocalDb,
  summarizeParkingViolationMatches,
} from "@bp/pipeline-v2/local-db-aggregates";
import type { Geoclient } from "@bp/sources/clients/geoclient";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { createGeoclientFromEnv, Geocoder } from "../../lib/geocoder.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

export type BuildParkingViolationMatchesInputs = {
  local: OpenLocalPipelineDb;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  hydrateRawFields?: boolean | undefined;
  rawLionPath?: string | undefined;
  skipGeoclient?: boolean | undefined;
  maxCameraGroups?: number | undefined;
  maxAddressGroups?: number | undefined;
  computedAt?: Date | undefined;
  geoclient?: Geoclient | null | undefined;
  auditOnly?: boolean | undefined;
};

export type BuildParkingViolationMatchesResult = {
  computedAt: string;
  auditArtifactPath: string;
  hydratedParkingRows: number;
  hydratedLionRows: number;
  refreshedLocationKeyRows: number;
  cameraGroupsScanned: number;
  addressGroupsScanned: number;
  matchRows: number;
  matchedLocationGroups: number;
  representedEvents: number;
  routeCount: number;
  byMatchKind: Array<{ matchKind: string; confidence: string; rows: number; events: number }>;
};

export async function runBuildParkingViolationMatches(
  inputs: BuildParkingViolationMatchesInputs,
): Promise<BuildParkingViolationMatchesResult> {
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const auditArtifactPath = inputs.output ?? parkingViolationMatchAuditPath(artifactRoot);
  const computedAt = (inputs.computedAt ?? new Date()).toISOString();
  const { local } = inputs;

  const hydratedParkingRows = 0;
  let hydratedLionRows = 0;
  let refreshedLocationKeyRows = 0;
  let cameraGroupsScanned = 0;
  let addressGroupsScanned = 0;

  if (inputs.auditOnly === true) {
    cameraGroupsScanned = countParkingViolationLocationGroups(local.sqlite, "camera");
    addressGroupsScanned = countParkingViolationLocationGroups(local.sqlite, "street_code_house");
  } else {
    if (inputs.hydrateRawFields === true) {
      hydratedLionRows = await hydrateLionRawFields(local, inputs.rawLionPath);
      refreshedLocationKeyRows = refreshParkingViolationLocationKeys(local.sqlite);
    }

    const existingLocationKeys =
      local.sqlite
        .query<{ n: number }, []>(
          "SELECT count(*) AS n FROM local_parking_violation WHERE match_location_key IS NOT NULL",
        )
        .get()?.n ?? 0;
    if (inputs.hydrateRawFields !== true) {
      refreshedLocationKeyRows =
        existingLocationKeys > 0 ? 0 : refreshParkingViolationLocationKeys(local.sqlite);
    }

    const geoclient =
      inputs.skipGeoclient === true
        ? null
        : inputs.geoclient === undefined
          ? createGeoclientFromEnv()
          : inputs.geoclient;
    const geocoder = new Geocoder({
      db: local.db,
      sqlite: local.sqlite,
      sourceLabel: "nyc_parking_camera_location",
      geoclient,
    });

    const buildResult = await runBuildParkingViolationMatchesLocalDb({
      sqlite: local.sqlite,
      computedAt,
      maxCameraGroups: inputs.maxCameraGroups,
      maxAddressGroups: inputs.maxAddressGroups,
      geocodeCameraIntersection: (request) =>
        geocoder.resolve({
          kind: "intersection",
          crossStreetOne: request.crossStreetOne,
          crossStreetTwo: request.crossStreetTwo,
          borough: request.borough,
        }),
    });
    cameraGroupsScanned = buildResult.cameraGroupsScanned;
    addressGroupsScanned = buildResult.addressGroupsScanned;
  }

  const summary = summarizeParkingViolationMatches(local.sqlite);

  const result: BuildParkingViolationMatchesResult = {
    computedAt,
    auditArtifactPath,
    hydratedParkingRows,
    hydratedLionRows,
    refreshedLocationKeyRows,
    cameraGroupsScanned,
    addressGroupsScanned,
    matchRows: summary.matchRows,
    matchedLocationGroups: summary.matchedLocationGroups,
    representedEvents: summary.representedEvents,
    routeCount: summary.routeCount,
    byMatchKind: summary.byMatchKind,
  };

  await mkdir(dirname(auditArtifactPath), { recursive: true });
  await writeJson(
    auditArtifactPath,
    buildParkingViolationMatchAuditArtifact({
      generatedAt: computedAt,
      counts: {
        hydratedParkingRows: result.hydratedParkingRows,
        hydratedLionRows: result.hydratedLionRows,
        refreshedLocationKeyRows: result.refreshedLocationKeyRows,
        cameraGroupsScanned: result.cameraGroupsScanned,
        addressGroupsScanned: result.addressGroupsScanned,
      },
      summary,
    }),
  );

  return result;
}

async function hydrateLionRawFields(
  local: OpenLocalPipelineDb,
  rawLionPath?: string,
): Promise<number> {
  const path = rawLionPath ?? (await latestLionRawPath());
  const snapshot = await Bun.file(path).json();
  const rows = snapshotRows<RawLionParkingMatchHydrationRow>(snapshot);
  return hydrateParkingViolationLionRawFields(local.sqlite, rows);
}

async function latestLionRawPath(): Promise<string> {
  const dir = fromRepoRoot(join("data/raw/lion-centerline"));
  const entries = (await readdir(dir))
    .filter((entry) => entry.startsWith("lion-centerline-") && entry.endsWith(".json"))
    .sort();
  const latest = entries[entries.length - 1];
  if (!latest) throw new Error(`No lion-centerline raw snapshot found in ${dir}.`);
  return join(dir, latest);
}

function snapshotRows<T>(snapshot: unknown): T[] {
  if (Array.isArray(snapshot)) return snapshot as T[];
  if (
    snapshot &&
    typeof snapshot === "object" &&
    Array.isArray((snapshot as { rows?: unknown }).rows)
  ) {
    return (snapshot as { rows: T[] }).rows;
  }
  return [];
}

export default defineCommand({
  path: ["build", "parking-violation-matches"],
  summary: "Resolve parking-violation location groups to route candidates via LION + Geoclient.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Artifact root (defaults to data/artifacts/)",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override path for the audit JSON",
        }),
        rawLion: Schema.optionalKey(Schema.String).annotate({
          description: "Raw lion-centerline snapshot path",
        }),
        hydrateRawFields: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
          .annotate({
            description: "Re-hydrate LION raw fields from snapshots and refresh parking match keys",
          }),
        skipGeoclient: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
          .annotate({ description: "Disable Geoclient (rely on cache + LION snap only)" }),
        maxCameraGroups: Schema.optionalKey(arg.positiveInt()).annotate({
          description: "Cap camera groups scanned",
        }),
        maxAddressGroups: Schema.optionalKey(arg.positiveInt()).annotate({
          description: "Cap address groups scanned",
        }),
        auditOnly: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
          .annotate({ description: "Skip rebuild; just recount the current match table" }),
      },
    }),
  },
  output: Schema.Struct({
    computedAt: Schema.String,
    auditArtifactPath: Schema.String,
    hydratedParkingRows: Schema.Number,
    hydratedLionRows: Schema.Number,
    refreshedLocationKeyRows: Schema.Number,
    cameraGroupsScanned: Schema.Number,
    addressGroupsScanned: Schema.Number,
    matchRows: Schema.Number,
    matchedLocationGroups: Schema.Number,
    representedEvents: Schema.Number,
    routeCount: Schema.Number,
    byMatchKind: Schema.Array(Schema.Unknown),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { spatial: true },
      command: "build.parking-violation-matches",
      operation: "runBuildParkingViolationMatches",
      spanAttributes: {
        hydrateRawFields: input.options.hydrateRawFields,
        skipGeoclient: input.options.skipGeoclient,
        auditOnly: input.options.auditOnly,
        maxCameraGroups: input.options.maxCameraGroups ?? null,
        maxAddressGroups: input.options.maxAddressGroups ?? null,
      },
      run: (local) =>
        runBuildParkingViolationMatches({
          local,
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          output:
            input.options.output === undefined ? undefined : fromCliPath(input.options.output),
          rawLionPath:
            input.options.rawLion === undefined ? undefined : fromCliPath(input.options.rawLion),
          hydrateRawFields: input.options.hydrateRawFields,
          skipGeoclient: input.options.skipGeoclient,
          maxCameraGroups: input.options.maxCameraGroups,
          maxAddressGroups: input.options.maxAddressGroups,
          auditOnly: input.options.auditOnly,
        }),
    });
  },
});
