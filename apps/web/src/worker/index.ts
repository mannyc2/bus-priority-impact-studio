import {
  createD1ServingDb,
  type RouteBriefSummary as D1RouteBriefSummary,
  type RouteObservedReliabilitySummary as D1RouteObservedReliabilitySummary,
  type RouteReadiness as D1RouteReadiness,
  findLatestNonBaselineObservedMonth,
  getRouteBatchStatus,
  getRouteBriefSummary,
  getRouteScorecard,
  listCorridorSummaries,
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteComparisonRanks,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
} from "@bp/db/d1";
import {
  buildStudioCompareProjection,
  getStudioRoute,
  HealthResponseSchema,
  HotspotListResponseSchema,
  healthResponseJsonSchema,
  hotspotListResponseJsonSchema,
  IsoMonthSchema,
  MapManifestResponseSchema,
  mapManifestResponseJsonSchema,
  ReleaseStatusResponseSchema,
  RouteCompareResponseSchema,
  RouteIdCodec,
  RouteListResponseSchema,
  RouteProfileResponseSchema,
  RouteScorecardSchema,
  releaseStatusResponseJsonSchema,
  routeCompareResponseJsonSchema,
  routeListResponseJsonSchema,
  routeProfileResponseJsonSchema,
  routeScorecardJsonSchema,
  studioOpenApiDocument,
} from "@bp/domain";
import * as z from "zod";
import {
  StudioBriefEvidenceResponseSchema,
  StudioBriefHistoryResponseSchema,
  StudioBriefResponseSchema,
  StudioBriefsResponseSchema,
  StudioDocsResponseSchema,
  StudioFindingResponseSchema,
  StudioFindingsResponseSchema,
  StudioMethodsResponseSchema,
  type StudioObservedReliability,
  type StudioRoute,
  StudioRouteDetailResponseSchema,
  StudioRouteLadderResponseSchema,
  StudioRoutesResponseSchema,
  StudioSearchResponseSchema,
} from "../studio/api-contract.js";
import { getStudioSeoMetadata, injectSeoIntoHtml } from "../studio/seo.js";
import { runScheduledProductionRefresh } from "./source-refresh.js";

export type Env = {
  ASSETS?: Fetcher;
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  GTFS_RT_RAW?: R2Bucket;
  MTA_BUS_TIME_API_KEY?: string;
  BASELINE_MONTH?: string;
  STUDIO_RELEASE_KEY?: string;
  LAST_BUILT_SPEED_MONTH?: string;
  GTFS_RT_SAMPLES_PER_CRON?: string;
  GTFS_RT_SAMPLE_SECONDS?: string;
};

function json(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function buildHealthResponse(now = new Date()): Response {
  const body = HealthResponseSchema.parse({
    ok: true,
    service: "bus-priority-impact-studio",
    checkedAt: now.toISOString(),
  });

  return json(body);
}

function errorCodeForStatus(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 404) return "NOT_FOUND";
  if (status === 502) return "BAD_GATEWAY";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return `HTTP_${status}`;
}

function errorJson(status: number, message: string, code = errorCodeForStatus(status)): Response {
  return json({ error: { code, message } }, { status });
}

async function withServerTiming(name: string, handler: () => Promise<Response>): Promise<Response> {
  const startedAt = performance.now();
  const response = await handler();
  const headers = new Headers(response.headers);
  headers.append("Server-Timing", `${name};dur=${(performance.now() - startedAt).toFixed(1)}`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function canServeSpaFallback(request: Request, url: URL): boolean {
  return (
    !isApiPath(url.pathname) &&
    !url.pathname.match(/\/[^/]+\.[^/]+$/) &&
    (request.method === "GET" || request.method === "HEAD")
  );
}

function isProductionClosedPath(url: URL): boolean {
  return url.pathname === "/system" && !isLocalDevHost(url.hostname);
}

async function withSpaSeo(request: Request, url: URL, response: Response): Promise<Response> {
  if (request.method === "HEAD") {
    return response;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const metadata = getStudioSeoMetadata(url);
  if (metadata === null) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  if (metadata.noindex) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return new Response(injectSeoIntoHtml(await response.text(), metadata, url.origin), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function buildRouteScorecardResponse(url: URL, env: Env): Promise<Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const match = url.pathname.match(/^\/api\/routes\/([^/]+)\/scorecard$/);
  const rawRouteId = match?.[1];
  const rawMonth = url.searchParams.get("month");

  if (rawRouteId === undefined) {
    return errorJson(404, "Route scorecard endpoint not found.");
  }

  const month = IsoMonthSchema.safeParse(rawMonth);
  if (!month.success) {
    return errorJson(400, "Query parameter month must use YYYY-MM format.");
  }

  let routeId: z.output<typeof RouteIdCodec>;
  try {
    routeId = z.decode(RouteIdCodec, decodeURIComponent(rawRouteId));
  } catch {
    return errorJson(400, "Route ID is invalid.");
  }

  const scorecard = await getRouteScorecard(createD1ServingDb(env.DB), routeId, month.data);
  if (scorecard === null) {
    return errorJson(404, "Route scorecard was not found.");
  }

  return json(RouteScorecardSchema.parse(scorecard));
}

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
  env: Env,
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

function parseLimit(url: URL, fallback: number, maximum: number): number | null {
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit === null) {
    return fallback;
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    return null;
  }

  return Math.min(limit, maximum);
}

function releaseStatusMonth(url: URL, env: Env): string | null {
  const month = url.searchParams.get("month") ?? env.BASELINE_MONTH ?? null;
  if (month === null) {
    return null;
  }

  const parsed = IsoMonthSchema.safeParse(month);
  return parsed.success ? parsed.data : null;
}

function artifactApiPath(key: string): string {
  return `/api/v1/artifacts/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

const defaultStudioReleaseArtifactKey = "studio/v1/release.json";

function studioProjectionPrefix(env: Env): string {
  const configuredKey = env.STUDIO_RELEASE_KEY?.trim();
  const releaseKey =
    configuredKey && configuredKey.length > 0 ? configuredKey : defaultStudioReleaseArtifactKey;
  const parts = releaseKey.split("/");
  parts.pop();
  return parts.length === 0 ? "studio/v1" : parts.join("/");
}

function studioProjectionKey(env: Env, path: string): string {
  return `${studioProjectionPrefix(env)}/${path}`;
}

function studioJson(body: unknown, env: Env): Response {
  return json(body, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=86400",
      "X-Studio-Release": studioProjectionPrefix(env),
    },
  });
}

async function loadStudioProjection<TSchema extends z.ZodType>(
  env: Env,
  path: string,
  schema: TSchema,
): Promise<Response | z.output<TSchema>> {
  if (env.ARTIFACTS === undefined) {
    return errorJson(503, "ARTIFACTS R2 binding is required for the Studio API.");
  }

  const key = studioProjectionKey(env, path);
  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return errorJson(503, `Studio API projection artifact was not found at ${key}.`);
  }

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return errorJson(502, `Studio API projection artifact is not valid JSON: ${key}.`);
  }

  const projection = schema.safeParse(payload);
  if (!projection.success) {
    return errorJson(502, `Studio API projection artifact failed contract validation: ${key}.`);
  }

  return projection.data;
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

async function buildStudioRoutesResponse(env: Env): Promise<
  | {
      ok: true;
      routes: StudioRoute[];
      generatedAt: string;
      quality: z.infer<typeof StudioRoutesResponseSchema>["quality"];
      releaseLayer: string;
    }
  | { ok: false; response: Response }
> {
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

async function buildStudioResponse(url: URL, env: Env): Promise<Response> {
  if (url.pathname === "/api/v1/studio/routes") {
    const result = await buildStudioRoutesResponse(env);
    if (!result.ok) return result.response;
    return studioJson(
      StudioRoutesResponseSchema.parse({
        schemaVersion: 1,
        generatedAt: result.generatedAt,
        routes: result.routes,
        quality: result.quality,
      }),
      env,
    );
  }

  if (url.pathname === "/api/v1/studio/search") {
    const [routesResult, findings, briefs] = await Promise.all([
      buildStudioRoutesResponse(env),
      loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema),
      loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema),
    ]);
    if (!routesResult.ok) return routesResult.response;
    if (findings instanceof Response) {
      return findings;
    }
    if (briefs instanceof Response) {
      return briefs;
    }

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

    return studioJson(
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
    if (routes instanceof Response) {
      return routes;
    }
    if (getStudioRoute(routes, slug) === undefined) {
      return errorJson(404, "Studio route was not found.");
    }

    const route = await loadStudioProjection(
      env,
      `routes/${slug}/index.json`,
      StudioRouteDetailResponseSchema,
    );
    return route instanceof Response ? route : studioJson(route, env);
  }

  const ladderMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)\/ladder$/);
  if (ladderMatch) {
    const slug = decodeURIComponent(ladderMatch[1] ?? "");
    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) {
      return routes;
    }
    if (getStudioRoute(routes, slug) === undefined) {
      return errorJson(404, "Studio route ladder was not found.");
    }

    const ladder = await loadStudioProjection(
      env,
      `routes/${slug}/ladder.json`,
      StudioRouteLadderResponseSchema,
    );
    return ladder instanceof Response ? ladder : studioJson(ladder, env);
  }

  if (url.pathname === "/api/v1/studio/compare") {
    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) {
      return routes;
    }

    const routeA = getStudioRoute(routes, url.searchParams.get("a") ?? "");
    const routeB = getStudioRoute(routes, url.searchParams.get("b") ?? "");
    if (routeA === undefined || routeB === undefined) {
      return errorJson(404, "One or more Studio comparison routes were not found.");
    }

    return studioJson(
      buildStudioCompareProjection(
        {
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
        },
        routeA,
        routeB,
      ),
      env,
    );
  }

  if (url.pathname === "/api/v1/studio/findings") {
    const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
    return findings instanceof Response ? findings : studioJson(findings, env);
  }

  const findingMatch = url.pathname.match(/^\/api\/v1\/studio\/findings\/([^/]+)$/);
  if (findingMatch) {
    const findingId = decodeURIComponent(findingMatch[1] ?? "");
    const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
    if (findings instanceof Response) {
      return findings;
    }
    if (!findings.findings.some(({ finding }) => finding.id === findingId)) {
      return errorJson(404, "Studio finding was not found.");
    }

    const finding = await loadStudioProjection(
      env,
      `findings/${findingId}/index.json`,
      StudioFindingResponseSchema,
    );
    return finding instanceof Response ? finding : studioJson(finding, env);
  }

  if (url.pathname === "/api/v1/studio/briefs") {
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    return briefs instanceof Response ? briefs : studioJson(briefs, env);
  }

  const briefEvidenceMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)\/evidence$/);
  if (briefEvidenceMatch) {
    const briefId = decodeURIComponent(briefEvidenceMatch[1] ?? "");
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    if (briefs instanceof Response) {
      return briefs;
    }
    if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
      return errorJson(404, "Studio brief was not found.");
    }

    const evidence = await loadStudioProjection(
      env,
      `briefs/${briefId}/evidence.json`,
      StudioBriefEvidenceResponseSchema,
    );
    return evidence instanceof Response ? evidence : studioJson(evidence, env);
  }

  const briefHistoryMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)\/history$/);
  if (briefHistoryMatch) {
    const briefId = decodeURIComponent(briefHistoryMatch[1] ?? "");
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    if (briefs instanceof Response) {
      return briefs;
    }
    if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
      return errorJson(404, "Studio brief was not found.");
    }

    const history = await loadStudioProjection(
      env,
      `briefs/${briefId}/history.json`,
      StudioBriefHistoryResponseSchema,
    );
    return history instanceof Response ? history : studioJson(history, env);
  }

  const briefMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)$/);
  if (briefMatch) {
    const briefId = decodeURIComponent(briefMatch[1] ?? "");
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    if (briefs instanceof Response) {
      return briefs;
    }
    if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
      return errorJson(404, "Studio brief was not found.");
    }

    const brief = await loadStudioProjection(
      env,
      `briefs/${briefId}/index.json`,
      StudioBriefResponseSchema,
    );
    return brief instanceof Response ? brief : studioJson(brief, env);
  }

  if (url.pathname === "/api/v1/studio/methods") {
    const methods = await loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema);
    return methods instanceof Response ? methods : studioJson(methods, env);
  }

  if (url.pathname === "/api/v1/studio/docs") {
    const docs = await loadStudioProjection(env, "docs.json", StudioDocsResponseSchema);
    return docs instanceof Response ? docs : studioJson(docs, env);
  }

  return errorJson(404, "Studio API endpoint was not found.");
}

type ObservedReliabilityRow = Awaited<
  ReturnType<typeof listRouteObservedReliabilitySummaries>
>[number];

function buildRouteCard(input: {
  routeId: string;
  month: string;
  rank: number;
  routeScore: number;
  averageSpeedMph: number;
  hotspotCount: number;
  totalRidership: number;
  aceActive: boolean;
  busLaneMatchedLaneCount: number;
  observed: ObservedReliabilityRow | null;
}) {
  const source = realtimeSourceForRunId(input.observed?.runId ?? null);
  const hasObservedReliability = input.observed?.reliabilityStatus === "observed";
  const completenessStatus =
    input.observed === null
      ? "missing_realtime"
      : hasObservedReliability
        ? "complete"
        : "insufficient_samples";

  return {
    routeId: input.routeId,
    shortName: input.routeId,
    month: input.month,
    rank: input.rank,
    routeScore: input.routeScore,
    averageSpeedMph: input.averageSpeedMph,
    hotspotCount: input.hotspotCount,
    totalRidership: input.totalRidership,
    aceActive: input.aceActive,
    busLaneMatchedLaneCount: input.busLaneMatchedLaneCount,
    observedBunchingShare: input.observed?.observedBunchingShare ?? null,
    observedLongGapShare: input.observed?.observedLongGapShare ?? null,
    reliabilityStatus: input.observed?.reliabilityStatus ?? null,
    sampleCount: input.observed?.sampleCount ?? 0,
    quality: {
      releaseLayer: hasObservedReliability
        ? ("observed_release" as const)
        : ("baseline_release" as const),
      completenessStatus,
      confidence: source === "third_party_recovered" ? ("medium" as const) : ("high" as const),
      caveats:
        source === "third_party_recovered"
          ? ["Observed reliability is recovered from the third-party Bus Observatory archive."]
          : input.observed === null
            ? ["No observed realtime reliability row is attached to this route card."]
            : [],
    },
  };
}

async function buildReleaseStatusResponse(url: URL, env: Env): Promise<Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const db = createD1ServingDb(env.DB);
  const [batchStatus, reliability, currentSignalMonth] = await Promise.all([
    getRouteBatchStatus(db, month),
    listRouteObservedReliabilitySummaries(db, month),
    findLatestNonBaselineObservedMonth(db, month),
  ]);

  if (batchStatus === null) {
    return errorJson(404, "Release status was not found.");
  }

  const observedRows = reliability.filter((row) => row.reliabilityStatus === "observed");
  const insufficientRows = reliability.filter(
    (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
  );
  const runIds = [...new Set(observedRows.map((row) => row.runId))].sort();
  const runId = runIds.length === 1 ? (runIds[0] ?? null) : null;
  const observedRouteCount = observedRows.length;
  const sampleCount = reliability.reduce((sum, row) => sum + row.sampleCount, 0);
  const routeCoverageShare =
    batchStatus.routeCount === 0
      ? 0
      : Number((observedRouteCount / batchStatus.routeCount).toFixed(4));
  const source = realtimeSourceForRunId(runId);
  const caveats =
    source === "third_party_recovered"
      ? [
          "Observed GTFS-RT reliability is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Monthly public speed evidence remains official MTA Open Data; realtime evidence has separate provenance.",
        ]
      : source === "none"
        ? ["No observed realtime evidence is attached to this release."]
        : ["Observed realtime evidence comes from self-collected MTA Bus Time GTFS-RT snapshots."];

  const currentObservedSignal = currentSignalMonth
    ? await buildCurrentObservedSignal(db, currentSignalMonth)
    : null;

  return json(
    ReleaseStatusResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: batchStatus.generatedAt,
      baselineMonth: month,
      currentSignalMonth: currentObservedSignal?.month ?? null,
      canonicalMonthlyRelease: {
        month,
        status: batchStatus.status,
        routeCount: batchStatus.routeCount,
        artifactCount: batchStatus.artifactCount,
        issueCount: batchStatus.issueCount,
      },
      observedRealtimeEvidence: {
        runId,
        source,
        observedRouteCount,
        insufficientRouteCount: insufficientRows.length,
        sampleCount,
        routeCoverageShare,
      },
      currentObservedSignal,
      quality: {
        releaseLayer: observedRouteCount > 0 ? "observed_release" : "baseline_release",
        completenessStatus:
          batchStatus.status === "pass" ? "complete" : "partial_public_monthly_only",
        confidence: source === "third_party_recovered" ? "medium" : "high",
        caveats,
      },
    }),
  );
}

async function buildCurrentObservedSignal(
  db: ReturnType<typeof createD1ServingDb>,
  month: string,
): Promise<{
  month: string;
  runId: string | null;
  source: "official_self_collected" | "third_party_recovered" | "none";
  releaseLayer: "current_signal";
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  sampleCount: number;
  caveats: readonly string[];
}> {
  const rows = await listRouteObservedReliabilitySummaries(db, month);
  const observedRows = rows.filter((row) => row.reliabilityStatus === "observed");
  const insufficientRows = rows.filter(
    (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
  );
  const runIds = [...new Set(rows.map((row) => row.runId))].sort();
  const runId = runIds.length === 1 ? (runIds[0] ?? null) : null;
  const source = realtimeSourceForRunId(runId);
  const sampleCount = rows.reduce((sum, row) => sum + row.sampleCount, 0);
  const caveats =
    source === "third_party_recovered"
      ? [
          "Current observed signal is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Public monthly speed data is not yet available for this month; reliability evidence stands alone.",
        ]
      : source === "official_self_collected"
        ? [
            "Current observed signal comes from self-collected MTA Bus Time GTFS-RT snapshots.",
            "Public monthly speed data is not yet available for this month; reliability evidence stands alone.",
          ]
        : ["Current observed signal has ambiguous provenance; multiple runs cover the same month."];
  return {
    month,
    runId,
    source,
    releaseLayer: "current_signal",
    routeCount: rows.length,
    observedRouteCount: observedRows.length,
    insufficientRouteCount: insufficientRows.length,
    sampleCount,
    caveats,
  };
}

async function buildRouteListResponse(url: URL, env: Env): Promise<Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const limit = parseLimit(url, 50, 250);
  if (limit === null) {
    return errorJson(400, "Query parameter limit must be a positive integer.");
  }

  const db = createD1ServingDb(env.DB);
  const [summaries, reliability] = await Promise.all([
    listRouteBriefSummaries(db, month),
    listRouteObservedReliabilitySummaries(db, month),
  ]);
  const reliabilityByRoute = new Map(reliability.map((row) => [row.routeId, row]));

  const routes = summaries.slice(0, limit).map((summary, index) => {
    const observed = reliabilityByRoute.get(summary.routeId) ?? null;
    return buildRouteCard({
      routeId: summary.routeId,
      month: summary.month,
      rank: index + 1,
      routeScore: summary.routeScore,
      averageSpeedMph: summary.averageSpeedMph,
      hotspotCount: summary.hotspotCount,
      totalRidership: summary.totalRidership,
      aceActive: summary.aceActive,
      busLaneMatchedLaneCount: summary.busLaneMatchedLaneCount,
      observed,
    });
  });

  return json(
    RouteListResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineMonth: month,
      routes,
      quality: {
        releaseLayer: routes.some((route) => route.quality.releaseLayer === "observed_release")
          ? "observed_release"
          : "baseline_release",
        completenessStatus: routes.every((route) => route.quality.completenessStatus === "complete")
          ? "complete"
          : "insufficient_samples",
        confidence: routes.some((route) => route.quality.confidence === "medium")
          ? "medium"
          : "high",
        caveats: [
          "Route cards are compact D1 serving projections; full evidence lives in generated route briefs and artifacts.",
        ],
      },
    }),
  );
}

async function buildRouteProfileResponse(url: URL, env: Env): Promise<Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const match = url.pathname.match(/^\/api\/v1\/routes\/([^/]+)\/profile$/);
  const rawRouteId = match?.[1];
  if (rawRouteId === undefined) {
    return errorJson(404, "Route profile endpoint not found.");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  let routeId: z.output<typeof RouteIdCodec>;
  try {
    routeId = z.decode(RouteIdCodec, decodeURIComponent(rawRouteId));
  } catch {
    return errorJson(400, "Route ID is invalid.");
  }

  const db = createD1ServingDb(env.DB);
  const [summary, reliability, artifacts] = await Promise.all([
    getRouteBriefSummary(db, routeId, month),
    listRouteObservedReliabilitySummaries(db, month),
    listRouteArtifacts(db, month),
  ]);

  if (summary === null) {
    return errorJson(404, "Route profile was not found.");
  }

  const observed = reliability.find((row) => row.routeId === routeId) ?? null;
  const source = realtimeSourceForRunId(observed?.runId ?? null);
  const hasObservedReliability = observed?.reliabilityStatus === "observed";
  const completenessStatus =
    observed === null
      ? "missing_realtime"
      : hasObservedReliability
        ? "complete"
        : "insufficient_samples";
  const quality = {
    releaseLayer: hasObservedReliability ? "observed_release" : "baseline_release",
    completenessStatus,
    confidence: source === "third_party_recovered" ? "medium" : "high",
    caveats:
      source === "third_party_recovered"
        ? ["Observed reliability is recovered from the third-party Bus Observatory archive."]
        : observed === null
          ? ["No observed realtime reliability row is attached to this route profile."]
          : [],
  };

  return json(
    RouteProfileResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineMonth: month,
      route: {
        ...buildRouteCard({
          routeId: summary.routeId,
          month: summary.month,
          rank: 1,
          routeScore: summary.routeScore,
          averageSpeedMph: summary.averageSpeedMph,
          hotspotCount: summary.hotspotCount,
          totalRidership: summary.totalRidership,
          aceActive: summary.aceActive,
          busLaneMatchedLaneCount: summary.busLaneMatchedLaneCount,
          observed,
        }),
        quality,
      },
      peakRidership:
        summary.peakRidership === null
          ? null
          : {
              dayOfWeek: summary.peakRidership.dayOfWeek,
              hourOfDay: summary.peakRidership.hourOfDay,
              ridership: summary.peakRidership.ridership,
              transfers: summary.peakRidership.transfers,
              weightedAverageSpeedMph: summary.peakRidership.weightedAverageSpeedMph,
            },
      slowestWindow:
        summary.slowestWindow === null
          ? null
          : {
              dayOfWeek: summary.slowestWindow.dayOfWeek,
              hourOfDay: summary.slowestWindow.hourOfDay,
              observationCount: summary.slowestWindow.observationCount,
              busTripCount: summary.slowestWindow.busTripCount,
              weightedAverageSpeedMph: summary.slowestWindow.weightedAverageSpeedMph,
              slowObservationShare: summary.slowestWindow.slowObservationShare,
            },
      observedReliability:
        observed === null
          ? null
          : {
              runId: observed.runId,
              reliabilityStatus: observed.reliabilityStatus,
              sampleCount: observed.sampleCount,
              medianObservedHeadwayMinutes: observed.medianObservedHeadwayMinutes,
              p90ObservedHeadwayMinutes: observed.p90ObservedHeadwayMinutes,
              observedBunchingShare: observed.observedBunchingShare,
              observedLongGapShare: observed.observedLongGapShare,
              excessWaitMinutes: observed.excessWaitMinutes,
            },
      artifacts: artifacts
        .filter((artifact) => artifact.route_id === routeId)
        .map((artifact) => ({
          name: artifact.artifact_name,
          key: artifact.artifact_key,
          contentType: artifact.content_type,
          byteLength: artifact.byte_length,
          sha256: artifact.sha256,
        })),
      quality,
    }),
  );
}

async function buildMapManifestResponse(url: URL, env: Env): Promise<Response> {
  if (env.ARTIFACTS === undefined) {
    return errorJson(503, "ARTIFACTS R2 binding is not configured.");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const object = await env.ARTIFACTS.get(`map/${month}/manifest.json`);
  if (object === null) {
    return errorJson(404, "Map manifest was not found.");
  }

  const manifest = (await object.json()) as {
    schemaVersion?: unknown;
    generatedAt?: unknown;
    status?: unknown;
    artifactCount?: unknown;
    routeSegmentArtifactCount?: unknown;
    totalFeatureCount?: unknown;
    totalByteLength?: unknown;
    issueCount?: unknown;
    artifacts?: Array<{
      artifactKind?: unknown;
      artifactKey?: unknown;
      contentType?: unknown;
      byteLength?: unknown;
      sha256?: unknown;
      featureCount?: unknown;
      routeId?: unknown;
    }>;
  };

  return json(
    MapManifestResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: manifest.generatedAt,
      baselineMonth: month,
      status: manifest.status,
      artifactCount: manifest.artifactCount,
      routeSegmentArtifactCount: manifest.routeSegmentArtifactCount,
      totalFeatureCount: manifest.totalFeatureCount,
      totalByteLength: manifest.totalByteLength,
      issueCount: manifest.issueCount,
      artifacts: (manifest.artifacts ?? []).map((artifact) => ({
        artifactKind: artifact.artifactKind,
        artifactKey: artifact.artifactKey,
        contentType: artifact.contentType,
        byteLength: artifact.byteLength,
        sha256: artifact.sha256,
        featureCount: artifact.featureCount,
        routeId: artifact.routeId,
        apiPath:
          typeof artifact.artifactKey === "string" ? artifactApiPath(artifact.artifactKey) : "",
      })),
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: manifest.status === "pass" ? "complete" : "partial_public_monthly_only",
        confidence: "high",
        caveats: [
          "Map payloads are generated artifacts served from R2; the manifest only carries metadata and fetch paths.",
        ],
      },
    }),
  );
}

async function buildArtifactResponse(url: URL, env: Env): Promise<Response> {
  if (env.ARTIFACTS === undefined) {
    return errorJson(503, "ARTIFACTS R2 binding is not configured.");
  }

  const prefix = "/api/v1/artifacts/";
  const rawKey = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  const key = rawKey
    .split("/")
    .map((part) => decodeURIComponent(part))
    .join("/");

  if (key.length === 0 || key.startsWith("/") || key.includes("..")) {
    return errorJson(400, "Artifact key is invalid.");
  }

  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return errorJson(404, "Artifact was not found.");
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream");
  }

  return new Response(object.body, { headers });
}

async function buildHotspotListResponse(url: URL, env: Env): Promise<Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const limit = parseLimit(url, 50, 250);
  if (limit === null) {
    return errorJson(400, "Query parameter limit must be a positive integer.");
  }

  const corridors = await listCorridorSummaries(createD1ServingDb(env.DB), month);
  const hotspots = corridors
    .flatMap((corridor) =>
      corridor.topHotspots.map((hotspot) => ({
        corridorId: corridor.corridorId,
        corridorName: corridor.corridorName,
        routeId: hotspot.route_id,
        month: hotspot.month,
        rank: hotspot.corridor_hotspot_rank,
        routeHotspotRank: hotspot.route_hotspot_rank,
        fromStopName: hotspot.from_stop_name,
        toStopName: hotspot.to_stop_name,
        averageSpeedMph: hotspot.weighted_average_speed_mph,
        hotspotScore: hotspot.hotspot_score,
        riderImpactScore: hotspot.rider_impact_score,
        quality: {
          releaseLayer: "baseline_release" as const,
          completenessStatus: "complete" as const,
          confidence: "high" as const,
          caveats: ["Hotspots are precomputed from the canonical monthly public speed release."],
        },
      })),
    )
    .sort((left, right) => {
      const impactDelta = (right.riderImpactScore ?? -1) - (left.riderImpactScore ?? -1);
      return (
        impactDelta ||
        right.hotspotScore - left.hotspotScore ||
        left.averageSpeedMph - right.averageSpeedMph ||
        left.routeId.localeCompare(right.routeId)
      );
    })
    .slice(0, limit)
    .map((hotspot, index) => ({ ...hotspot, rank: index + 1 }));

  return json(
    HotspotListResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineMonth: month,
      hotspots,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "complete",
        confidence: "high",
        caveats: [
          "Hotspot cards are generated monthly evidence, not live GTFS-RT current-state claims.",
        ],
      },
    }),
  );
}

async function buildRouteCompareResponse(url: URL, env: Env): Promise<Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const routeIdParams = url.searchParams.getAll("routeId");
  const rawRouteIds =
    routeIdParams.length >= 2
      ? routeIdParams.slice(0, 2)
      : [url.searchParams.get("a"), url.searchParams.get("b")].filter(
          (value): value is string => value !== null,
        );
  if (rawRouteIds.length !== 2) {
    return errorJson(400, "Provide exactly two routeId parameters, or a and b.");
  }

  let routeIds: [z.output<typeof RouteIdCodec>, z.output<typeof RouteIdCodec>];
  try {
    routeIds = [
      z.decode(RouteIdCodec, rawRouteIds[0] ?? ""),
      z.decode(RouteIdCodec, rawRouteIds[1] ?? ""),
    ];
  } catch {
    return errorJson(400, "One or more route IDs are invalid.");
  }

  const db = createD1ServingDb(env.DB);
  const [ranks, reliability] = await Promise.all([
    listRouteComparisonRanks(db, month),
    listRouteObservedReliabilitySummaries(db, month),
  ]);
  const ranksByRoute = new Map(ranks.map((rank) => [rank.routeId, rank]));
  const reliabilityByRoute = new Map(reliability.map((row) => [row.routeId, row]));
  const left = ranksByRoute.get(routeIds[0]) ?? null;
  const right = ranksByRoute.get(routeIds[1]) ?? null;

  if (left === null || right === null) {
    return errorJson(404, "One or more routes were not found in the comparison projection.");
  }

  const routes = [
    buildRouteCard({
      routeId: left.routeId,
      month: left.month,
      rank: left.rank,
      routeScore: left.routeScore,
      averageSpeedMph: left.averageSpeedMph,
      hotspotCount: 0,
      totalRidership: left.totalRidership,
      aceActive: left.aceViolationCount > 0,
      busLaneMatchedLaneCount: left.busLaneMatchedLaneCount,
      observed: reliabilityByRoute.get(left.routeId) ?? null,
    }),
    buildRouteCard({
      routeId: right.routeId,
      month: right.month,
      rank: right.rank,
      routeScore: right.routeScore,
      averageSpeedMph: right.averageSpeedMph,
      hotspotCount: 0,
      totalRidership: right.totalRidership,
      aceActive: right.aceViolationCount > 0,
      busLaneMatchedLaneCount: right.busLaneMatchedLaneCount,
      observed: reliabilityByRoute.get(right.routeId) ?? null,
    }),
  ] as const;

  return json(
    RouteCompareResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineMonth: month,
      routes,
      deltas: {
        routeScore: right.routeScore - left.routeScore,
        averageSpeedMph: right.averageSpeedMph - left.averageSpeedMph,
        totalRidership: right.totalRidership - left.totalRidership,
        observedBunchingShare:
          routes[1].observedBunchingShare === null || routes[0].observedBunchingShare === null
            ? null
            : routes[1].observedBunchingShare - routes[0].observedBunchingShare,
        observedLongGapShare:
          routes[1].observedLongGapShare === null || routes[0].observedLongGapShare === null
            ? null
            : routes[1].observedLongGapShare - routes[0].observedLongGapShare,
      },
      quality: {
        releaseLayer: routes.some((route) => route.quality.releaseLayer === "observed_release")
          ? "observed_release"
          : "baseline_release",
        completenessStatus: routes.every((route) => route.quality.completenessStatus === "complete")
          ? "complete"
          : "insufficient_samples",
        confidence: routes.some((route) => route.quality.confidence === "medium")
          ? "medium"
          : "high",
        caveats: [
          "Comparison metrics are generated monthly serving projections; realtime reliability is attached when observed evidence exists.",
        ],
      },
    }),
  );
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return buildHealthResponse();
    }

    if (url.pathname === "/api/schema/health") {
      return json(healthResponseJsonSchema);
    }

    if (url.pathname === "/api/schema/route-scorecard") {
      return json(routeScorecardJsonSchema);
    }

    if (url.pathname === "/api/schema/release-status") {
      return json(releaseStatusResponseJsonSchema);
    }

    if (url.pathname === "/api/schema/route-list") {
      return json(routeListResponseJsonSchema);
    }

    if (url.pathname === "/api/schema/route-profile") {
      return json(routeProfileResponseJsonSchema);
    }

    if (url.pathname === "/api/schema/map-manifest") {
      return json(mapManifestResponseJsonSchema);
    }

    if (url.pathname === "/api/schema/hotspots") {
      return json(hotspotListResponseJsonSchema);
    }

    if (url.pathname === "/api/schema/compare") {
      return json(routeCompareResponseJsonSchema);
    }

    if (url.pathname === "/api/openapi.json") {
      return json(studioOpenApiDocument);
    }

    if (url.pathname === "/api/v1/studio" || url.pathname.startsWith("/api/v1/studio/")) {
      return withServerTiming("studio", () => buildStudioResponse(url, env));
    }

    if (url.pathname === "/api/v1/status") {
      return buildReleaseStatusResponse(url, env);
    }

    if (url.pathname === "/api/v1/routes") {
      return buildRouteListResponse(url, env);
    }

    if (url.pathname.match(/^\/api\/v1\/routes\/[^/]+\/profile$/)) {
      return buildRouteProfileResponse(url, env);
    }

    if (url.pathname === "/api/v1/map/manifest") {
      return buildMapManifestResponse(url, env);
    }

    if (url.pathname.startsWith("/api/v1/artifacts/")) {
      return buildArtifactResponse(url, env);
    }

    if (url.pathname === "/api/v1/hotspots") {
      return buildHotspotListResponse(url, env);
    }

    if (url.pathname === "/api/v1/compare") {
      return buildRouteCompareResponse(url, env);
    }

    if (url.pathname.match(/^\/api\/routes\/[^/]+\/scorecard$/)) {
      return buildRouteScorecardResponse(url, env);
    }

    if (isProductionClosedPath(url)) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    if (canServeSpaFallback(request, url) && env.ASSETS !== undefined) {
      return withSpaSeo(request, url, await env.ASSETS.fetch(request));
    }

    if (canServeSpaFallback(request, url) && isLocalDevHost(url.hostname)) {
      return withSpaSeo(request, url, await fetch(new Request(new URL("/", request.url), request)));
    }

    return new Response("Not found", { status: 404 });
  },
  async scheduled(controller: ScheduledController, env: Env = {}): Promise<void> {
    await runScheduledProductionRefresh(env, { cron: controller.cron });
  },
} satisfies ExportedHandler<Env>;
