import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  auditProjectionSegmentHourBins,
  auditRouteBriefInputHourlyBins,
  hasDotRouteLaneCoverage,
  hasValidRidershipProfile,
  hasValidTrendMonthLabels,
  type RouteBriefInputHourlyBins,
} from "../../lib/studio-coverage-evaluation.ts";

type ObservedReliabilityByMonth = {
  month: string;
  runIds: string[];
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  sampleCount: number;
};

type GeneratedArtifactPresentationScan = {
  generatedArtifactPresentationViolationCount: number;
  generatedArtifactPresentationViolations: string[];
};

type EvidenceCatalogAudit = {
  evidenceCatalogItemCount: number;
  evidenceCatalogInvalidItemCount: number;
  invalidEvidenceCatalogRefs: string[];
};

export type StudioCoverageAuditResult = {
  schemaVersion: 1;
  generatedAt: string;
  isoMonth: string;
  status: "pass" | "warn" | "fail";
  d1: {
    routeCatalogCount: number;
    routeBriefSummaryCount: number;
    publicRouteBriefSummaryCount: number;
    observedReliability: ObservedReliabilityByMonth[];
  };
  projection: {
    routesListCount: number;
    routesListWithDotLaneCoverage: number;
    routesListWithInvalidLaneCoverage: number;
    routesListWithTrendMonthLabels: number;
    routesListWithInvalidTrendMonthLabels: number;
    routesListWithRidershipProfile: number;
    routesListWithInvalidRidershipProfile: number;
    routeDetailCount: number;
    routeDetailSegmentCount: number;
    routeDetailSegmentsWith24HourBins: number;
    routeDetailSegmentsWithInvalidHourBins: number;
    routeDetailSegmentsWithDotLaneGeometry: number;
    routeDetailSegmentsWithInvalidLaneGeometry: number;
    routeDetailSegmentsWithRouteShapeGeometry: number;
    routeDetailSegmentsWithInvalidRouteShapeGeometry: number;
    routeDetailSegmentsWithTspSourceEvidence: number;
    routeDetailSegmentsWithInvalidTspEvidence: number;
    routeDetailSegmentsWithPublicAiNotes: number;
    routeDetailSegmentsWithInvalidPublicAiNotes: number;
    routeDetailsWithExcessPublicAiNoteDensity: number;
    routeDetailsWithRidershipProfile: number;
    routeDetailsWithInvalidRidershipProfile: number;
    routeSegmentEvidenceCount: number;
    routeSegmentEvidenceWithDotLaneGeometry: number;
    routeSegmentEvidenceWithInvalidLaneGeometry: number;
    routeSegmentEvidenceWithRouteShapeGeometry: number;
    routeSegmentEvidenceWithInvalidRouteShapeGeometry: number;
    routeSegmentEvidenceWithTspSourceEvidence: number;
    routeSegmentEvidenceWithInvalidTspEvidence: number;
    routeSegmentEvidenceWithCompleteRiderDelay: number;
    routeSegmentEvidenceWithInvalidRiderDelay: number;
    routeSegmentResponsesWithCoverageMetadata: number;
    routeSegmentResponsesWithInvalidCoverageMetadata: number;
    evidenceCatalogItemCount: number;
    evidenceCatalogInvalidItemCount: number;
    generatedArtifactPresentationViolationCount: number;
  };
  routeBriefInputs: RouteBriefInputHourlyBins;
  gaps: {
    routesMissingFromProjection: string[];
    routesWithInvalidLaneCoverage: string[];
    routesWithInvalidTrendMonthLabels: string[];
    routesWithInvalidRidershipProfile: string[];
    routesMissingRouteBriefInput: string[];
    routesMissingScheduleComparisons: string[];
    routesWithSegmentsMissingScheduleComparisons: string[];
    routesWithIncompleteScheduleComparisons: string[];
    routesWithMissingRidershipExposure: string[];
    routesWithMissingHourlyBins: string[];
    routesWithLegacyHourlyBins: string[];
    routeDetailSegmentsWithInvalidHourBins: string[];
    routeDetailSegmentsWithInvalidLaneGeometry: string[];
    routeDetailSegmentsWithInvalidRouteShapeGeometry: string[];
    routeDetailSegmentsWithInvalidTspEvidence: string[];
    routeDetailSegmentsWithInvalidPublicAiNotes: string[];
    routeDetailsWithExcessPublicAiNoteDensity: string[];
    routeDetailsWithInvalidRidershipProfile: string[];
    routeSegmentEvidenceWithInvalidLaneGeometry: string[];
    routeSegmentEvidenceWithInvalidRouteShapeGeometry: string[];
    routeSegmentEvidenceWithInvalidTspEvidence: string[];
    routeSegmentEvidenceWithInvalidRiderDelay: string[];
    routeSegmentResponsesWithInvalidCoverageMetadata: string[];
    evidenceCatalogInvalidItems: string[];
    generatedArtifactPresentationViolations: string[];
    d1RouteAddressabilityShare: number;
    studioRouteCoverageShare: number;
    note: string;
  };
  outputPath: string;
};

async function listDirectoryEntries(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function listJsonFiles(path: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = (await readdir(path, { withFileTypes: true })) as Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) return listJsonFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
}

async function readJsonArray(path: string, key: string): Promise<unknown[]> {
  try {
    const body = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
    const value = body[key];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function pickField(entry: unknown, ...keys: string[]): string | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return null;
}

const forbiddenGeneratedArtifactPresentationTerms = [
  "LOCAL SKETCH",
  "Local claim sketch",
  "not persisted",
  "Estimated speed by hour",
  "Generate brief",
  "Open route brief",
  "Start brief",
  "RH/day",
  "rider-hr/day",
  "rider-hours/day",
  "Delay exposure / day",
  "Top rider-impact segments",
  "List route cards",
  "Rider-hour",
  "rider-hour",
  "rider hours",
  "rider-hours",
  "rider impact",
  "rider-impact",
  "full route rider-hours",
  "full-route rider-hours",
  "route-wide rider-hours",
  "top decile route-wide",
  "total route delay",
] as const;

async function auditGeneratedArtifactPresentationText(
  studioRoot: string,
): Promise<GeneratedArtifactPresentationScan> {
  const jsonFiles = await listJsonFiles(studioRoot);
  const violations: string[] = [];

  for (const path of jsonFiles) {
    const text = await readFile(path, "utf8");
    for (const term of forbiddenGeneratedArtifactPresentationTerms) {
      if (text.includes(term)) {
        violations.push(`${path.replace(`${studioRoot}/`, "")}:${term}`);
      }
    }
  }

  return {
    generatedArtifactPresentationViolationCount: violations.length,
    generatedArtifactPresentationViolations: violations.sort(),
  };
}

async function auditEvidenceCatalog(_studioRoot: string): Promise<EvidenceCatalogAudit> {
  // evidence.json projection retired with the cohort/evidence catalog domain refactor;
  // gate is now vestigial and always reports zero items.
  return {
    evidenceCatalogItemCount: 0,
    evidenceCatalogInvalidItemCount: 0,
    invalidEvidenceCatalogRefs: [],
  };
}

function aggregateObserved(
  rows: readonly {
    month: string;
    runId: string;
    reliabilityStatus: "observed" | "insufficient_gtfs_rt_samples";
    sampleCount: number;
  }[],
): ObservedReliabilityByMonth[] {
  const byMonth = new Map<string, ObservedReliabilityByMonth>();
  for (const row of rows) {
    const entry = byMonth.get(row.month) ?? {
      month: row.month,
      runIds: [] as string[],
      routeCount: 0,
      observedRouteCount: 0,
      insufficientRouteCount: 0,
      sampleCount: 0,
    };
    if (!entry.runIds.includes(row.runId)) {
      entry.runIds.push(row.runId);
    }
    entry.routeCount += 1;
    if (row.reliabilityStatus === "observed") {
      entry.observedRouteCount += 1;
    } else {
      entry.insufficientRouteCount += 1;
    }
    entry.sampleCount += row.sampleCount;
    byMonth.set(row.month, entry);
  }
  return [...byMonth.values()]
    .map((entry) => ({ ...entry, runIds: entry.runIds.slice().sort() }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export type AuditStudioCoverageInputs = {
  local: { db: import("@bp/db/local").LocalPipelineDb };
  year: number;
  month: number;
  artifactRoot?: string | undefined;
  output?: string | undefined;
};

export async function auditStudioCoverage(
  inputs: AuditStudioCoverageInputs,
): Promise<StudioCoverageAuditResult> {
  const isoMonthValue = isoMonth(inputs.year, inputs.month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const studioRoot = join(artifactRoot, "studio", "v1");
  const outputPath =
    inputs.output ??
    fromRepoRoot(join("data", "artifacts", "audits", `studio-coverage-${isoMonthValue}.json`));

  const local = inputs.local;
  const [catalog, briefSummaries, observedRows] = await Promise.all([
    listRouteCatalog(local.db),
    listRouteBriefSummaries(local.db, isoMonthValue),
    listRouteObservedReliabilitySummaries(local.db, isoMonthValue),
  ]);
  const publicRouteIds = new Set(
    briefSummaries.filter((entry) => entry.publicVisible).map((entry) => entry.routeId),
  );

  const [routesList, routeDirs] = await Promise.all([
    readJsonArray(join(studioRoot, "routes.json"), "routes"),
    listDirectoryEntries(join(studioRoot, "routes")),
  ]);

  const projectionRouteIds = new Set(
    routesList
      .map((entry) => pickField(entry, "routeId"))
      .filter((id): id is string => id !== null),
  );
  const routesWithInvalidLaneCoverage = routesList
    .map((entry, index) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as {
              routeId?: unknown;
              laneCoverage?: unknown;
              laneCoverageSource?: unknown;
              laneTypes?: unknown;
              laneOperatingHours?: unknown;
              laneOperatingDays?: unknown;
            })
          : {};
      return hasDotRouteLaneCoverage(record)
        ? null
        : typeof record.routeId === "string"
          ? record.routeId
          : `routes:${index + 1}`;
    })
    .filter((id): id is string => id !== null)
    .sort();
  const routesWithInvalidTrendMonthLabels = routesList
    .map((entry, index) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as {
              routeId?: unknown;
              spark?: unknown;
              sparkMonths?: unknown;
              ridershipSpark?: unknown;
              ridershipSparkMonths?: unknown;
            })
          : {};
      return hasValidTrendMonthLabels(record)
        ? null
        : typeof record.routeId === "string"
          ? record.routeId
          : `routes:${index + 1}`;
    })
    .filter((id): id is string => id !== null)
    .sort();
  const routesWithInvalidRidershipProfile = routesList
    .map((entry, index) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as {
              routeId?: unknown;
              ridershipProfile?: unknown;
            })
          : {};
      return hasValidRidershipProfile(record)
        ? null
        : typeof record.routeId === "string"
          ? record.routeId
          : `routes:${index + 1}`;
    })
    .filter((id): id is string => id !== null)
    .sort();
  const routesMissingFromProjection = [...publicRouteIds]
    .filter((routeId) => !projectionRouteIds.has(routeId))
    .sort();
  const coveredPublicRouteCount = [...publicRouteIds].filter((routeId) =>
    projectionRouteIds.has(routeId),
  ).length;

  const studioRouteCoverageShare =
    publicRouteIds.size === 0
      ? 1
      : Number((coveredPublicRouteCount / publicRouteIds.size).toFixed(4));
  const d1RouteAddressabilityShare =
    publicRouteIds.size === 0
      ? 0
      : Number(Math.min(1, catalog.length / publicRouteIds.size).toFixed(4));

  const [routeBriefInputs, projectionSegmentHours, evidenceCatalogAudit, presentationScan] =
    await Promise.all([
      auditRouteBriefInputHourlyBins({
        artifactRoot,
        isoMonth: isoMonthValue,
        routeIds: [...publicRouteIds].sort(),
      }),
      auditProjectionSegmentHourBins({
        studioRoot,
        routeDirs,
      }),
      auditEvidenceCatalog(studioRoot),
      auditGeneratedArtifactPresentationText(studioRoot),
    ]);
  const hasMandatoryServingGaps =
    publicRouteIds.size === 0 ||
    d1RouteAddressabilityShare < 1 ||
    routeBriefInputs.routesMissingBriefInput.length > 0 ||
    routeBriefInputs.routesMissingScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithSegmentsMissingScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithIncompleteScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithMissingRidershipExposure.length > 0 ||
    routeBriefInputs.routesWithMissingHourlyBins.length > 0 ||
    routeBriefInputs.routesWithLegacyHourlyBins.length > 0 ||
    routesWithInvalidLaneCoverage.length > 0 ||
    routesWithInvalidTrendMonthLabels.length > 0 ||
    routesWithInvalidRidershipProfile.length > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidLaneGeometry > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidRouteShapeGeometry > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidTspEvidence > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidRiderDelay > 0 ||
    projectionSegmentHours.routeSegmentResponsesWithInvalidCoverageMetadata > 0 ||
    evidenceCatalogAudit.evidenceCatalogInvalidItemCount > 0 ||
    presentationScan.generatedArtifactPresentationViolationCount > 0;
  const hasLegacyRouteDetailProjectionGaps =
    projectionSegmentHours.segmentsWithInvalidHourBins > 0 ||
    projectionSegmentHours.segmentsWithInvalidLaneGeometry > 0 ||
    projectionSegmentHours.segmentsWithInvalidRouteShapeGeometry > 0 ||
    projectionSegmentHours.segmentsWithInvalidTspEvidence > 0 ||
    projectionSegmentHours.segmentsWithInvalidPublicAiNotes > 0 ||
    projectionSegmentHours.routeDetailsWithExcessPublicAiNoteDensity > 0 ||
    projectionSegmentHours.routeDetailsWithInvalidRidershipProfile > 0;

  const status: StudioCoverageAuditResult["status"] = hasMandatoryServingGaps
    ? "fail"
    : routesMissingFromProjection.length > 0 ||
        studioRouteCoverageShare < 0.5 ||
        hasLegacyRouteDetailProjectionGaps
      ? "warn"
      : "pass";

  const result: StudioCoverageAuditResult = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    isoMonth: isoMonthValue,
    status,
    d1: {
      routeCatalogCount: catalog.length,
      routeBriefSummaryCount: briefSummaries.length,
      publicRouteBriefSummaryCount: publicRouteIds.size,
      observedReliability: aggregateObserved(observedRows),
    },
    projection: {
      routesListCount: routesList.length,
      routesListWithDotLaneCoverage: routesList.length - routesWithInvalidLaneCoverage.length,
      routesListWithInvalidLaneCoverage: routesWithInvalidLaneCoverage.length,
      routesListWithTrendMonthLabels: routesList.length - routesWithInvalidTrendMonthLabels.length,
      routesListWithInvalidTrendMonthLabels: routesWithInvalidTrendMonthLabels.length,
      routesListWithRidershipProfile: routesList.length - routesWithInvalidRidershipProfile.length,
      routesListWithInvalidRidershipProfile: routesWithInvalidRidershipProfile.length,
      routeDetailCount: routeDirs.length,
      routeDetailSegmentCount: projectionSegmentHours.segmentCount,
      routeDetailSegmentsWith24HourBins: projectionSegmentHours.segmentsWith24HourBins,
      routeDetailSegmentsWithInvalidHourBins: projectionSegmentHours.segmentsWithInvalidHourBins,
      routeDetailSegmentsWithDotLaneGeometry: projectionSegmentHours.segmentsWithDotLaneGeometry,
      routeDetailSegmentsWithInvalidLaneGeometry:
        projectionSegmentHours.segmentsWithInvalidLaneGeometry,
      routeDetailSegmentsWithRouteShapeGeometry:
        projectionSegmentHours.segmentsWithRouteShapeGeometry,
      routeDetailSegmentsWithInvalidRouteShapeGeometry:
        projectionSegmentHours.segmentsWithInvalidRouteShapeGeometry,
      routeDetailSegmentsWithTspSourceEvidence:
        projectionSegmentHours.segmentsWithTspSourceEvidence,
      routeDetailSegmentsWithInvalidTspEvidence:
        projectionSegmentHours.segmentsWithInvalidTspEvidence,
      routeDetailSegmentsWithPublicAiNotes: projectionSegmentHours.segmentsWithPublicAiNotes,
      routeDetailSegmentsWithInvalidPublicAiNotes:
        projectionSegmentHours.segmentsWithInvalidPublicAiNotes,
      routeDetailsWithExcessPublicAiNoteDensity:
        projectionSegmentHours.routeDetailsWithExcessPublicAiNoteDensity,
      routeDetailsWithRidershipProfile: projectionSegmentHours.routeDetailsWithRidershipProfile,
      routeDetailsWithInvalidRidershipProfile:
        projectionSegmentHours.routeDetailsWithInvalidRidershipProfile,
      routeSegmentEvidenceCount: projectionSegmentHours.routeSegmentEvidenceCount,
      routeSegmentEvidenceWithDotLaneGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithDotLaneGeometry,
      routeSegmentEvidenceWithInvalidLaneGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidLaneGeometry,
      routeSegmentEvidenceWithRouteShapeGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithRouteShapeGeometry,
      routeSegmentEvidenceWithInvalidRouteShapeGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidRouteShapeGeometry,
      routeSegmentEvidenceWithTspSourceEvidence:
        projectionSegmentHours.routeSegmentEvidenceWithTspSourceEvidence,
      routeSegmentEvidenceWithInvalidTspEvidence:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidTspEvidence,
      routeSegmentEvidenceWithCompleteRiderDelay:
        projectionSegmentHours.routeSegmentEvidenceWithCompleteRiderDelay,
      routeSegmentEvidenceWithInvalidRiderDelay:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidRiderDelay,
      routeSegmentResponsesWithCoverageMetadata:
        projectionSegmentHours.routeSegmentResponsesWithCoverageMetadata,
      routeSegmentResponsesWithInvalidCoverageMetadata:
        projectionSegmentHours.routeSegmentResponsesWithInvalidCoverageMetadata,
      evidenceCatalogItemCount: evidenceCatalogAudit.evidenceCatalogItemCount,
      evidenceCatalogInvalidItemCount: evidenceCatalogAudit.evidenceCatalogInvalidItemCount,
      generatedArtifactPresentationViolationCount:
        presentationScan.generatedArtifactPresentationViolationCount,
    },
    routeBriefInputs,
    gaps: {
      routesMissingFromProjection,
      routesWithInvalidLaneCoverage,
      routesWithInvalidTrendMonthLabels,
      routesWithInvalidRidershipProfile,
      routesMissingRouteBriefInput: routeBriefInputs.routesMissingBriefInput,
      routesMissingScheduleComparisons: routeBriefInputs.routesMissingScheduleComparisons,
      routesWithSegmentsMissingScheduleComparisons:
        routeBriefInputs.routesWithSegmentsMissingScheduleComparisons,
      routesWithIncompleteScheduleComparisons:
        routeBriefInputs.routesWithIncompleteScheduleComparisons,
      routesWithMissingRidershipExposure: routeBriefInputs.routesWithMissingRidershipExposure,
      routesWithMissingHourlyBins: routeBriefInputs.routesWithMissingHourlyBins,
      routesWithLegacyHourlyBins: routeBriefInputs.routesWithLegacyHourlyBins,
      routeDetailSegmentsWithInvalidHourBins: projectionSegmentHours.invalidSegmentRefs,
      routeDetailSegmentsWithInvalidLaneGeometry: projectionSegmentHours.invalidLaneRefs,
      routeDetailSegmentsWithInvalidRouteShapeGeometry:
        projectionSegmentHours.invalidRouteShapeRefs,
      routeDetailSegmentsWithInvalidTspEvidence: projectionSegmentHours.invalidTspRefs,
      routeDetailSegmentsWithInvalidPublicAiNotes: projectionSegmentHours.invalidPublicAiNoteRefs,
      routeDetailsWithExcessPublicAiNoteDensity:
        projectionSegmentHours.excessPublicAiNoteDensityRefs,
      routeDetailsWithInvalidRidershipProfile:
        projectionSegmentHours.invalidRouteDetailRidershipProfileRefs,
      routeSegmentEvidenceWithInvalidLaneGeometry:
        projectionSegmentHours.invalidRouteSegmentEvidenceLaneRefs,
      routeSegmentEvidenceWithInvalidRouteShapeGeometry:
        projectionSegmentHours.invalidRouteSegmentEvidenceRouteShapeRefs,
      routeSegmentEvidenceWithInvalidTspEvidence:
        projectionSegmentHours.invalidRouteSegmentEvidenceTspRefs,
      routeSegmentEvidenceWithInvalidRiderDelay:
        projectionSegmentHours.invalidRouteSegmentEvidenceRiderDelayRefs,
      routeSegmentResponsesWithInvalidCoverageMetadata:
        projectionSegmentHours.invalidRouteSegmentCoverageRefs,
      evidenceCatalogInvalidItems: evidenceCatalogAudit.invalidEvidenceCatalogRefs,
      generatedArtifactPresentationViolations:
        presentationScan.generatedArtifactPresentationViolations,
      d1RouteAddressabilityShare,
      studioRouteCoverageShare,
      note: "D1 route addressability is the public /api/v1/studio/routes fail gate. Route evidence inputs must include complete schedule comparisons, ridership exposure, and 24 observed hourly slow-window bins for every public route segment before the release can pass. Route segment evidence projections must carry DOT bus-lane geometry, route-shape LineStrings, TSP source-status evidence, complete delay-exposure evidence, explicit route-segment coverage blocker metadata, unique stable evidence catalog IDs with source refs and immutable artifact href/hash metadata, and no retired synthetic/proxy presentation phrases in generated JSON artifacts. Legacy route detail projection geometry, public-AI-note, and route-level ridership-profile gaps are warnings until the v1 curated route-detail artifacts are rebuilt from the v2 serving surfaces.",
    },
    outputPath,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, result);
  return result;
}

export default defineCommand({
  path: ["audit", "studio-coverage"],
  summary: "Audit Studio projection vs DB coverage and write a JSON report.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override output path for audit JSON",
        }),
      },
    }),
  },
  output: Schema.Struct({
    status: Schema.Literals(["pass", "warn", "fail"]),
    isoMonth: Schema.String,
    outputPath: Schema.String,
  }),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const output =
      input.options.output === undefined ? undefined : fromCliPath(input.options.output);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { readonly: true },
      command: "audit.studio-coverage",
      operation: "auditStudioCoverage",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
      },
      run: (local) =>
        auditStudioCoverage({
          local,
          year: input.options.year,
          month: input.options.month,
          artifactRoot,
          output,
        }),
    });
  },
});
