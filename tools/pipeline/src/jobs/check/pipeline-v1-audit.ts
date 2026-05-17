import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listBusLanes,
  listRouteBriefSummaries,
  listRouteMonthCoverage,
  listRouteStops,
} from "@bp/db/local";
import { type CliOption, dbOption, parseCliOptions } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.js";
import { busLaneMatches } from "../build/route-brief-metrics.js";
import { parseBusLaneOpenDates } from "../build/route-intervention-evaluation.js";
import { preflightGtfsRt } from "./gtfs-rt-preflight.js";
import { checkPipelineV1 } from "./pipeline-v1.js";

type PipelineV1AuditArgs = {
  publicYear?: number;
  publicMonth?: number;
  realtimeYear?: number;
  realtimeMonth?: number;
  runId?: string;
  dbPath?: string;
  cleanDbPath?: string;
  cleanArtifactRoot?: string;
  cleanExportRoot?: string;
  sourceMetadataDir?: string;
  now?: Date;
  minGtfsRtCollectionHours?: number;
  artifactRoot?: string;
  exportRoot?: string;
  output?: string;
};

type RequirementStatus = "pass" | "partial" | "blocked";

type PipelineV1AuditChecklistItem = {
  requirement: string;
  status: RequirementStatus;
  evidence: string;
  missing: string[];
};

type CoverageSummary = {
  isoMonth: string;
  routeRows: number;
  speedRoutes: number;
  scheduleRoutes: number;
};

type BusLaneSourceGapDiagnostics = {
  publicMatchedRouteCount: number;
  matchedLaneInstanceCount: number;
  missingOpenDateLaneInstanceCount: number;
  blankOpenDateLaneInstanceCount: number;
  unparsableOpenDateLaneInstanceCount: number;
  routesWithMissingOpenDateCount: number;
  distinctUnparsableOpenDateValues: { sourceValue: string; laneInstanceCount: number }[];
  topRoutesByMissingOpenDate: {
    routeId: string;
    missingOpenDateLaneInstanceCount: number;
    matchedLaneInstanceCount: number;
  }[];
};

type PipelineV1AuditResult = {
  status: RequirementStatus;
  generatedAt: string;
  publicMonth: string;
  realtimeMonth: string;
  runId: string | null;
  outputPath: string;
  checklist: PipelineV1AuditChecklistItem[];
  coverage: {
    publicMonth: CoverageSummary;
    realtimeMonth: CoverageSummary;
  };
  interventions: {
    busLaneSourceGaps: BusLaneSourceGapDiagnostics;
  };
  gates: {
    publicStructuralStatus: string;
    publicStrictStatus: string;
    realtimePreflightStatus: string;
    cleanRebuildStatus: string | null;
    publicStrictIssues: string[];
    realtimePreflightIssues: string[];
    cleanRebuildIssues: string[];
  };
  recommendation: string;
};

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function defaultOutputPath(publicMonth: string, realtimeMonth: string): string {
  return fromRepoRoot(
    join("data/artifacts/pipeline-v1", `audit-${publicMonth}-${realtimeMonth}.json`),
  );
}

function parseArgs(args: string[]): Required<PipelineV1AuditArgs> {
  const output: PipelineV1AuditArgs = {};
  const options: CliOption<PipelineV1AuditArgs>[] = [
    {
      flags: ["--public-year"],
      apply: (target, value) => {
        target.publicYear = Number(value);
      },
    },
    {
      flags: ["--public-month"],
      apply: (target, value) => {
        target.publicMonth = Number(value);
      },
    },
    {
      flags: ["--realtime-year"],
      apply: (target, value) => {
        target.realtimeYear = Number(value);
      },
    },
    {
      flags: ["--realtime-month"],
      apply: (target, value) => {
        target.realtimeMonth = Number(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.output = fromCliPath(value);
        }
      },
    },
    dbOption(fromCliPath),
    {
      flags: ["--clean-db"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.cleanDbPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--clean-artifact-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.cleanArtifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--clean-export-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.cleanExportRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--source-metadata-dir"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.sourceMetadataDir = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--min-gtfs-rt-collection-hours"],
      apply: (target, value) => {
        target.minGtfsRtCollectionHours = Number(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--export-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.exportRoot = fromCliPath(value);
        }
      },
    },
  ];
  const parsed = parseCliOptions(args, output, options);
  const publicYear = parsed.publicYear ?? 2026;
  const publicMonth = parsed.publicMonth ?? 3;
  const realtimeYear = parsed.realtimeYear ?? publicYear;
  const realtimeMonth = parsed.realtimeMonth ?? publicMonth;
  const publicIsoMonth = isoMonth(publicYear, publicMonth);
  const realtimeIsoMonth = isoMonth(realtimeYear, realtimeMonth);

  return {
    publicYear,
    publicMonth,
    realtimeYear,
    realtimeMonth,
    runId: parsed.runId ?? "",
    dbPath: parsed.dbPath ?? "",
    cleanDbPath: parsed.cleanDbPath ?? "",
    cleanArtifactRoot: parsed.cleanArtifactRoot ?? "",
    cleanExportRoot: parsed.cleanExportRoot ?? "",
    sourceMetadataDir: parsed.sourceMetadataDir ?? "",
    now: parsed.now ?? new Date(0),
    minGtfsRtCollectionHours: parsed.minGtfsRtCollectionHours ?? 0,
    artifactRoot: parsed.artifactRoot ?? "",
    exportRoot: parsed.exportRoot ?? "",
    output: parsed.output ?? defaultOutputPath(publicIsoMonth, realtimeIsoMonth),
  };
}

function statusFromItems(items: readonly PipelineV1AuditChecklistItem[]): RequirementStatus {
  if (items.some((item) => item.status === "blocked")) {
    return "blocked";
  }

  if (items.some((item) => item.status === "partial")) {
    return "partial";
  }

  return "pass";
}

async function coverageSummary(dbPath: string, month: string): Promise<CoverageSummary> {
  return withLocalPipelineDb(dbPath.length > 0 ? dbPath : undefined, async (local) => {
    const rows = await listRouteMonthCoverage(local.db, month);
    return {
      isoMonth: month,
      routeRows: rows.length,
      speedRoutes: rows.filter((row) => row.hasSpeedData).length,
      scheduleRoutes: rows.filter((row) => row.hasScheduleData).length,
    };
  });
}

async function busLaneSourceGapDiagnostics(
  dbPath: string,
  month: string,
): Promise<BusLaneSourceGapDiagnostics> {
  return withLocalPipelineDb(dbPath.length > 0 ? dbPath : undefined, async (local) => {
    const [briefs, busLanes] = await Promise.all([
      listRouteBriefSummaries(local.db, month),
      listBusLanes(local.db),
    ]);
    const publicMatchedBriefs = briefs.filter(
      (brief) => brief.publicVisible && brief.busLaneMatchedLaneCount > 0,
    );
    const unparsableValues = new Map<string, number>();
    const routeGaps: BusLaneSourceGapDiagnostics["topRoutesByMissingOpenDate"] = [];
    let matchedLaneInstanceCount = 0;
    let missingOpenDateLaneInstanceCount = 0;
    let blankOpenDateLaneInstanceCount = 0;
    let unparsableOpenDateLaneInstanceCount = 0;

    for (const brief of publicMatchedBriefs) {
      const stops = await listRouteStops(local.db, brief.routeId, month);
      const matchedLanes = busLaneMatches([...busLanes], [...stops]).map((match) => match.lane);
      let routeMissingOpenDateLaneInstanceCount = 0;

      for (const lane of matchedLanes) {
        matchedLaneInstanceCount += 1;
        const sourceValue = lane.openDate?.trim() ?? "";
        if (parseBusLaneOpenDates(sourceValue).length > 0) {
          continue;
        }

        missingOpenDateLaneInstanceCount += 1;
        routeMissingOpenDateLaneInstanceCount += 1;
        if (sourceValue.length === 0) {
          blankOpenDateLaneInstanceCount += 1;
        } else {
          unparsableOpenDateLaneInstanceCount += 1;
          unparsableValues.set(sourceValue, (unparsableValues.get(sourceValue) ?? 0) + 1);
        }
      }

      if (routeMissingOpenDateLaneInstanceCount > 0) {
        routeGaps.push({
          routeId: brief.routeId,
          missingOpenDateLaneInstanceCount: routeMissingOpenDateLaneInstanceCount,
          matchedLaneInstanceCount: matchedLanes.length,
        });
      }
    }

    return {
      publicMatchedRouteCount: publicMatchedBriefs.length,
      matchedLaneInstanceCount,
      missingOpenDateLaneInstanceCount,
      blankOpenDateLaneInstanceCount,
      unparsableOpenDateLaneInstanceCount,
      routesWithMissingOpenDateCount: routeGaps.length,
      distinctUnparsableOpenDateValues: [...unparsableValues.entries()]
        .sort(
          ([leftValue, leftCount], [rightValue, rightCount]) =>
            rightCount - leftCount || leftValue.localeCompare(rightValue),
        )
        .slice(0, 20)
        .map(([sourceValue, laneInstanceCount]) => ({ sourceValue, laneInstanceCount })),
      topRoutesByMissingOpenDate: routeGaps
        .sort(
          (left, right) =>
            right.missingOpenDateLaneInstanceCount - left.missingOpenDateLaneInstanceCount ||
            left.routeId.localeCompare(right.routeId),
        )
        .slice(0, 20),
    };
  });
}

export async function auditPipelineV1(
  args: PipelineV1AuditArgs = {},
): Promise<PipelineV1AuditResult> {
  const publicYear = args.publicYear ?? 2026;
  const publicMonth = args.publicMonth ?? 3;
  const realtimeYear = args.realtimeYear ?? publicYear;
  const realtimeMonth = args.realtimeMonth ?? publicMonth;
  const publicIsoMonth = isoMonth(publicYear, publicMonth);
  const realtimeIsoMonth = isoMonth(realtimeYear, realtimeMonth);
  const outputPath = args.output ?? defaultOutputPath(publicIsoMonth, realtimeIsoMonth);
  const dbPath = args.dbPath;
  const dbArg = dbPath === undefined ? {} : { dbPath };
  const runArg = args.runId === undefined ? {} : { runId: args.runId };
  const sourceMetadataArg =
    args.sourceMetadataDir === undefined ? {} : { sourceMetadataDir: args.sourceMetadataDir };
  const nowArg = args.now === undefined ? {} : { now: args.now };
  const minCollectionHoursArg =
    args.minGtfsRtCollectionHours === undefined
      ? {}
      : { minGtfsRtCollectionHours: args.minGtfsRtCollectionHours };
  const artifactRootArg =
    args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot };
  const exportRootArg = args.exportRoot === undefined ? {} : { exportRoot: args.exportRoot };
  const cleanRebuild =
    args.cleanDbPath === undefined
      ? null
      : await checkPipelineV1({
          year: publicYear,
          month: publicMonth,
          dbPath: args.cleanDbPath,
          ...sourceMetadataArg,
          ...nowArg,
          ...minCollectionHoursArg,
          ...(args.cleanArtifactRoot === undefined ? {} : { artifactRoot: args.cleanArtifactRoot }),
          ...(args.cleanExportRoot === undefined ? {} : { exportRoot: args.cleanExportRoot }),
          allowInsufficientGtfsRt: true,
        });

  const publicStructural = await checkPipelineV1({
    year: publicYear,
    month: publicMonth,
    ...dbArg,
    ...sourceMetadataArg,
    ...nowArg,
    ...minCollectionHoursArg,
    ...artifactRootArg,
    ...exportRootArg,
    allowInsufficientGtfsRt: true,
  });
  const publicStrict = await checkPipelineV1({
    year: publicYear,
    month: publicMonth,
    ...dbArg,
    ...sourceMetadataArg,
    ...nowArg,
    ...minCollectionHoursArg,
    ...artifactRootArg,
    ...exportRootArg,
  });
  const [realtimePreflight, publicCoverage, realtimeCoverage, busLaneSourceGaps] =
    await Promise.all([
    preflightGtfsRt({
      year: realtimeYear,
      month: realtimeMonth,
      ...runArg,
      ...dbArg,
      ...minCollectionHoursArg,
    }),
    coverageSummary(dbPath ?? "", publicIsoMonth),
    coverageSummary(dbPath ?? "", realtimeIsoMonth),
    busLaneSourceGapDiagnostics(dbPath ?? "", publicIsoMonth),
  ]);

  const monthSplit = publicIsoMonth !== realtimeIsoMonth;
  const realtimeHasSpeedCoverage = realtimeCoverage.speedRoutes > 0;
  const cleanRebuildEvidence =
    cleanRebuild === null
      ? ""
      : ` Clean rebuild check is ${cleanRebuild.status}; built routes ${cleanRebuild.counts.builtRouteCount}/${cleanRebuild.counts.buildEligibleRouteCount}.`;
  const cleanRebuildIssues =
    cleanRebuild === null
      ? ["Clean rebuild from an empty local DB still needs to be run and recorded."]
      : cleanRebuild.issues.map((issue) => issue.code);
  const reproduciblePipelineStatus =
    publicStructural.status !== "pass"
      ? "blocked"
      : cleanRebuild?.status === "pass"
        ? "pass"
        : "partial";
  const checklist: PipelineV1AuditChecklistItem[] = [
    {
      requirement: "Reproducible full-network public-source pipeline",
      status: reproduciblePipelineStatus,
      evidence: `${publicIsoMonth} structural check is ${publicStructural.status}; built routes ${publicStructural.counts.builtRouteCount}/${publicStructural.counts.buildEligibleRouteCount}.${cleanRebuildEvidence}`,
      missing:
        publicStructural.status === "pass"
          ? cleanRebuild?.status === "pass"
            ? []
            : cleanRebuildIssues
          : publicStructural.issues.map((issue) => issue.code),
    },
    {
      requirement: "GTFS-RT observed reliability and bunching",
      status: realtimePreflight.status === "pass" ? (monthSplit ? "partial" : "pass") : "blocked",
      evidence: `${realtimeIsoMonth} GTFS-RT preflight is ${realtimePreflight.status}; observed routes ${realtimePreflight.counts.routeObservedReliabilityObservedRows}, headway samples ${realtimePreflight.counts.observedHeadwaySampleRows}.`,
      missing:
        realtimePreflight.status === "pass"
          ? monthSplit
            ? [
                `Observed layer is for ${realtimeIsoMonth}, not public-source month ${publicIsoMonth}.`,
              ]
            : []
          : realtimePreflight.issues.map((issue) => issue.code),
    },
    {
      requirement: "Before/after intervention evaluation",
      status:
        publicStructural.counts.peerAdjustedInterventionComparisonRows > 0 ? "partial" : "blocked",
      evidence: `${publicIsoMonth} has ${publicStructural.counts.routeInterventionComparisonRows} intervention comparisons, ${publicStructural.counts.evaluatedInterventionComparisonRows} evaluated rows, ${publicStructural.counts.peerAdjustedInterventionComparisonRows} peer-adjusted rows, ${publicStructural.counts.busLaneDatedInterventionComparisonRows} dated bus-lane comparison rows, and ${publicStructural.counts.busLaneSourceGapComparisonRows} bus-lane source-gap rows. Bus-lane source-date diagnostics: ${busLaneSourceGaps.missingOpenDateLaneInstanceCount}/${busLaneSourceGaps.matchedLaneInstanceCount} matched lane instances lack parseable source dates, including ${busLaneSourceGaps.blankOpenDateLaneInstanceCount} blank source open_date values and ${busLaneSourceGaps.unparsableOpenDateLaneInstanceCount} unparsable nonblank values across ${busLaneSourceGaps.routesWithMissingOpenDateCount} public route(s).`,
      missing: [
        ...(publicStructural.counts.busLaneDatedInterventionComparisonRows > 0
          ? []
          : ["Dated bus-lane before/after evaluation remains open."]),
        ...(publicStructural.counts.busLaneSourceGapComparisonRows > 0
          ? ["Some matched bus-lane segments still lack parseable implementation dates."]
          : []),
        "External transit-domain methodology review remains open.",
      ],
    },
    {
      requirement: "Corridor grouping and corridor briefs",
      status:
        publicStructural.counts.corridorRows > 0 &&
        publicStructural.counts.corridorShapeReviewRouteRows > 0 &&
        publicStructural.counts.corridorShapeReviewIncompleteRows === 0
          ? "pass"
          : publicStructural.counts.corridorRows > 0
            ? "partial"
            : "blocked",
      evidence: `${publicIsoMonth} has ${publicStructural.counts.corridorRows} corridors, ${publicStructural.counts.corridorRouteMemberRows} route memberships, ${publicStructural.counts.corridorSegmentEvidenceRouteMemberRows} segment-backed memberships, ${publicStructural.counts.corridorShapeReviewPassRows} shape-reviewed pass rows, ${publicStructural.counts.corridorInterventionContextRows} intervention context rows, and ${publicStructural.counts.corridorArtifactRows} corridor artifacts.`,
      missing:
        publicStructural.counts.corridorShapeReviewRouteRows > 0 &&
        publicStructural.counts.corridorShapeReviewIncompleteRows === 0
          ? []
          : ["Shape-based corridor membership review remains open."],
    },
    {
      requirement: "Full route/corridor brief artifact set",
      status: publicStructural.audit.status === "pass" ? "pass" : "blocked",
      evidence: `${publicIsoMonth} route-batch audit is ${publicStructural.audit.status}; ${publicStructural.audit.artifactCount} artifacts, missing ${publicStructural.audit.missingArtifactCount}, hash mismatches ${publicStructural.audit.hashMismatchCount}.`,
      missing:
        publicStructural.audit.status === "pass"
          ? []
          : ["Route/corridor artifact audit is failing."],
    },
    {
      requirement: "Verified D1/static export contracts",
      status:
        publicStructural.d1?.status === "pass" &&
        publicStructural.audit.status === "pass" &&
        publicStructural.counts.evaluationArtifactIssueRows === 0 &&
        publicStructural.counts.mapArtifactIssueRows === 0
          ? "pass"
          : "blocked",
      evidence: `${publicIsoMonth} D1 status is ${publicStructural.d1?.status ?? "missing"}; route artifacts ${publicStructural.d1?.routeArtifactRows ?? 0}, corridor artifacts ${publicStructural.d1?.corridorArtifactRows ?? 0}, evaluation artifact rows ${publicStructural.counts.evaluationArtifactRows}, evaluation artifact issues ${publicStructural.counts.evaluationArtifactIssueRows}, map artifact features ${publicStructural.counts.mapArtifactRows}, map route-segment artifacts ${publicStructural.counts.mapRouteSegmentArtifactRows}, map artifact issues ${publicStructural.counts.mapArtifactIssueRows}.`,
      missing:
        publicStructural.d1?.status === "pass" &&
        publicStructural.audit.status === "pass" &&
        publicStructural.counts.evaluationArtifactIssueRows === 0 &&
        publicStructural.counts.mapArtifactIssueRows === 0
          ? []
          : [
              "D1 verification, brief artifact audit, evaluation artifact manifest, or map artifact manifest is failing.",
            ],
    },
    {
      requirement: "Strict single-month v1 QA gate",
      status: publicStrict.status === "pass" ? "pass" : "blocked",
      evidence: `${publicIsoMonth} strict check is ${publicStrict.status}.`,
      missing: publicStrict.issues.map((issue) => issue.code),
    },
    {
      requirement: "Single-month source availability",
      status: !monthSplit && realtimeHasSpeedCoverage ? "pass" : "blocked",
      evidence: `${publicIsoMonth} speed routes: ${publicCoverage.speedRoutes}; ${realtimeIsoMonth} speed routes: ${realtimeCoverage.speedRoutes}; realtime month is ${realtimeIsoMonth}.`,
      missing:
        monthSplit || !realtimeHasSpeedCoverage
          ? [
              "The currently complete public-source month and passing realtime observed month do not align.",
            ]
          : [],
    },
  ];
  const status = statusFromItems(checklist);
  const recommendation =
    status === "pass"
      ? "Data Pipeline v1 passes as a single-month release candidate."
      : "Treat the current state as March structural evidence plus a May observed-reliability appendix, or wait for public speed coverage in a later realtime month before calling strict v1 complete.";
  const result: PipelineV1AuditResult = {
    status,
    generatedAt: new Date().toISOString(),
    publicMonth: publicIsoMonth,
    realtimeMonth: realtimeIsoMonth,
    runId: args.runId ?? null,
    outputPath,
    checklist,
    coverage: {
      publicMonth: publicCoverage,
      realtimeMonth: realtimeCoverage,
    },
    interventions: {
      busLaneSourceGaps,
    },
    gates: {
      publicStructuralStatus: publicStructural.status,
      publicStrictStatus: publicStrict.status,
      realtimePreflightStatus: realtimePreflight.status,
      cleanRebuildStatus: cleanRebuild?.status ?? null,
      publicStrictIssues: publicStrict.issues.map((issue) => issue.code),
      realtimePreflightIssues: realtimePreflight.issues.map((issue) => issue.code),
      cleanRebuildIssues: cleanRebuild?.issues.map((issue) => issue.code) ?? [],
    },
    recommendation,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, result);

  return result;
}

export async function auditPipelineV1FromCli(args: string[]): Promise<PipelineV1AuditResult> {
  const parsed = parseArgs(args);
  const auditArgs: PipelineV1AuditArgs = {
    publicYear: parsed.publicYear,
    publicMonth: parsed.publicMonth,
    realtimeYear: parsed.realtimeYear,
    realtimeMonth: parsed.realtimeMonth,
    output: parsed.output,
  };
  if (parsed.runId.length > 0) {
    auditArgs.runId = parsed.runId;
  }
  if (parsed.dbPath.length > 0) {
    auditArgs.dbPath = parsed.dbPath;
  }
  if (parsed.cleanDbPath.length > 0) {
    auditArgs.cleanDbPath = parsed.cleanDbPath;
  }
  if (parsed.cleanArtifactRoot.length > 0) {
    auditArgs.cleanArtifactRoot = parsed.cleanArtifactRoot;
  }
  if (parsed.cleanExportRoot.length > 0) {
    auditArgs.cleanExportRoot = parsed.cleanExportRoot;
  }
  if (parsed.sourceMetadataDir.length > 0) {
    auditArgs.sourceMetadataDir = parsed.sourceMetadataDir;
  }
  if (parsed.now.getTime() > 0) {
    auditArgs.now = parsed.now;
  }
  if (parsed.minGtfsRtCollectionHours > 0) {
    auditArgs.minGtfsRtCollectionHours = parsed.minGtfsRtCollectionHours;
  }
  if (parsed.artifactRoot.length > 0) {
    auditArgs.artifactRoot = parsed.artifactRoot;
  }
  if (parsed.exportRoot.length > 0) {
    auditArgs.exportRoot = parsed.exportRoot;
  }

  return auditPipelineV1(auditArgs);
}
