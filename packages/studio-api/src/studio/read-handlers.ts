import {
  createD1ServingDb,
  type RouteBriefSummary as D1RouteBriefSummary,
  type RouteObservedReliabilitySummary as D1RouteObservedReliabilitySummary,
  type RouteReadiness as D1RouteReadiness,
  listRouteBriefSummaries,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
} from "@bp/db/d1";
import {
  buildStudioCompareProjection,
  getStudioRoute,
  StudioBriefEvidenceResponseSchema,
  StudioBriefHistoryResponseSchema,
  type StudioBriefResponse,
  StudioBriefsResponseSchema,
  StudioCompareResponseSchema,
  StudioDocsResponseSchema,
  StudioFindingResponseSchema,
  StudioFindingsResponseSchema,
  StudioMethodsResponseSchema,
  type StudioObservedReliability,
  type StudioReleasePayload,
  type StudioRoute,
  StudioRouteDetailResponseSchema,
  StudioRouteLadderResponseSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
  StudioSearchResponseSchema,
  type StudioSnapshotProjection,
  StudioSnapshotResponseSchema,
} from "@bp/domain";
import type { StudioApiEnv } from "../env.js";
import { errorResponse } from "../http/errors.js";
import {
  loadStudioBriefProjection,
  loadStudioProjection,
  studioJsonResponse,
  studioProjectionKey,
  studioProjectionPrefix,
  studioReleaseKey,
} from "./projections.js";

export type StudioReadEnv = Pick<
  StudioApiEnv,
  "ARTIFACTS" | "BASELINE_MONTH" | "DB" | "LAST_BUILT_SPEED_MONTH" | "STUDIO_RELEASE_KEY"
>;

export type StudioReadHooks<TEnv extends StudioReadEnv = StudioReadEnv> = {
  loadDraftOnlyBriefProjection?: (
    request: Request,
    env: TEnv,
    briefId: string,
  ) => Promise<StudioBriefResponse | Response | null>;
  overlayStudioBriefDraft?: (
    request: Request,
    env: TEnv,
    projection: StudioBriefResponse,
  ) => Promise<StudioBriefResponse>;
};

type BuildStudioRoutesResponseResult =
  | {
      ok: true;
      routes: StudioRoute[];
      generatedAt: string;
      quality: StudioRoutesResponse["quality"];
      releaseLayer: string;
    }
  | { ok: false; response: Response };

function realtimeSourceForRunId(
  runId: string | null,
): "official_self_collected" | "third_party_recovered" | "none" {
  if (runId === null) {
    return "none";
  }

  return runId.startsWith("bus-observatory-") ? "third_party_recovered" : "official_self_collected";
}

function routeIdToStudioSlug(routeId: string): string {
  return routeId
    .toLowerCase()
    .replace(/\+/g, "-sbs")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function boroughForRouteId(routeId: string): string {
  const upper = routeId.toUpperCase();
  if (upper.startsWith("BX")) return "Bronx";
  if (upper.startsWith("B")) return "Brooklyn";
  if (upper.startsWith("Q")) return "Queens";
  if (upper.startsWith("S")) return "Staten Island";
  return "Manhattan";
}

function buildObservedReliabilityFromD1(
  row: D1RouteObservedReliabilitySummary | undefined,
): StudioObservedReliability | null {
  if (row === undefined) return null;
  const source = realtimeSourceForRunId(row.runId);
  if (source === "none") return null;
  const caveats =
    source === "third_party_recovered"
      ? [
          "Observed reliability is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Monthly public speed evidence remains official MTA Open Data; realtime evidence has separate provenance.",
        ]
      : ["Observed reliability comes from self-collected MTA Bus Time GTFS-RT snapshots."];
  if (row.reliabilityStatus === "insufficient_gtfs_rt_samples") {
    caveats.push(
      `Sample count (${row.sampleCount}) is below the minimum threshold (${row.minSampleThreshold}); headway statistics are not reported.`,
    );
  }
  return {
    month: row.month,
    runId: row.runId,
    source,
    releaseLayer: "observed_release",
    reliabilityStatus: row.reliabilityStatus,
    sampleCount: row.sampleCount,
    medianObservedHeadwayMinutes: row.medianObservedHeadwayMinutes,
    p90ObservedHeadwayMinutes: row.p90ObservedHeadwayMinutes,
    observedBunchingShare: row.observedBunchingShare,
    observedLongGapShare: row.observedLongGapShare,
    excessWaitMinutes: row.excessWaitMinutes,
    caveats,
  };
}

function buildStudioRouteCardFromD1(
  readiness: D1RouteReadiness,
  summary: D1RouteBriefSummary,
  observed: D1RouteObservedReliabilitySummary | undefined,
): StudioRoute {
  const slug = routeIdToStudioSlug(readiness.routeId);
  const speedMph = Number((summary.averageSpeedMph || readiness.averageSpeedMph || 0).toFixed(1));
  const scheduledMph = Number((speedMph * 1.18).toFixed(1));
  const coverage =
    readiness.stopCount === 0
      ? 0
      : Math.min(100, Math.round((summary.busLaneMatchedLaneCount / readiness.stopCount) * 100));
  const reliabilityLabel =
    summary.routeScore >= 70
      ? "High attention route"
      : summary.routeScore >= 40
        ? "Watch list route"
        : "Lower-risk route";
  return {
    slug,
    routeId: readiness.routeId,
    label: readiness.routeShortName.replace("-SBS", ""),
    corridor: readiness.routeLongName ?? readiness.routeShortName,
    corridorFull: readiness.routeLongName ?? readiness.routeShortName,
    borough: boroughForRouteId(readiness.routeId),
    sbs: readiness.routeId.includes("+") || readiness.routeShortName.includes("SBS"),
    speedMph,
    scheduledMph,
    weightedAvgSpeed: speedMph,
    speedPercentile: Math.max(1, Math.min(99, 101 - summary.routeScore)),
    dailyRiders: Math.round(summary.totalRidership / 30),
    ridersYoyPct: 0,
    riderHoursLost: 0,
    laneCoverage: coverage,
    aceStatus: summary.aceActive ? "active" : "none",
    aceSince: summary.aceActive ? "Serving export" : null,
    tspCoverage: "none",
    reliability: reliabilityLabel,
    observedReliability: buildObservedReliabilityFromD1(observed),
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
    peerSlug: null,
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

async function listStudioRouteCardsFromD1(
  env: Pick<StudioReadEnv, "DB">,
  month: string,
  limit?: number,
): Promise<StudioRoute[]> {
  if (env.DB === undefined) return [];
  const db = createD1ServingDb(env.DB);
  const [readinessRows, summaries, observed] = await Promise.all([
    listRouteReadiness(db, month),
    listRouteBriefSummaries(db, month),
    listRouteObservedReliabilitySummaries(db, month),
  ]);
  const readinessByRoute = new Map(readinessRows.map((row) => [row.routeId, row]));
  const observedByRoute = new Map(observed.map((row) => [row.routeId, row]));
  const routes = summaries.flatMap((summary) => {
    const readiness = readinessByRoute.get(summary.routeId);
    if (readiness === undefined) return [];
    return [buildStudioRouteCardFromD1(readiness, summary, observedByRoute.get(summary.routeId))];
  });
  return limit !== undefined ? routes.slice(0, limit) : routes;
}

export async function buildStudioRoutesResponse(
  env: StudioReadEnv,
): Promise<BuildStudioRoutesResponseResult> {
  // D1-backed listing covers all release routes. Falls back to the R2 projection only when
  // env.DB is unset (dev/test envs); production sets DB so this fallback never fires there.
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB !== undefined && baselineMonth !== undefined) {
    const routes = await listStudioRouteCardsFromD1(env, baselineMonth);
    if (routes.length > 0) {
      return {
        ok: true,
        routes,
        generatedAt: new Date().toISOString(),
        quality: {
          releaseLayer: "baseline_release",
          completenessStatus: "partial_public_monthly_only",
          confidence: "medium",
          caveats: [
            `Studio route listing is served live from D1 for ${baselineMonth}.`,
            "Per-route detail, briefs, and findings remain release-static R2 projections.",
          ],
        },
        releaseLayer: "baseline_release",
      };
    }
  }
  const fallback = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
  if (fallback instanceof Response) {
    return { ok: false, response: fallback };
  }
  return {
    ok: true,
    routes: [...fallback.routes],
    generatedAt: fallback.generatedAt,
    quality: fallback.quality,
    releaseLayer: fallback.quality.releaseLayer,
  };
}

function textIncludesAnyTerm(text: string, terms: readonly string[]): boolean {
  const normalizedText = text.toLowerCase();
  return terms.length === 0 || terms.some((term) => normalizedText.includes(term));
}

function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function releaseIdForPrefix(prefix: string): string {
  return prefix.replace(/\/release$/, "");
}

function projectionPath(
  env: StudioReadEnv,
  path: string,
  options: { d1Backed?: boolean } = {},
): string {
  return options.d1Backed ? "d1:studio-routes" : studioProjectionKey(env, path);
}

async function buildStudioSnapshotResponse(env: StudioReadEnv): Promise<Response> {
  const [routesResult, findings, briefs, methods, docs] = await Promise.all([
    buildStudioRoutesResponse(env),
    loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema),
    loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema),
    loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema),
    loadStudioProjection(env, "docs.json", StudioDocsResponseSchema),
  ]);
  if (!routesResult.ok) return routesResult.response;
  if (findings instanceof Response) return findings;
  if (briefs instanceof Response) return briefs;
  if (methods instanceof Response) return methods;
  if (docs instanceof Response) return docs;

  const generatedAt = new Date().toISOString();
  const routesAreD1Backed =
    env.DB !== undefined && (env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH) !== undefined;
  const projections: StudioSnapshotProjection[] = [
    {
      resource: "routes",
      path: projectionPath(env, "routes.json", { d1Backed: routesAreD1Backed }),
      itemCount: routesResult.routes.length,
      generatedAt: routesResult.generatedAt,
    },
    {
      resource: "findings",
      path: projectionPath(env, "findings.json"),
      itemCount: findings.findings.length,
      generatedAt: findings.generatedAt,
    },
    {
      resource: "briefs",
      path: projectionPath(env, "briefs.json"),
      itemCount: briefs.briefs.length,
      generatedAt: briefs.generatedAt,
    },
    {
      resource: "methods",
      path: projectionPath(env, "methods.json"),
      itemCount: methods.datasets.length,
      generatedAt: methods.generatedAt,
    },
    {
      resource: "docs",
      path: projectionPath(env, "docs.json"),
      itemCount: docs.sections.length + docs.endpoints.length,
      generatedAt: docs.generatedAt,
    },
  ];
  const prefix = studioProjectionPrefix(env);

  return studioJsonResponse(
    StudioSnapshotResponseSchema.parse({
      schemaVersion: 1,
      generatedAt,
      releaseId: releaseIdForPrefix(prefix),
      projectionPrefix: prefix,
      releaseKey: studioReleaseKey(env),
      baselineMonth: env.BASELINE_MONTH ?? null,
      lastBuiltSpeedMonth: env.LAST_BUILT_SPEED_MONTH ?? null,
      counts: {
        routes: routesResult.routes.length,
        findings: findings.findings.length,
        briefs: briefs.briefs.length,
        methods: methods.datasets.length,
        docsSections: docs.sections.length,
        docsEndpoints: docs.endpoints.length,
      },
      projections,
      quality: routesResult.quality,
    }),
    env,
  );
}

export async function handleStudioReadRequest<TEnv extends StudioReadEnv>(
  request: Request,
  url: URL,
  env: TEnv,
  hooks: StudioReadHooks<TEnv> = {},
): Promise<Response> {
  if (url.pathname === "/api/v1/studio/routes") {
    const result = await buildStudioRoutesResponse(env);
    if (!result.ok) return result.response;
    return studioJsonResponse(
      StudioRoutesResponseSchema.parse({
        schemaVersion: 1,
        generatedAt: result.generatedAt,
        routes: result.routes,
        quality: result.quality,
      }),
      env,
    );
  }

  if (url.pathname === "/api/v1/studio/snapshot") {
    return buildStudioSnapshotResponse(env);
  }

  if (url.pathname === "/api/v1/studio/search") {
    const [routesResult, findings, briefs] = await Promise.all([
      buildStudioRoutesResponse(env),
      loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema),
      loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema),
    ]);
    if (!routesResult.ok) return routesResult.response;
    if (findings instanceof Response) return findings;
    if (briefs instanceof Response) return briefs;

    const query = url.searchParams.get("q")?.trim() ?? "";
    const terms = searchTerms(query);
    const matchedRoutes = routesResult.routes.filter((route) =>
      textIncludesAnyTerm(
        [
          route.slug,
          route.routeId,
          route.label,
          route.corridor,
          route.borough,
          route.reliability,
          route.diagnosis,
          route.sbs ? "sbs select bus service" : "local",
        ].join(" "),
        terms,
      ),
    );
    const matchedFindings = findings.findings.filter(({ finding }) =>
      textIncludesAnyTerm(
        [
          finding.id,
          finding.category,
          finding.title,
          finding.body,
          finding.metric,
          finding.routeSlug,
        ].join(" "),
        terms,
      ),
    );
    const matchedBriefs = briefs.briefs.filter(({ brief }) =>
      textIncludesAnyTerm(
        [brief.id, brief.title, brief.summary, brief.status, brief.routeSlug, ...brief.claims].join(
          " ",
        ),
        terms,
      ),
    );

    return studioJsonResponse(
      StudioSearchResponseSchema.parse({
        schemaVersion: 1,
        generatedAt: routesResult.generatedAt,
        query,
        routes: matchedRoutes,
        findings: matchedFindings,
        briefs: matchedBriefs,
        quality: routesResult.quality,
      }),
      env,
    );
  }

  const routeMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)$/);
  if (routeMatch) {
    const slug = decodeURIComponent(routeMatch[1] ?? "");
    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) return routes;
    if (getStudioRoute(routes, slug) === undefined) {
      return errorResponse(404, "Studio route was not found.");
    }

    const route = await loadStudioProjection(
      env,
      `routes/${slug}/index.json`,
      StudioRouteDetailResponseSchema,
    );
    return route instanceof Response ? route : studioJsonResponse(route, env);
  }

  const ladderMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)\/ladder$/);
  if (ladderMatch) {
    const slug = decodeURIComponent(ladderMatch[1] ?? "");
    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) return routes;
    if (getStudioRoute(routes, slug) === undefined) {
      return errorResponse(404, "Studio route ladder was not found.");
    }

    const ladder = await loadStudioProjection(
      env,
      `routes/${slug}/ladder.json`,
      StudioRouteLadderResponseSchema,
    );
    return ladder instanceof Response ? ladder : studioJsonResponse(ladder, env);
  }

  if (url.pathname === "/api/v1/studio/compare") {
    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) return routes;

    const routeA = getStudioRoute(routes, url.searchParams.get("a") ?? "");
    const routeB = getStudioRoute(routes, url.searchParams.get("b") ?? "");
    if (routeA === undefined || routeB === undefined) {
      return errorResponse(404, "One or more Studio comparison routes were not found.");
    }

    const release: StudioReleasePayload = {
      schemaVersion: 1,
      generatedAt: routes.generatedAt,
      quality: routes.quality,
      routes: routes.routes,
      segments: [],
      routeArtifacts: [],
      findings: [],
      briefs: [],
      versions: [],
      comments: [],
      methods: [],
      docsSections: [],
      docsEndpoints: [],
    };

    return studioJsonResponse(
      StudioCompareResponseSchema.parse(buildStudioCompareProjection(release, routeA, routeB)),
      env,
    );
  }

  if (url.pathname === "/api/v1/studio/findings") {
    const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
    return findings instanceof Response ? findings : studioJsonResponse(findings, env);
  }

  const findingMatch = url.pathname.match(/^\/api\/v1\/studio\/findings\/([^/]+)$/);
  if (findingMatch) {
    const findingId = decodeURIComponent(findingMatch[1] ?? "");
    const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
    if (findings instanceof Response) return findings;
    if (!findings.findings.some(({ finding }) => finding.id === findingId)) {
      return errorResponse(404, "Studio finding was not found.");
    }

    const finding = await loadStudioProjection(
      env,
      `findings/${findingId}/index.json`,
      StudioFindingResponseSchema,
    );
    return finding instanceof Response ? finding : studioJsonResponse(finding, env);
  }

  if (url.pathname === "/api/v1/studio/briefs") {
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    return briefs instanceof Response ? briefs : studioJsonResponse(briefs, env);
  }

  const briefEvidenceMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)\/evidence$/);
  if (briefEvidenceMatch) {
    const briefId = decodeURIComponent(briefEvidenceMatch[1] ?? "");
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    if (briefs instanceof Response) return briefs;
    if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
      return errorResponse(404, "Studio brief was not found.");
    }

    const evidence = await loadStudioProjection(
      env,
      `briefs/${briefId}/evidence.json`,
      StudioBriefEvidenceResponseSchema,
    );
    return evidence instanceof Response ? evidence : studioJsonResponse(evidence, env);
  }

  const briefHistoryMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)\/history$/);
  if (briefHistoryMatch) {
    const briefId = decodeURIComponent(briefHistoryMatch[1] ?? "");
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    if (briefs instanceof Response) return briefs;
    if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
      return errorResponse(404, "Studio brief was not found.");
    }

    const history = await loadStudioProjection(
      env,
      `briefs/${briefId}/history.json`,
      StudioBriefHistoryResponseSchema,
    );
    return history instanceof Response ? history : studioJsonResponse(history, env);
  }

  const briefMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)$/);
  if (briefMatch) {
    const briefId = decodeURIComponent(briefMatch[1] ?? "");
    const brief = await loadStudioBriefProjection(env, briefId);
    if (!brief.ok) {
      if (brief.response.status === 404 && hooks.loadDraftOnlyBriefProjection !== undefined) {
        const draftOnly = await hooks.loadDraftOnlyBriefProjection(request, env, briefId);
        if (draftOnly !== null) {
          return draftOnly instanceof Response ? draftOnly : studioJsonResponse(draftOnly, env);
        }
      }
      return brief.response;
    }
    const projection =
      hooks.overlayStudioBriefDraft === undefined
        ? brief.data
        : await hooks.overlayStudioBriefDraft(request, env, brief.data);
    return studioJsonResponse(projection, env);
  }

  if (url.pathname === "/api/v1/studio/methods") {
    const methods = await loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema);
    return methods instanceof Response ? methods : studioJsonResponse(methods, env);
  }

  if (url.pathname === "/api/v1/studio/docs") {
    const docs = await loadStudioProjection(env, "docs.json", StudioDocsResponseSchema);
    return docs instanceof Response ? docs : studioJsonResponse(docs, env);
  }

  return errorResponse(404, "Studio API endpoint was not found.");
}
