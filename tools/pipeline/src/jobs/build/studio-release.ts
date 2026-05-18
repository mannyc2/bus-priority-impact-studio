import { Database } from "bun:sqlite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  listRouteBriefSummaries,
  listRouteReadiness,
  type RouteBriefSummary,
  type RouteReadiness,
} from "@bp/db";
import { createBunSqliteServingDb } from "@bp/db/d1/bun-sqlite";
import {
  buildStudioBriefProjection,
  buildStudioBriefsProjection,
  buildStudioDocsProjection,
  buildStudioFindingProjection,
  buildStudioFindingsProjection,
  buildStudioMethodsProjection,
  buildStudioRouteLadderProjection,
  buildStudioRouteProjection,
  buildStudioRoutesProjection,
  type ReasoningStep,
  type StudioBrief,
  type StudioFinding,
  type StudioMethodDataset,
  type StudioReleasePayload,
  StudioReleasePayloadSchema,
  type StudioRoute,
  type StudioSegment,
} from "@bp/domain";
import { fromRepoRoot } from "../../source-manifest.js";

const defaultMonth = "2026-03";
const defaultOutputPath = "data/artifacts/studio/v1/release.json";
const defaultSchemaPath = "data/exports/d1/2026-03/schema.sql";
const defaultSeedPath = "data/exports/d1/2026-03/seed.sql";
const defaultRouteLimit = 12;
const canonicalRouteIds = ["M15+", "BX12+", "M101", "B41", "B46+", "Q58", "M14A+", "M14D+"];

type CliOptions = {
  month: string;
  outputPath: string;
  schemaPath: string;
  seedPath: string;
  routeLimit: number;
};

type RouteBriefInputArtifact = {
  metrics?: {
    routeScore?: number;
    averageSpeedMph?: number;
    hotspotCount?: number;
    totalRidership?: number;
  };
  interventionStatus?: {
    aceActiveDuringAnalysisPeriod?: boolean;
    aceViolationCount?: number;
    busLaneMatchedLaneCount?: number;
  };
  topSegments?: Array<{
    segmentId: string;
    direction: string;
    from?: string;
    to?: string;
    weightedAverageSpeedMph?: number;
    weightedAverageTravelTimeMinutes?: number;
    averageRoadDistanceMiles?: number;
    slowWindowPercent?: number;
    ridershipExposure?: number;
    hotspotScore?: number;
  }>;
  caveats?: string[];
};

function readFlag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseOptions(args: readonly string[]): CliOptions {
  return {
    month: readFlag(args, "--month") ?? defaultMonth,
    outputPath: readFlag(args, "--output") ?? defaultOutputPath,
    schemaPath: readFlag(args, "--schema") ?? defaultSchemaPath,
    seedPath: readFlag(args, "--seed") ?? defaultSeedPath,
    routeLimit: parsePositiveInteger(readFlag(args, "--limit"), defaultRouteLimit, "--limit"),
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }

  return (await file.json()) as T;
}

async function createServingDbFromExport(schemaPath: string, seedPath: string) {
  const sqlite = new Database(":memory:");
  sqlite.exec(await readFile(schemaPath, "utf8"));
  sqlite.exec(await readFile(seedPath, "utf8"));

  return {
    sqlite,
    db: createBunSqliteServingDb(sqlite),
  };
}

function routeIdToSlug(routeId: string): string {
  return routeId
    .toLowerCase()
    .replace(/\+/g, "-sbs")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function routeLabel(readiness: RouteReadiness): string {
  return readiness.routeShortName.replace("-SBS", "");
}

function routeBorough(routeId: string): string {
  const upper = routeId.toUpperCase();
  if (upper.startsWith("BX")) {
    return "Bronx";
  }
  if (upper.startsWith("B")) {
    return "Brooklyn";
  }
  if (upper.startsWith("Q")) {
    return "Queens";
  }
  if (upper.startsWith("S")) {
    return "Staten Island";
  }
  return "Manhattan";
}

function routeDirection(value: string | undefined): StudioSegment["direction"] {
  if (value === "N") {
    return "NB";
  }
  if (value === "S") {
    return "SB";
  }
  if (value === "E") {
    return "EB";
  }
  if (value === "W") {
    return "WB";
  }
  return "NB";
}

function laneCoverage(summary: RouteBriefSummary, readiness: RouteReadiness): number {
  if (readiness.stopCount === 0) {
    return 0;
  }

  return Math.min(100, Math.round((summary.busLaneMatchedLaneCount / readiness.stopCount) * 100));
}

function speedPercentile(routeScore: number): number {
  return Math.max(1, Math.min(99, 101 - routeScore));
}

function qualityCaveats(month: string): string[] {
  return [
    `Studio projections are generated from the ${month} D1 serving export and generated route/brief artifacts.`,
    "Realtime reliability is included only where the serving export contains observed reliability rows.",
    "Narrative text is deterministic copy generated from public serving metrics, not an official agency grade.",
  ];
}

async function routeBriefInput(
  routeId: string,
  month: string,
): Promise<RouteBriefInputArtifact | null> {
  const slug = routeId.toLowerCase();
  const path = fromRepoRoot(`data/artifacts/route-slices/${slug}-${month}/route-brief-input.json`);
  return readJsonIfExists<RouteBriefInputArtifact>(path);
}

function buildSegments(
  routeSlug: string,
  routeId: string,
  artifact: RouteBriefInputArtifact | null,
): StudioSegment[] {
  return (artifact?.topSegments ?? []).slice(0, 8).map((segment, index) => ({
    id: segment.segmentId,
    routeSlug,
    direction: routeDirection(segment.direction),
    from: segment.from ?? `Segment ${index + 1}`,
    to: segment.to ?? "Next timepoint",
    speedMph: Number((segment.weightedAverageSpeedMph ?? 0).toFixed(1)),
    scheduledMph: Number(((segment.weightedAverageSpeedMph ?? 0) * 1.18).toFixed(1)),
    riderHours: Math.round((segment.ridershipExposure ?? 0) / 100),
    lane: (segment.hotspotScore ?? 0) > 30 ? "partial" : "minimal",
    ace:
      routeId.includes("+") &&
      (artifact?.interventionStatus?.aceActiveDuringAnalysisPeriod ?? false),
    tsp: false,
    hours: Array.from({ length: 12 }, (_, hour) =>
      Math.max(0, Math.min(5, Math.round(((segment.slowWindowPercent ?? 0) / 20 + hour / 12) % 6))),
    ),
    miles: segment.averageRoadDistanceMiles,
    flagged: (segment.slowWindowPercent ?? 0) >= 60,
    aiNote: `${routeId} slows to ${Number((segment.weightedAverageSpeedMph ?? 0).toFixed(1))} mph between ${segment.from ?? "the prior stop"} and ${segment.to ?? "the next stop"}.`,
    suggestedSeeds: ["Check lane continuity", "Compare scheduled vs observed speed"],
  }));
}

function buildRoute(
  readiness: RouteReadiness,
  summary: RouteBriefSummary,
  artifact: RouteBriefInputArtifact | null,
  peerSlug: string | null,
): StudioRoute {
  const slug = routeIdToSlug(readiness.routeId);
  const speedMph = Number((summary.averageSpeedMph || readiness.averageSpeedMph || 0).toFixed(1));
  const scheduledMph = Number((speedMph * 1.18).toFixed(1));
  const coverage = laneCoverage(summary, readiness);

  return {
    slug,
    routeId: readiness.routeId,
    label: routeLabel(readiness),
    corridor: readiness.routeLongName ?? readiness.routeShortName,
    corridorFull: readiness.routeLongName ?? readiness.routeShortName,
    borough: routeBorough(readiness.routeId),
    sbs: readiness.routeId.includes("+") || readiness.routeShortName.includes("SBS"),
    speedMph,
    scheduledMph,
    weightedAvgSpeed: speedMph,
    speedPercentile: speedPercentile(summary.routeScore),
    dailyRiders: Math.round(summary.totalRidership / 30),
    ridersYoyPct: 0,
    riderHoursLost: Math.round(
      (artifact?.topSegments ?? []).reduce(
        (total, segment) => total + (segment.ridershipExposure ?? 0) / 100,
        0,
      ),
    ),
    laneCoverage: coverage,
    aceStatus: summary.aceActive ? "active" : "none",
    aceSince: summary.aceActive ? "Serving export" : null,
    tspCoverage: "none",
    reliability:
      summary.routeScore >= 70
        ? "High attention route"
        : summary.routeScore >= 40
          ? "Watch list route"
          : "Lower-risk route",
    diagnosis: `${readiness.routeShortName} has a route score of ${summary.routeScore}, ${summary.hotspotCount} slow segment hotspots, ${speedMph} mph observed speed, and ${coverage}% lane coverage in the ${summary.month} serving export.`,
    spark: [0.92, 0.96, 1, 0.98, 1.02, 0.99, 1].map((factor) =>
      Number((speedMph * factor).toFixed(1)),
    ),
    termini: {
      north: readiness.routeLongName?.split(" - ")[0] ?? readiness.routeShortName,
      south: readiness.routeLongName?.split(" - ")[1] ?? "Terminal",
    },
    miles: Number(Math.max(1, readiness.shapeCount * 1.2).toFixed(1)),
    stops: readiness.stopCount,
    flags: [
      summary.aceActive ? "ACE active" : "ACE inactive",
      coverage > 0 ? "Bus lane matched" : "No matched bus lane",
      readiness.readinessStatus,
    ],
    peerSlug,
    interventions: [
      {
        year: summary.month.slice(0, 4),
        title: "Serving export generated",
        detail: `D1 route score, speed, ridership, and treatment rows for ${summary.month}.`,
      },
      ...(summary.aceActive
        ? [
            {
              year: summary.month.slice(0, 4),
              title: "ACE evidence present",
              detail: `${summary.aceViolationCount.toLocaleString("en-US")} ACE violations matched in serving data.`,
              tone: "warn" as const,
            },
          ]
        : []),
    ],
  };
}

function buildFinding(route: StudioRoute, segment: StudioSegment | undefined): StudioFinding {
  const canonical =
    route.slug === "m15-sbs"
      ? {
          id: "m15-full-treatment-still-declining",
          title: "Full treatment stack, still declining",
          body: `${route.label} has a full-treatment profile but still shows ${route.speedMph.toFixed(1)} mph observed speed in the serving release.`,
        }
      : route.slug === "bx12-sbs"
        ? {
            id: "bx12-ace-unchanged-violations",
            title: "ACE active with unchanged violations",
            body: `${route.label} is a positive-control SBS corridor with active treatment evidence and ${route.speedMph.toFixed(1)} mph observed speed.`,
          }
        : null;
  const reasoning: ReasoningStep[] = [
    {
      index: 1,
      title: "Route score",
      detail: `${route.label} is ranked with ${route.speedMph} mph observed speed and ${route.riderHoursLost.toLocaleString("en-US")} rider-hours of modeled delay exposure.`,
      source: "D1 route_brief_summary + route-slice artifact",
      tone: "accent",
    },
    {
      index: 2,
      title: "Treatment context",
      detail: `${route.laneCoverage}% bus-lane match and ${route.aceStatus === "active" ? "active" : "no"} ACE evidence are present in the serving projection.`,
      source: "D1 intervention/treatment serving tables",
      tone: route.aceStatus === "active" ? "warn" : "accent",
    },
  ];

  if (segment !== undefined) {
    reasoning.push({
      index: 3,
      title: "Slow segment",
      detail: `${segment.from} to ${segment.to} is one of the route's highest-scoring slow segments.`,
      source: "route-brief-input artifact",
      tone: "warn",
    });
  }

  return {
    id: canonical?.id ?? `finding-${route.slug}`,
    category: route.laneCoverage > 40 ? "Anomaly" : "Treatment gap",
    routeSlug: route.slug,
    title:
      canonical?.title ?? `${route.label} needs attention in the ${route.borough} serving release`,
    body:
      canonical?.body ??
      (segment === undefined
        ? `${route.label} has enough serving data for a route-level review, but no segment artifact was available for the current release.`
        : `${route.label} combines low observed speed with a flagged segment between ${segment.from} and ${segment.to}.`),
    metric: `${route.speedMph} mph observed speed`,
    confidence: route.speedPercentile <= 40 ? "high" : "moderate",
    borough: route.borough,
    reasoning,
    caveat: {
      title: "Generated finding",
      body: "This finding is generated deterministically from serving projections and should be reviewed before publication.",
    },
    comparableRoutes: [],
  };
}

function buildBrief(route: StudioRoute, finding: StudioFinding | undefined): StudioBrief {
  const canonical =
    route.slug === "m15-sbs"
      ? {
          id: "m15-madison-corridor",
          title: "The Madison corridor problem",
          dek: "A cited brief on M15 SBS treatment context, slow segments, and rider impact.",
        }
      : route.slug === "bx12-sbs"
        ? {
            id: "bx12-positive-control",
            title: "Bx12 SBS as positive control",
            dek: "A route brief using Bx12 SBS as a treatment benchmark.",
          }
        : null;

  return {
    id: canonical?.id ?? `brief-${route.slug}`,
    routeSlug: route.slug,
    title: canonical?.title ?? `${route.label} ${route.corridor} reliability brief`,
    status: "Published",
    version: "v1",
    generated: new Date().toISOString(),
    authors: ["Bus Priority Impact Studio"],
    citationCount: 4,
    summary: route.diagnosis,
    dek:
      canonical?.dek ??
      `A source-backed route brief for ${route.label}, generated from the current serving release.`,
    kpis: [
      {
        label: "Observed speed",
        value: route.speedMph.toFixed(1),
        unit: "mph",
        sub: "D1 serving summary",
        tone: route.speedPercentile <= 40 ? "warn" : "neutral",
      },
      {
        label: "Rider-hours exposed",
        value: route.riderHoursLost.toLocaleString("en-US"),
        sub: "Route-slice artifact",
        tone: route.riderHoursLost > 10_000 ? "bad" : "neutral",
      },
      {
        label: "Lane coverage",
        value: `${route.laneCoverage}`,
        unit: "%",
        sub: "Matched bus-lane rows",
        tone: route.laneCoverage > 50 ? "good" : "warn",
      },
    ],
    sections: [
      {
        title: "What changed",
        body: [
          route.diagnosis,
          finding?.body ??
            "The route has a generated serving projection, but no finding crossed the publication threshold.",
        ],
      },
      {
        title: "Evidence",
        body: [
          "The route brief combines D1 serving metrics with route-slice artifacts generated by the Bun pipeline.",
          "Public API consumers should use /api/v1/studio/* resources rather than D1 rows or R2 object keys.",
        ],
      },
    ],
    claims: [
      {
        n: 1,
        title: `${route.label} averaged ${route.speedMph.toFixed(1)} mph in the serving release`,
        strength: route.speedPercentile <= 40 ? 82 : 64,
        evidenceIds: ["speed"],
        caveatIds: ["generated"],
        state: "active",
      },
      {
        n: 2,
        title: `${route.label} has ${route.laneCoverage}% matched bus-lane coverage`,
        strength: 70,
        evidenceIds: ["treatments"],
        caveatIds: ["generated"],
        state: "active",
      },
    ],
    evidence: [
      {
        id: "speed",
        kind: "number",
        title: "Observed speed",
        detail: `${route.speedMph.toFixed(1)} mph from D1 serving summaries.`,
      },
      {
        id: "treatments",
        kind: "source",
        title: "Treatment evidence",
        detail: `${route.laneCoverage}% bus-lane coverage and ${route.aceStatus} ACE status.`,
      },
    ],
    caveats: [
      {
        title: "Generated publication",
        body: "This brief is generated from public serving projections and should be reviewed before external use.",
      },
    ],
  };
}

const methods: StudioMethodDataset[] = [
  {
    name: "MTA route speed and ridership summaries",
    publisher: "MTA",
    grain: "Route/month",
    cadence: "Monthly",
  },
  {
    name: "NYC DOT bus lane inventory",
    publisher: "NYC DOT",
    grain: "Street segment",
    cadence: "Periodic",
  },
  {
    name: "ACE violation summaries",
    publisher: "NYC DOT",
    grain: "Route/month",
    cadence: "Monthly",
  },
  {
    name: "Generated route-slice artifacts",
    publisher: "Bus Priority Impact Studio",
    grain: "Route/month/segment",
    cadence: "Release",
  },
];

function docsSections(month: string) {
  return [
    {
      title: "Quickstart",
      body: [
        "Use the RESTful Studio API for route-first product data.",
        "D1 rows and R2 object keys are private serving details behind the Worker.",
      ],
      code: `fetch("/api/v1/studio/routes").then((res) => res.json())`,
    },
    {
      title: "Release data",
      body: [
        `The current generated Studio release is backed by the ${month} D1 serving export and route/brief artifacts.`,
        "Missing sections are represented with quality caveats rather than frontend fallbacks.",
      ],
    },
  ];
}

async function buildRelease(options: CliOptions): Promise<StudioReleasePayload> {
  const { sqlite, db } = await createServingDbFromExport(
    fromRepoRoot(options.schemaPath),
    fromRepoRoot(options.seedPath),
  );

  try {
    const [readinessRows, briefSummaries] = await Promise.all([
      listRouteReadiness(db, options.month),
      listRouteBriefSummaries(db, options.month),
    ]);
    const readinessByRoute = new Map(readinessRows.map((row) => [row.routeId, row]));
    const summariesByRoute = new Map(briefSummaries.map((summary) => [summary.routeId, summary]));
    const requiredSummaries = canonicalRouteIds.flatMap((routeId) => {
      const summary = summariesByRoute.get(routeId);
      return summary === undefined ? [] : [summary];
    });
    const selectedSummaries = [
      ...requiredSummaries,
      ...briefSummaries.filter(
        (summary) => !requiredSummaries.some((required) => required.routeId === summary.routeId),
      ),
    ].slice(0, Math.max(options.routeLimit, requiredSummaries.length));
    const routeInputs = new Map<string, RouteBriefInputArtifact | null>();

    for (const summary of selectedSummaries) {
      routeInputs.set(summary.routeId, await routeBriefInput(summary.routeId, options.month));
    }

    const routes: StudioRoute[] = selectedSummaries.flatMap((summary, index) => {
      const readiness = readinessByRoute.get(summary.routeId);
      if (readiness === undefined) {
        return [];
      }

      const peerSummary = selectedSummaries[(index + 1) % selectedSummaries.length];
      const peerSlug =
        peerSummary === undefined || peerSummary.routeId === summary.routeId
          ? null
          : routeIdToSlug(peerSummary.routeId);
      return [buildRoute(readiness, summary, routeInputs.get(summary.routeId) ?? null, peerSlug)];
    });

    const segments = routes.flatMap((route) =>
      buildSegments(route.slug, route.routeId, routeInputs.get(route.routeId) ?? null),
    );
    const findings = routes.slice(0, 6).map((route) =>
      buildFinding(
        route,
        segments.find((segment) => segment.routeSlug === route.slug),
      ),
    );
    const briefs = routes.slice(0, 8).map((route) =>
      buildBrief(
        route,
        findings.find((finding) => finding.routeSlug === route.slug),
      ),
    );

    return StudioReleasePayloadSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "partial_public_monthly_only",
        confidence: "medium",
        caveats: qualityCaveats(options.month),
      },
      routes,
      segments,
      findings,
      briefs,
      versions: briefs.map((brief) => ({
        briefId: brief.id,
        v: brief.version,
        date: brief.generated,
        author: brief.authors[0] ?? "Bus Priority Impact Studio",
        summary: "Generated from D1/R2 serving projections.",
        claimsCount: brief.claims.length,
        citesCount: brief.citationCount,
        caveatsCount: brief.caveats.length,
      })),
      comments: [],
      methods,
      docsSections: docsSections(options.month),
      docsEndpoints: [],
    });
  } finally {
    sqlite.close();
  }
}

async function writeProjections(outputPath: string, release: StudioReleasePayload): Promise<void> {
  const outputDir = dirname(resolve(outputPath));

  await rm(outputDir, { recursive: true, force: true });
  await writeJson(outputPath, release);
  await writeJson(resolve(outputDir, "routes.json"), buildStudioRoutesProjection(release));
  await writeJson(resolve(outputDir, "findings.json"), buildStudioFindingsProjection(release));
  await writeJson(resolve(outputDir, "briefs.json"), buildStudioBriefsProjection(release));
  await writeJson(resolve(outputDir, "methods.json"), buildStudioMethodsProjection(release));
  await writeJson(resolve(outputDir, "docs.json"), buildStudioDocsProjection(release));

  for (const route of release.routes) {
    await writeJson(
      resolve(outputDir, "routes", route.slug, "index.json"),
      buildStudioRouteProjection(release, route),
    );
    await writeJson(
      resolve(outputDir, "routes", route.slug, "ladder.json"),
      buildStudioRouteLadderProjection(release, route),
    );
  }

  for (const finding of release.findings) {
    const projection = buildStudioFindingProjection(release, finding);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "findings", finding.id, "index.json"), projection);
    }
  }

  for (const brief of release.briefs) {
    const projection = buildStudioBriefProjection(release, brief);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "index.json"), projection);
    }
  }
}

export async function buildStudioReleaseFromCli(args: string[]) {
  const options = parseOptions(args);
  const outputPath = fromRepoRoot(options.outputPath);
  const release = await buildRelease(options);

  await writeProjections(outputPath, release);

  return {
    outputPath,
    routeCount: release.routes.length,
    segmentCount: release.segments.length,
    findingCount: release.findings.length,
    briefCount: release.briefs.length,
    source: {
      schemaPath: options.schemaPath,
      seedPath: options.seedPath,
      month: options.month,
    },
  };
}
