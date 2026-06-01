import {
  consumeMagicLinkRequest,
  createD1ServingDb,
  createMagicLinkRequest,
  createSession,
  type RouteBriefSummary as D1RouteBriefSummary,
  type RouteObservedReliabilitySummary as D1RouteObservedReliabilitySummary,
  type RouteReadiness as D1RouteReadiness,
  type StudioBriefAgentProposalRow as D1StudioBriefAgentProposalRow,
  type StudioBriefAgentRunRow as D1StudioBriefAgentRunRow,
  type StudioBriefDraftVersionRow as D1StudioBriefDraftVersionRow,
  type StudioBriefDraftBlockRow as D1StudioBriefDraftBlockRow,
  type StudioBriefDraftClaimRow as D1StudioBriefDraftClaimRow,
  type StudioBriefDraftRecord as D1StudioBriefDraftRecord,
  type StudioBriefReviewCommentRow as D1StudioBriefReviewCommentRow,
  deleteStudioBriefDraftBlock,
  deleteStudioBriefDraftClaim,
  deleteStudioBriefDraftRefsForBlock,
  findLatestNonBaselineObservedMonth,
  getIdentityById,
  getIdentityBySessionTokenHash,
  getOperatorRoleForIdentity,
  getRouteBatchStatus,
  getRouteBriefSummary,
  getRouteScorecard,
  getStudioBriefAgentProposal,
  getStudioBriefAgentRun,
  getStudioBriefDraftVersion,
  getStudioBriefDraftVersionSnapshot,
  getStudioBriefDraftRecord,
  getStudioBriefReviewComment,
  getStudioBriefWriteIdempotency,
  insertStudioBriefAgentProposal,
  insertStudioBriefAgentRun,
  insertStudioBriefDraft,
  insertStudioBriefDraftBlock,
  insertStudioBriefDraftClaim,
  insertStudioBriefDraftVersion,
  insertStudioBriefDraftVersionSnapshot,
  insertStudioBriefHistoryEvent,
  insertStudioBriefReviewComment,
  insertStudioBriefReviewReply,
  insertStudioBriefReviewThread,
  listCorridorSummaries,
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteComparisonRanks,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
  listStudioBriefDraftVersions,
  markStudioBriefDraftPublishCandidate,
  markStudioBriefDraftRetracted,
  parseDraftNumberArray,
  parseDraftStringArray,
  recordSessionUse,
  recordStudioBriefPromotionReceipt,
  recordStudioBriefWriteIdempotency,
  replaceStudioBriefDraftBlocks,
  replaceStudioBriefDraftClaims,
  replaceStudioBriefDraftRefs,
  revokeSession,
  updateStudioBriefAgentProposalStatus,
  updateStudioBriefAgentRunStatus,
  updateStudioBriefDraftBlock,
  updateStudioBriefDraftClaim,
  updateStudioBriefDraftJobStatus,
  updateStudioBriefDraftMetadata,
  updateStudioBriefDraftValidation,
  updateStudioBriefReviewComment,
} from "@bp/db/d1";
import { Think } from "@cloudflare/think";
import type {
  ChatResponseResult,
  PrepareStepContext,
  StepConfig,
  ThinkSubmissionInspection,
  TurnConfig,
} from "@cloudflare/think";
import {
  buildStudioCompareProjection,
  getStudioRoute,
  HealthResponseSchema,
  HotspotListResponseSchema,
  healthResponseJsonSchema,
  hotspotListResponseJsonSchema,
  IsoMonthSchema,
  MagicLinkConsumeRequestSchema,
  MagicLinkRequestSchema,
  MapManifestResponseSchema,
  mapManifestResponseJsonSchema,
  ReleaseStatusResponseSchema,
  RouteCompareResponseSchema,
  RouteIdCodec,
  RouteListResponseSchema,
  RouteProfileResponseSchema,
  RouteScorecardSchema,
  RumReportSchema,
  releaseStatusResponseJsonSchema,
  routeCompareResponseJsonSchema,
  routeListResponseJsonSchema,
  routeProfileResponseJsonSchema,
  routeScorecardJsonSchema,
  studioOpenApiDocument,
} from "@bp/domain";
import { tool, type LanguageModel, type ToolSet, type UIMessage, zodSchema } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import * as z from "zod";
import {
  type StudioActorScope,
  type StudioBrief,
  type StudioBriefAgentOperation,
  StudioBriefAgentOperationSchema,
  type StudioBriefAgentProposal,
  StudioBriefAgentProposalApplyRequestSchema,
  StudioBriefAgentProposalApplyResponseSchema,
  type StudioBriefAgentProposalError,
  StudioBriefAgentProposalResponseSchema,
  StudioBriefAgentProposalRejectRequestSchema,
  StudioBriefAgentProposalRejectResponseSchema,
  StudioBriefAgentProposeEditRequestSchema,
  StudioBriefAgentProposeEditResultSchema,
  StudioBriefAgentProvenanceSchema,
  type StudioBriefAgentRun,
  StudioBriefAgentRunCreateRequestSchema,
  StudioBriefAgentRunResponseSchema,
  StudioBriefAgentTriggerSchema,
  type StudioBriefBlock,
  StudioBriefBlockSchema,
  StudioBriefCreateRequestSchema,
  StudioBriefCreateResponseSchema,
  type StudioBriefDraft,
  type StudioBriefDraftVersion,
  StudioBriefDraftVersionsResponseSchema,
  StudioBriefDraftAttachRequestSchema,
  StudioBriefDraftAttachResponseSchema,
  StudioBriefDraftBlockCreateRequestSchema,
  StudioBriefDraftBlockPatchRequestSchema,
  StudioBriefDraftBlockResponseSchema,
  StudioBriefDraftClaimCreateRequestSchema,
  StudioBriefDraftClaimPatchRequestSchema,
  StudioBriefDraftClaimResponseSchema,
  StudioBriefDraftCommentCreateRequestSchema,
  StudioBriefDraftCommentPatchRequestSchema,
  StudioBriefDraftCommentReplyRequestSchema,
  StudioBriefDraftCommentResponseSchema,
  StudioBriefDraftCommentsResponseSchema,
  StudioBriefDraftGenerateRequestSchema,
  StudioBriefDraftPatchRequestSchema,
  StudioBriefDraftPromotionReceiptRequestSchema,
  StudioBriefDraftPromotionReceiptResponseSchema,
  StudioBriefDraftPublishRequestSchema,
  StudioBriefDraftRefsReplaceRequestSchema,
  StudioBriefDraftRefsResolveRequestSchema,
  StudioBriefDraftRefsResolveResponseSchema,
  StudioBriefDraftRefsResponseSchema,
  StudioBriefDraftRetractRequestSchema,
  StudioBriefDraftReviewAnchorSchema,
  StudioBriefDraftReviewRequestSchema,
  StudioBriefDraftReviewSuggestionSchema,
  type StudioBriefDraftReviewThread,
  StudioBriefDraftReviewThreadSchema,
  StudioBriefDraftSchema,
  StudioBriefDraftValidationSchema,
  StudioBriefDraftValidationResponseSchema,
  StudioBriefDraftVersionRestoreRequestSchema,
  StudioBriefDraftVersionRestoreResponseSchema,
  StudioBriefDraftVerdictRequestSchema,
  StudioBriefEvidenceResponseSchema,
  StudioBriefGenerationJobResponseSchema,
  StudioBriefHistoryResponseSchema,
  StudioBriefPublishCandidateExportResponseSchema,
  type StudioBriefRef,
  StudioBriefRefSchema,
  StudioBriefResponseSchema,
  StudioBriefsResponseSchema,
  type StudioClaim,
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

type EmailSendBinding = {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
};

export type Env = {
  ASSETS?: Fetcher;
  DB?: D1Database;
  AI?: Ai;
  BRIEF_AUTHOR_AGENT?: DurableObjectNamespace<BriefAuthorAgent>;
  ARTIFACTS?: R2Bucket;
  GTFS_RT_RAW?: R2Bucket;
  MTA_BUS_TIME_API_KEY?: string;
  BASELINE_MONTH?: string;
  STUDIO_RELEASE_KEY?: string;
  STUDIO_AGENT_MODEL?: string;
  STUDIO_AGENT_MAX_STEPS?: string;
  LAST_BUILT_SPEED_MONTH?: string;
  GTFS_RT_SAMPLES_PER_CRON?: string;
  GTFS_RT_SAMPLE_SECONDS?: string;
  AUTH_EMAIL_FROM?: string;
  ENVIRONMENT?: string;
  EMAIL?: EmailSendBinding;
};

const STUDIO_BRIEF_AGENT_PROVIDER = "workers_ai";
const DEFAULT_STUDIO_BRIEF_AGENT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_STUDIO_BRIEF_AGENT_MAX_STEPS = 4;

type WorkersAiTextModelId = Parameters<ReturnType<typeof createWorkersAI>>[0];

function studioBriefAgentModelId(env: Env): string {
  const configured = env.STUDIO_AGENT_MODEL?.trim();
  return configured === undefined || configured.length === 0
    ? DEFAULT_STUDIO_BRIEF_AGENT_MODEL
    : configured;
}

function studioBriefAgentMaxSteps(env: Env): number {
  const parsed = Number.parseInt(env.STUDIO_AGENT_MAX_STEPS ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_STUDIO_BRIEF_AGENT_MAX_STEPS;
  return Math.max(2, Math.min(parsed, 8));
}

function studioBriefAgentInstanceName(record: D1StudioBriefDraftRecord): string {
  return `${record.draft.workspace_id ?? "public"}:${record.draft.brief_id}`;
}

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
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
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

// Real-user web-vitals beacon. Reports are emitted as structured JSON logs and
// read back through Workers Logs/Observability — no binding or storage needed.
// The RumReportSchema contract lives in @bp/domain and is shared with the browser reporter.
async function handleRumReport(request: Request): Promise<Response> {
  const parsed = RumReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorJson(400, "Invalid web-vitals report.");
  }

  const report = parsed.data;
  // Ignore path-only reports so empty beacons do not pollute the logs.
  if (
    report.ttfb === undefined &&
    report.fcp === undefined &&
    report.lcp === undefined &&
    report.cls === undefined
  ) {
    return new Response(null, { status: 204 });
  }

  console.log(
    JSON.stringify({
      message: "rum",
      path: report.path,
      ttfb: report.ttfb,
      fcp: report.fcp,
      lcp: report.lcp,
      cls: report.cls,
      nav: report.nav,
      country: (request.cf as { country?: string } | undefined)?.country,
    }),
  );

  return new Response(null, { status: 204 });
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
  // Local dev must never cache the SPA shell, or edits won't show without a hard reload.
  headers.set(
    "Cache-Control",
    isLocalDevHost(url.hostname) ? "no-store" : "public, max-age=60, stale-while-revalidate=300",
  );
  if (metadata.noindex) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return new Response(injectSeoIntoHtml(await response.text(), metadata, url.origin), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serveSpaFallback(request: Request, url: URL, assets: Fetcher): Promise<Response> {
  const response = await assets.fetch(request);
  if (response.status !== 404) {
    return withSpaSeo(request, url, response);
  }

  return withSpaSeo(
    request,
    url,
    await assets.fetch(new Request(new URL("/", request.url), request)),
  );
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

type StudioBriefProjection = z.output<typeof StudioBriefResponseSchema>;
type StudioFindingProjection = z.output<typeof StudioFindingResponseSchema>;
type StudioRouteDetailProjection = z.output<typeof StudioRouteDetailResponseSchema>;
type StudioOperatorSession = {
  identity: NonNullable<ResolvedIdentity["identity"]>;
  operator: NonNullable<ResolvedIdentity["operator"]>;
};
type DraftOperatorScope = Extract<
  StudioActorScope,
  "read:briefs" | "write:briefs" | "review:briefs" | "publish:briefs"
>;

const EmptyObjectSchema = z.object({}).strict();

function noStoreHeaders(): Headers {
  return new Headers({ "Cache-Control": "no-store" });
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: noStoreHeaders() });
}

function draftJson(body: unknown, init?: ResponseInit): Response {
  const headers = noStoreHeaders();
  for (const [key, value] of new Headers(init?.headers)) {
    headers.set(key, value);
  }
  return json(body, { ...init, headers });
}

async function parseJsonRequest<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<{ ok: true; data: z.output<TSchema> } | { ok: false; response: Response }> {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, response: errorJson(400, "Request body failed contract validation.") };
  }
  return { ok: true, data: parsed.data };
}

function parseClaimN(raw: string | undefined): number | Response {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 1 || `${value}` !== raw) {
    return errorJson(400, "Draft claim number must be a positive integer.");
  }
  return value;
}

function hasStudioScope(
  operator: StudioOperatorSession["operator"],
  scope: StudioActorScope,
): boolean {
  return operator.scopes.includes(scope);
}

async function requireStudioOperator(
  request: Request,
  env: Env,
  scope: DraftOperatorScope,
): Promise<StudioOperatorSession | Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const resolved = await resolveIdentity(request, env);
  if (resolved.identity === null) {
    return authError(401, "UNAUTHORIZED", "Sign in is required for Studio brief authoring.");
  }
  if (resolved.operator === null || !hasStudioScope(resolved.operator, scope)) {
    return authError(403, "FORBIDDEN", "Your Studio operator role cannot perform this action.");
  }
  return { identity: resolved.identity, operator: resolved.operator };
}

async function requireStudioOperatorWithAnyScope(
  request: Request,
  env: Env,
  scopes: readonly DraftOperatorScope[],
): Promise<StudioOperatorSession | Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const resolved = await resolveIdentity(request, env);
  if (resolved.identity === null) {
    return authError(401, "UNAUTHORIZED", "Sign in is required for Studio brief authoring.");
  }
  const operator = resolved.operator;
  if (operator === null || !scopes.some((scope) => hasStudioScope(operator, scope))) {
    return authError(403, "FORBIDDEN", "Your Studio operator role cannot perform this action.");
  }
  return { identity: resolved.identity, operator };
}

function requireD1Database(env: Env): D1Database | Response {
  return env.DB ?? errorJson(503, "D1 binding is not configured.");
}

function canReadDraftForOperator(
  record: D1StudioBriefDraftRecord,
  operator: StudioOperatorSession["operator"],
): boolean {
  return (
    hasStudioScope(operator, "read:briefs") &&
    (record.draft.workspace_id === null || record.draft.workspace_id === operator.workspaceId)
  );
}

function canWriteDraftForOperator(
  record: D1StudioBriefDraftRecord,
  operator: StudioOperatorSession["operator"],
): boolean {
  return record.draft.workspace_id === null || record.draft.workspace_id === operator.workspaceId;
}

async function loadStudioBriefProjection(
  env: Env,
  briefId: string,
): Promise<{ ok: true; data: StudioBriefProjection } | { ok: false; response: Response }> {
  const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
  if (briefs instanceof Response) {
    return { ok: false, response: briefs };
  }
  if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
    return { ok: false, response: errorJson(404, "Studio brief was not found.") };
  }

  const brief = await loadStudioProjection(
    env,
    `briefs/${briefId}/index.json`,
    StudioBriefResponseSchema,
  );
  return brief instanceof Response ? { ok: false, response: brief } : { ok: true, data: brief };
}

async function loadStudioRouteProjection(
  env: Env,
  routeSlug: string,
): Promise<
  | {
      ok: true;
      route: StudioRoute;
      quality: z.infer<typeof StudioRoutesResponseSchema>["quality"];
      generatedAt: string;
    }
  | { ok: false; response: Response }
> {
  const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
  if (routes instanceof Response) {
    return { ok: false, response: routes };
  }
  const route = getStudioRoute(routes, routeSlug);
  if (route === undefined) {
    return { ok: false, response: errorJson(404, "Studio route was not found.") };
  }
  return { ok: true, route, quality: routes.quality, generatedAt: routes.generatedAt };
}

async function loadStudioFindingProjection(
  env: Env,
  findingId: string,
): Promise<{ ok: true; data: StudioFindingProjection } | { ok: false; response: Response }> {
  const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
  if (findings instanceof Response) {
    return { ok: false, response: findings };
  }
  if (!findings.findings.some(({ finding }) => finding.id === findingId)) {
    return { ok: false, response: errorJson(404, "Studio finding was not found.") };
  }

  const finding = await loadStudioProjection(
    env,
    `findings/${findingId}/index.json`,
    StudioFindingResponseSchema,
  );
  return finding instanceof Response
    ? { ok: false, response: finding }
    : { ok: true, data: finding };
}

async function maybeLoadStudioRouteDetailProjection(
  env: Env,
  routeSlug: string,
): Promise<StudioRouteDetailProjection | null> {
  const detail = await loadStudioProjection(
    env,
    `routes/${routeSlug}/index.json`,
    StudioRouteDetailResponseSchema,
  );
  return detail instanceof Response ? null : detail;
}

function briefSectionsToMarkdown(sections: StudioBrief["sections"]): string {
  return sections
    .map((section) => {
      const lines = [
        `## ${section.title}`,
        ...(section.sub === undefined ? [] : [section.sub]),
        ...section.body,
        ...(section.callout === undefined
          ? []
          : [`> **${section.callout.title}** ${section.callout.body}`]),
        ...(section.figure === undefined
          ? []
          : [`:::${section.figure.kind}{label="${section.figure.label}"}`]),
      ];
      return lines.filter((line) => line.trim().length > 0).join("\n\n");
    })
    .join("\n\n");
}

function draftClaimToStudioClaim(row: D1StudioBriefDraftClaimRow): StudioClaim {
  return {
    n: row.claim_n,
    title: row.title,
    ...(row.body === null ? {} : { body: row.body }),
    strength: row.strength,
    evidenceIds: parseDraftStringArray(row.evidence_ids_json),
    caveatIds: parseDraftStringArray(row.caveat_ids_json),
    ...(row.state === null ? {} : { state: row.state }),
  };
}

function draftBlockToStudioBlock(row: D1StudioBriefDraftBlockRow): StudioBriefBlock {
  return StudioBriefBlockSchema.parse(JSON.parse(row.block_json));
}

function draftRefToStudioBriefRef(row: D1StudioBriefDraftRecord["refs"][number]): StudioBriefRef {
  return StudioBriefRefSchema.parse(JSON.parse(row.ref_json));
}

function draftRecordToStudioDraft(record: D1StudioBriefDraftRecord): StudioBriefDraft {
  return StudioBriefDraftSchema.parse({
    briefId: record.draft.brief_id,
    routeSlug: record.draft.route_slug,
    workspaceId: record.draft.workspace_id,
    sourceBriefId: record.draft.source_brief_id,
    fromFindingId: record.draft.from_finding_id,
    status: record.draft.status,
    title: record.draft.title,
    dek: record.draft.dek,
    summary: record.draft.summary,
    bodyMd: record.draft.body_md,
    version: record.draft.version,
    jobId: record.draft.job_id,
    jobStatus: record.draft.job_status,
    jobGenerationMode: record.draft.job_generation_mode,
    jobLlmStatus: record.draft.job_llm_status,
    jobLlmProvider: record.draft.job_llm_provider,
    jobLlmModel: record.draft.job_llm_model,
    jobStartedAt: record.draft.job_started_at,
    jobCompletedAt: record.draft.job_completed_at,
    jobError: record.draft.job_error,
    validationScore: record.draft.validation_score,
    validationWeakClaims: parseDraftNumberArray(record.draft.validation_weak_claims_json),
    validationMissingEvidence: parseDraftNumberArray(record.draft.validation_missing_evidence_json),
    validationBlockingIssues: parseDraftStringArray(
      record.draft.validation_blocking_issues_json ?? "[]",
    ),
    lastValidatedAt: record.draft.last_validated_at,
    createdAt: record.draft.created_at,
    updatedAt: record.draft.updated_at,
    publishedAt: record.draft.published_at,
    promotionCandidateId: record.draft.promotion_candidate_id,
    promotionTargetBriefId: record.draft.promotion_target_brief_id,
    promotionArtifactKey: record.draft.promotion_artifact_key,
    promotionArtifactSha256: record.draft.promotion_artifact_sha256,
    promotionRecordedAt: record.draft.promotion_recorded_at,
    claims: record.claims.map(draftClaimToStudioClaim),
    blocks: record.blocks.map(draftBlockToStudioBlock),
    refs: record.refs.map(draftRefToStudioBriefRef),
  });
}

function parseAgentTriggerJson(
  row: D1StudioBriefAgentRunRow,
): z.output<typeof StudioBriefAgentTriggerSchema> {
  try {
    return StudioBriefAgentTriggerSchema.parse(JSON.parse(row.trigger_json));
  } catch {
    return StudioBriefAgentTriggerSchema.parse({});
  }
}

function agentRunRowToStudioAgentRun(row: D1StudioBriefAgentRunRow): StudioBriefAgentRun {
  return StudioBriefAgentRunResponseSchema.shape.run.parse({
    runId: row.run_id,
    briefId: row.brief_id,
    workspaceId: row.workspace_id,
    status: row.status,
    intent: row.intent,
    baseVersionId: row.base_version_id,
    baseContentHash: row.base_content_hash,
    trigger: parseAgentTriggerJson(row),
    actorId: row.actor_id,
    actorDisplayName: row.actor_display_name,
    modelProvider: row.model_provider,
    modelId: row.model_id,
    promptHash: row.prompt_hash,
    proposalId: row.proposal_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
}

function parseAgentProposalOperations(
  row: D1StudioBriefAgentProposalRow,
): StudioBriefAgentOperation[] {
  try {
    return z.array(StudioBriefAgentOperationSchema).parse(JSON.parse(row.operations_json));
  } catch {
    return [];
  }
}

function parseAgentProposalValidation(
  row: D1StudioBriefAgentProposalRow,
): z.output<typeof StudioBriefDraftValidationSchema> | null {
  if (row.validation_json === null) return null;
  try {
    return StudioBriefDraftValidationSchema.parse(JSON.parse(row.validation_json));
  } catch {
    return null;
  }
}

function parseAgentProposalProvenance(
  row: D1StudioBriefAgentProposalRow,
): z.output<typeof StudioBriefAgentProvenanceSchema> {
  try {
    return StudioBriefAgentProvenanceSchema.parse(JSON.parse(row.provenance_json));
  } catch {
    return StudioBriefAgentProvenanceSchema.parse({
      modelProvider: null,
      modelId: null,
      promptHash: null,
      evidenceRefs: [],
    });
  }
}

function parseAcceptedOperationIds(row: D1StudioBriefAgentProposalRow): string[] {
  if (row.accepted_operation_ids_json === null) return [];
  try {
    return z.array(z.string()).parse(JSON.parse(row.accepted_operation_ids_json));
  } catch {
    return [];
  }
}

function agentProposalRowToStudioAgentProposal(
  row: D1StudioBriefAgentProposalRow,
): StudioBriefAgentProposal {
  return StudioBriefAgentProposalResponseSchema.shape.proposal.parse({
    proposalId: row.proposal_id,
    runId: row.run_id,
    briefId: row.brief_id,
    status: row.status,
    baseVersionId: row.base_version_id,
    baseContentHash: row.base_content_hash,
    title: row.title,
    summary: row.summary,
    operations: parseAgentProposalOperations(row),
    validation: parseAgentProposalValidation(row),
    previewHash: row.preview_hash,
    provenance: parseAgentProposalProvenance(row),
    acceptedOperationIds: parseAcceptedOperationIds(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at,
    rejectedAt: row.rejected_at,
  });
}

function draftVersionRowToStudioDraftVersion(
  row: D1StudioBriefDraftVersionRow,
): StudioBriefDraftVersion {
  return {
    versionId: row.version_id,
    briefId: row.brief_id,
    parentVersionId: row.parent_version_id,
    contentHash: row.content_hash,
    actorId: row.actor_id,
    actorType: row.actor_type,
    reason: row.reason,
    sourceRunId: row.source_run_id,
    sourceProposalId: row.source_proposal_id,
    validationScore: row.validation_score,
    snapshotRef: {
      storage: row.snapshot_storage,
      key: row.snapshot_key,
      sha256: row.snapshot_sha256,
    },
    createdAt: row.created_at,
  };
}

function draftStatusToBriefStatus(status: StudioBriefDraft["status"]): StudioBrief["status"] {
  if (status === "published") return "Published";
  if (status === "in_review" || status === "approved" || status === "publish_candidate") {
    return "In review";
  }
  return "Draft";
}

function overlayDraftOnBrief(
  projection: StudioBriefProjection,
  record: D1StudioBriefDraftRecord,
): StudioBriefProjection {
  const draft = draftRecordToStudioDraft(record);
  return StudioBriefResponseSchema.parse({
    ...projection,
    brief: {
      ...projection.brief,
      title: draft.title,
      dek: draft.dek,
      summary: draft.summary,
      ...(draft.bodyMd === null ? {} : { bodyMd: draft.bodyMd }),
      version: draft.version,
      generated: draft.updatedAt,
      status: draftStatusToBriefStatus(draft.status),
      claims: draft.claims,
      blocks: draft.blocks,
      refs: draft.refs,
    },
    draftStatus: draft.status,
    draftPublishedAt: draft.publishedAt,
  });
}

function draftRecordToBriefProjection(
  record: D1StudioBriefDraftRecord,
  route: StudioRoute,
  quality: z.infer<typeof StudioRoutesResponseSchema>["quality"],
): StudioBriefProjection {
  const draft = draftRecordToStudioDraft(record);
  const citedEvidenceIds = new Set(draft.claims.flatMap((claim) => claim.evidenceIds));
  return StudioBriefResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: draft.updatedAt,
    brief: {
      id: draft.briefId,
      routeSlug: draft.routeSlug,
      title: draft.title,
      status: draftStatusToBriefStatus(draft.status),
      version: draft.version,
      generated: draft.updatedAt,
      authors: ["Studio draft"],
      citationCount: citedEvidenceIds.size,
      summary: draft.summary,
      dek: draft.dek,
      kpis: [],
      sections: [
        {
          title: "Draft",
          body: [draft.summary],
        },
      ],
      claims: draft.claims,
      evidence: [],
      caveats: [],
      ...(draft.bodyMd === null ? {} : { bodyMd: draft.bodyMd }),
      blocks: draft.blocks,
      refs: draft.refs,
    },
    route,
    versions: [],
    comments: [],
    quality,
    draftStatus: draft.status,
    draftPublishedAt: draft.publishedAt,
  });
}

async function maybeOverlayStudioBriefDraft(
  request: Request,
  env: Env,
  projection: StudioBriefProjection,
): Promise<StudioBriefProjection> {
  if (env.DB === undefined) {
    return projection;
  }

  const resolved = await resolveIdentity(request, env);
  if (resolved.identity === null || resolved.operator === null) {
    return projection;
  }

  const record = await getStudioBriefDraftRecord(env.DB, projection.brief.id);
  if (record === null || !canReadDraftForOperator(record, resolved.operator)) {
    return projection;
  }

  return overlayDraftOnBrief(projection, record);
}

async function maybeLoadDraftOnlyBriefProjection(
  request: Request,
  env: Env,
  briefId: string,
): Promise<StudioBriefProjection | Response | null> {
  if (env.DB === undefined) return null;

  const resolved = await resolveIdentity(request, env);
  if (resolved.identity === null || resolved.operator === null) return null;

  const record = await getStudioBriefDraftRecord(env.DB, briefId);
  if (record === null || !canReadDraftForOperator(record, resolved.operator)) return null;

  const route = await loadStudioRouteProjection(env, record.draft.route_slug);
  if (!route.ok) return route.response;

  return draftRecordToBriefProjection(record, route.route, route.quality);
}

function actorName(session: StudioOperatorSession): string {
  return session.identity.displayName ?? session.identity.email;
}

async function appendStudioBriefDraftHistory(
  env: Env,
  record: D1StudioBriefDraftRecord,
  session: StudioOperatorSession,
  action: string,
  summary: string,
  createdAt: string,
): Promise<void> {
  await appendStudioBriefDraftHistoryForActor(
    env,
    record,
    actorName(session),
    action,
    summary,
    createdAt,
  );
}

async function appendStudioBriefDraftHistoryForActor(
  env: Env,
  record: D1StudioBriefDraftRecord,
  actor: string,
  action: string,
  summary: string,
  createdAt: string,
): Promise<void> {
  if (env.DB === undefined) return;
  await insertStudioBriefHistoryEvent(env.DB, {
    eventId: randomToken(16),
    briefId: record.draft.brief_id,
    action,
    actor,
    summary,
    draftVersion: record.draft.version,
    snapshotJson: JSON.stringify(draftRecordToStudioDraft(record)),
    createdAt,
  });
}

async function ensureStudioBriefDraftRecord(
  env: Env,
  session: StudioOperatorSession,
  briefId: string,
  now: string,
): Promise<D1StudioBriefDraftRecord | Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const existing = await getStudioBriefDraftRecord(env.DB, briefId);
  if (existing !== null) {
    if (!canWriteDraftForOperator(existing, session.operator)) {
      return authError(403, "FORBIDDEN", "This draft belongs to a different Studio workspace.");
    }
    return existing;
  }

  const projection = await loadStudioBriefProjection(env, briefId);
  if (!projection.ok) {
    return projection.response;
  }

  await insertStudioBriefDraft(env.DB, {
    briefId,
    routeSlug: projection.data.brief.routeSlug,
    sourceBriefId: briefId,
    workspaceId: session.operator.workspaceId,
    fromFindingId: null,
    status: "draft",
    title: projection.data.brief.title,
    dek: projection.data.brief.dek,
    summary: projection.data.brief.summary,
    bodyMd: projection.data.brief.bodyMd ?? briefSectionsToMarkdown(projection.data.brief.sections),
    version: projection.data.brief.version,
    jobId: randomToken(12),
    jobStatus: "succeeded",
    jobGenerationMode: "deterministic_seed",
    jobLlmStatus: "not_configured",
    jobStartedAt: now,
    jobCompletedAt: now,
    jobError: null,
    createdAt: now,
    updatedAt: now,
  });

  for (const claim of projection.data.brief.claims) {
    await insertStudioBriefDraftClaim(env.DB, {
      briefId,
      claimN: claim.n,
      title: claim.title,
      body: claim.body ?? null,
      strength: claim.strength,
      evidenceIds: claim.evidenceIds,
      caveatIds: claim.caveatIds,
      state: claim.state ?? "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  const created = await getStudioBriefDraftRecord(env.DB, briefId);
  if (created === null) {
    return errorJson(503, "Studio brief draft could not be initialized.");
  }
  await appendStudioBriefDraftHistory(
    env,
    created,
    session,
    "draft.created",
    "Draft initialized.",
    now,
  );
  return created;
}

async function getRequiredDraftRecord(
  env: Env,
  session: StudioOperatorSession,
  briefId: string,
): Promise<D1StudioBriefDraftRecord | Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }
  const record = await getStudioBriefDraftRecord(env.DB, briefId);
  if (record === null) {
    return errorJson(404, "Studio brief draft was not found.");
  }
  if (!canWriteDraftForOperator(record, session.operator)) {
    return authError(403, "FORBIDDEN", "This draft belongs to a different Studio workspace.");
  }
  return record;
}

type StudioBriefCreateSeed = {
  route: StudioRoute;
  sourceBriefId: string | null;
  fromFindingId: string | null;
  title: string;
  dek: string;
  summary: string;
  bodyMd: string;
  claims: StudioClaim[];
};

function seededBriefId(routeSlug: string): string {
  return `draft-${routeSlug}-${randomToken(6).toLowerCase().replace(/_/g, "-")}`;
}

function routeDraftBody(route: StudioRoute): string {
  return `## Working thesis\n\n${route.diagnosis}`;
}

async function resolveStudioBriefCreateSeed(
  env: Env,
  input: z.output<typeof StudioBriefCreateRequestSchema>,
): Promise<StudioBriefCreateSeed | Response> {
  if (input.sourceBriefId !== undefined && input.sourceBriefId !== null) {
    const source = await loadStudioBriefProjection(env, input.sourceBriefId);
    if (!source.ok) return source.response;
    if (input.routeSlug !== undefined && input.routeSlug !== source.data.brief.routeSlug) {
      return errorJson(400, "routeSlug must match the source brief route.");
    }
    return {
      route: source.data.route,
      sourceBriefId: input.sourceBriefId,
      fromFindingId: input.fromFindingId ?? null,
      title: input.title ?? `${source.data.brief.title} (draft)`,
      dek: input.dek ?? source.data.brief.dek,
      summary: input.summary ?? source.data.brief.summary,
      bodyMd:
        input.bodyMd ??
        source.data.brief.bodyMd ??
        briefSectionsToMarkdown(source.data.brief.sections),
      claims: source.data.brief.claims,
    };
  }

  if (input.fromFindingId !== undefined && input.fromFindingId !== null) {
    const finding = await loadStudioFindingProjection(env, input.fromFindingId);
    if (!finding.ok) return finding.response;
    if (input.routeSlug !== undefined && input.routeSlug !== finding.data.finding.routeSlug) {
      return errorJson(400, "routeSlug must match the finding route.");
    }
    return {
      route: finding.data.route,
      sourceBriefId: input.sourceBriefId ?? null,
      fromFindingId: input.fromFindingId,
      title: input.title ?? finding.data.finding.title,
      dek: input.dek ?? finding.data.finding.metric,
      summary: input.summary ?? finding.data.finding.body,
      bodyMd:
        input.bodyMd ??
        `## ${finding.data.finding.title}\n\n${finding.data.finding.body}\n\n> **${finding.data.finding.caveat.title}** ${finding.data.finding.caveat.body}`,
      claims: [
        {
          n: 1,
          title: finding.data.finding.title,
          body: finding.data.finding.body,
          strength: finding.data.finding.confidence === "high" ? 80 : 65,
          evidenceIds: [],
          caveatIds: [],
          state: finding.data.finding.confidence === "high" ? "active" : "weak",
        },
      ],
    };
  }

  const routeSlug = input.routeSlug;
  if (routeSlug === undefined) {
    return errorJson(
      400,
      "routeSlug is required when no source brief or finding seed is provided.",
    );
  }
  const route = await loadStudioRouteProjection(env, routeSlug);
  if (!route.ok) return route.response;
  return {
    route: route.route,
    sourceBriefId: input.sourceBriefId ?? null,
    fromFindingId: input.fromFindingId ?? null,
    title: input.title ?? `${route.route.label} draft brief`,
    dek: input.dek ?? route.route.corridor,
    summary: input.summary ?? route.route.diagnosis,
    bodyMd: input.bodyMd ?? routeDraftBody(route.route),
    claims: [],
  };
}

async function handleStudioBriefCreate(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireStudioOperator(request, env, "write:briefs");
  if (session instanceof Response) return session;
  const database = requireD1Database(env);
  if (database instanceof Response) return database;
  const body = await parseJsonRequest(request, StudioBriefCreateRequestSchema);
  if (!body.ok) return body.response;

  return withStudioBriefDraftIdempotency(request, env, url, async () => {
    const now = new Date().toISOString();
    const seed = await resolveStudioBriefCreateSeed(env, body.data);
    if (seed instanceof Response) return seed;
    const briefId = seededBriefId(seed.route.slug);
    await insertStudioBriefDraft(database, {
      briefId,
      routeSlug: seed.route.slug,
      sourceBriefId: seed.sourceBriefId,
      workspaceId: session.operator.workspaceId,
      fromFindingId: seed.fromFindingId,
      status: "draft",
      title: seed.title,
      dek: seed.dek,
      summary: seed.summary,
      bodyMd: seed.bodyMd,
      version: "draft-1",
      jobId: randomToken(12),
      jobStatus: "succeeded",
      jobGenerationMode: "deterministic_seed",
      jobLlmStatus: "not_configured",
      jobStartedAt: now,
      jobCompletedAt: now,
      jobError: null,
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, claim] of seed.claims.entries()) {
      await insertStudioBriefDraftClaim(database, {
        briefId,
        claimN: index + 1,
        title: claim.title,
        body: claim.body ?? null,
        strength: claim.strength,
        evidenceIds: claim.evidenceIds,
        caveatIds: claim.caveatIds,
        state: claim.state ?? "editing",
        createdAt: now,
        updatedAt: now,
      });
    }

    const created = await getRequiredDraftRecord(env, session, briefId);
    if (created instanceof Response) return created;
    await appendStudioBriefDraftHistory(
      env,
      created,
      session,
      "draft.created",
      "Draft brief created.",
      now,
    );
    return draftJson(
      StudioBriefCreateResponseSchema.parse({ draft: draftRecordToStudioDraft(created) }),
    );
  });
}

type BodyBlockDirective = {
  blockId: string | null;
  directive: string;
  expectedType: StudioBriefBlock["type"];
};

const StudioBriefBlockDirectiveTypes = new Set<StudioBriefBlock["type"]>([
  "segment-card",
  "before-after",
  "projection",
  "data-lineage",
  "finding",
  "key-takeaways",
  "mentioned-routes",
  "rich-sub-brief",
  "hour-figure",
]);

function extractBodyBlockDirectives(bodyMd: string): BodyBlockDirective[] {
  const directives: BodyBlockDirective[] = [];
  const directivePattern = /:::\s*([a-z][a-z0-9-]*)\s*\{([^}]*)\}/gi;
  const refPattern = /\bref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s}]+))/i;
  for (const match of bodyMd.matchAll(directivePattern)) {
    const directive = match[1] ?? "";
    if (!StudioBriefBlockDirectiveTypes.has(directive as StudioBriefBlock["type"])) {
      continue;
    }
    const refMatch = refPattern.exec(match[2] ?? "");
    directives.push({
      directive,
      expectedType: directive as StudioBriefBlock["type"],
      blockId: refMatch === null ? null : (refMatch[1] ?? refMatch[2] ?? refMatch[3] ?? null),
    });
  }
  return directives;
}

function calculateBodyMarkdownBlockingIssues(record: D1StudioBriefDraftRecord): string[] {
  const bodyMd = record.draft.body_md;
  if (bodyMd === null) return [];
  if (bodyMd.trim().length === 0) return ["Draft body markdown is empty."];

  const blocksById = new Map(record.blocks.map((block) => [block.block_id, block]));
  return extractBodyBlockDirectives(bodyMd).flatMap((directive) => {
    if (directive.blockId === null || directive.blockId.trim().length === 0) {
      return [`Body markdown embeds ${directive.directive} without a ref.`];
    }
    const block = blocksById.get(directive.blockId);
    if (block === undefined) {
      return [`Body markdown references missing block ${directive.blockId}.`];
    }
    if (block.block_type !== directive.expectedType) {
      return [
        `Body markdown references block ${directive.blockId} as ${directive.expectedType}, but the block is ${block.block_type}.`,
      ];
    }
    return [];
  });
}

function calculateStudioBriefDraftValidation(
  record: D1StudioBriefDraftRecord,
  validatedAt: string,
) {
  const weakClaims = record.claims
    .filter((claim) => claim.strength < 70 || claim.state === "weak")
    .map((claim) => claim.claim_n);
  const missingEvidence = record.claims
    .filter((claim) => parseDraftStringArray(claim.evidence_ids_json).length === 0)
    .map((claim) => claim.claim_n);
  const blockingIssues = [
    ...(record.claims.length === 0 ? ["Draft must include at least one claim."] : []),
    ...(record.draft.title.trim().length === 0 ? ["Draft title is required."] : []),
    ...(record.draft.summary.trim().length === 0 ? ["Draft summary is required."] : []),
    ...storedDraftRefs(record)
      .filter((ref) => ref.kind === "unresolved")
      .map((ref) => `Draft ref ${ref.id} is unresolved${ref.reason ? `: ${ref.reason}` : "."}`),
    ...(openBlockingReviewThreads(record).length === 0
      ? []
      : [`${openBlockingReviewThreads(record).length} blocking review item(s) remain open.`]),
    ...calculateBodyMarkdownBlockingIssues(record),
  ];
  const score = Math.max(
    0,
    100 - weakClaims.length * 15 - missingEvidence.length * 20 - blockingIssues.length * 25,
  );
  return {
    score,
    weakClaims,
    missingEvidence,
    blockingIssues,
    validatedAt,
  };
}

async function studioBriefDraftContentHash(record: D1StudioBriefDraftRecord): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      title: record.draft.title,
      dek: record.draft.dek,
      summary: record.draft.summary,
      bodyMd: record.draft.body_md,
      claims: record.claims.map(draftClaimToStudioClaim),
      blocks: record.blocks.map(draftBlockToStudioBlock),
      refs: storedDraftRefs(record),
    }),
  );
}

function draftVersionSnapshotKey(briefId: string, versionId: string): string {
  return `studio-brief-draft:${briefId}:${versionId}`;
}

async function insertDraftVersionMilestone(
  database: D1Database,
  input: {
    record: D1StudioBriefDraftRecord;
    versionId: string;
    parentVersionId: string | null;
    actorId: string;
    actorType: "human" | "agent" | "system";
    reason:
      | "draft_created"
      | "manual_edit"
      | "agent_proposal_applied"
      | "suggestion_accepted"
      | "publish_candidate"
      | "promotion_receipt"
      | "restored";
    sourceRunId?: string | null;
    sourceProposalId?: string | null;
    createdAt: string;
  },
): Promise<D1StudioBriefDraftVersionRow> {
  const snapshot = draftRecordToStudioDraft(input.record);
  const snapshotJson = JSON.stringify(snapshot);
  const snapshotSha256 = await sha256Hex(snapshotJson);
  const contentHash = await studioBriefDraftContentHash(input.record);
  const snapshotKey = draftVersionSnapshotKey(input.record.draft.brief_id, input.versionId);
  await insertStudioBriefDraftVersionSnapshot(database, {
    snapshotKey,
    briefId: input.record.draft.brief_id,
    snapshotJson,
    createdAt: input.createdAt,
  });
  await insertStudioBriefDraftVersion(database, {
    versionId: input.versionId,
    briefId: input.record.draft.brief_id,
    parentVersionId: input.parentVersionId,
    contentHash,
    actorId: input.actorId,
    actorType: input.actorType,
    reason: input.reason,
    sourceRunId: input.sourceRunId ?? null,
    sourceProposalId: input.sourceProposalId ?? null,
    validationScore: input.record.draft.validation_score,
    snapshotStorage: "d1",
    snapshotKey,
    snapshotSha256,
    createdAt: input.createdAt,
  });
  const version = await getStudioBriefDraftVersion(database, {
    briefId: input.record.draft.brief_id,
    versionId: input.versionId,
  });
  if (version === null) {
    throw new Error("Studio brief draft version could not be read after insert.");
  }
  return version;
}

async function writeStudioBriefDraftSnapshotContent(
  database: D1Database,
  input: {
    briefId: string;
    snapshot: StudioBriefDraft;
    updatedAt: string;
    version: string;
  },
): Promise<void> {
  await updateStudioBriefDraftMetadata(database, {
    briefId: input.briefId,
    updatedAt: input.updatedAt,
    title: input.snapshot.title,
    dek: input.snapshot.dek,
    summary: input.snapshot.summary,
    bodyMd: input.snapshot.bodyMd,
    status: "draft",
    version: input.version,
  });
  await replaceStudioBriefDraftClaims(database, {
    briefId: input.briefId,
    claims: input.snapshot.claims.map((claim) => ({
      claimN: claim.n,
      title: claim.title,
      body: claim.body ?? null,
      strength: claim.strength,
      evidenceIds: claim.evidenceIds,
      caveatIds: claim.caveatIds,
      state: claim.state ?? null,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    })),
  });
  await replaceStudioBriefDraftBlocks(database, {
    briefId: input.briefId,
    blocks: input.snapshot.blocks.map((block) => ({
      blockId: block.id,
      blockType: block.type,
      blockJson: JSON.stringify(block),
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    })),
  });
  await replaceResolvedDraftRefs(database, {
    briefId: input.briefId,
    refs: input.snapshot.refs,
    updatedAt: input.updatedAt,
  });
}

function cloneDraftRecordForPreview(record: D1StudioBriefDraftRecord): D1StudioBriefDraftRecord {
  return {
    draft: { ...record.draft },
    claims: record.claims.map((claim) => ({ ...claim })),
    blocks: record.blocks.map((block) => ({ ...block })),
    refs: record.refs.map((ref) => ({ ...ref })),
    reviewComments: record.reviewComments.map((comment) => ({ ...comment })),
  };
}

function proposalFeedbackError(
  code: string,
  path: string,
  message: string,
  retryable = true,
): StudioBriefAgentProposalError {
  return { code, path, message, retryable };
}

function zodIssuesToProposalErrors(error: z.ZodError): StudioBriefAgentProposalError[] {
  return error.issues.map((issue) =>
    proposalFeedbackError(
      "schema_invalid",
      issue.path.map((part) => String(part)).join("."),
      issue.message,
      true,
    ),
  );
}

function replaceBodyRangeForProposal(
  bodyMd: string,
  operation: Extract<StudioBriefAgentOperation, { type: "replace_body_range" }>,
): string | StudioBriefAgentProposalError {
  if (operation.anchor.target !== "body") {
    return proposalFeedbackError(
      "unsupported_anchor_target",
      `operations.${operation.opId}.anchor.target`,
      "replace_body_range can only target body markdown in v1.",
    );
  }
  const quote = operation.anchor.quote;
  if (quote !== null) {
    const matches = countOccurrences(bodyMd, quote.exact);
    if (matches === 0) {
      return proposalFeedbackError(
        "selector_missing",
        `operations.${operation.opId}.anchor.quote.exact`,
        "The selected body text was not found in the current draft.",
      );
    }
    if (matches > 1) {
      return proposalFeedbackError(
        "selector_ambiguous",
        `operations.${operation.opId}.anchor.quote.exact`,
        "The selected body text appears more than once in the current draft.",
      );
    }
    return bodyMd.replace(quote.exact, operation.replaceWith);
  }
  const range = operation.anchor.range;
  if (range === undefined) {
    return proposalFeedbackError(
      "selector_required",
      `operations.${operation.opId}.anchor`,
      "replace_body_range requires an exact quote or range.",
    );
  }
  if (range.end > bodyMd.length) {
    return proposalFeedbackError(
      "selector_out_of_bounds",
      `operations.${operation.opId}.anchor.range`,
      "The selected body range is outside the current draft.",
    );
  }
  return `${bodyMd.slice(0, range.start)}${operation.replaceWith}${bodyMd.slice(range.end)}`;
}

function applyOperationsForProposalPreview(
  record: D1StudioBriefDraftRecord,
  operations: StudioBriefAgentOperation[],
  now: string,
): { preview: D1StudioBriefDraftRecord; errors: StudioBriefAgentProposalError[] } {
  const preview = cloneDraftRecordForPreview(record);
  const errors: StudioBriefAgentProposalError[] = [];
  const seenOperationIds = new Set<string>();

  for (const operation of operations) {
    if (seenOperationIds.has(operation.opId)) {
      errors.push(
        proposalFeedbackError(
          "duplicate_operation_id",
          `operations.${operation.opId}`,
          "Operation ids must be unique within a proposal.",
        ),
      );
      continue;
    }
    seenOperationIds.add(operation.opId);

    if (operation.type === "replace_body_md") {
      preview.draft.body_md = operation.bodyMd;
      preview.draft.updated_at = now;
      continue;
    }

    if (operation.type === "replace_body_range") {
      const nextBody = replaceBodyRangeForProposal(preview.draft.body_md ?? "", operation);
      if (typeof nextBody === "string") {
        preview.draft.body_md = nextBody;
        preview.draft.updated_at = now;
      } else {
        errors.push(nextBody);
      }
      continue;
    }

    if (operation.type === "upsert_block") {
      const block = StudioBriefBlockSchema.safeParse(operation.block);
      if (!block.success) {
        errors.push(
          ...zodIssuesToProposalErrors(block.error).map((error) => ({
            ...error,
            path: `operations.${operation.opId}.block${error.path ? `.${error.path}` : ""}`,
          })),
        );
        continue;
      }
      const blockRow = {
        brief_id: record.draft.brief_id,
        block_id: block.data.id,
        block_type: block.data.type,
        block_json: JSON.stringify(block.data),
        created_at: now,
        updated_at: now,
      };
      const existingIndex = preview.blocks.findIndex(
        (existing) => existing.block_id === block.data.id,
      );
      if (existingIndex >= 0) {
        preview.blocks[existingIndex] = {
          ...blockRow,
          created_at: preview.blocks[existingIndex]?.created_at ?? now,
        };
      } else {
        preview.blocks.push(blockRow);
      }
      preview.draft.updated_at = now;
      continue;
    }

    if (operation.type === "delete_block") {
      if (!preview.blocks.some((block) => block.block_id === operation.blockId)) {
        errors.push(
          proposalFeedbackError(
            "block_missing",
            `operations.${operation.opId}.blockId`,
            "The block to delete does not exist in the current draft.",
          ),
        );
        continue;
      }
      preview.blocks = preview.blocks.filter((block) => block.block_id !== operation.blockId);
      preview.refs = preview.refs.filter((ref) => {
        if (ref.ref_kind !== "block") return true;
        const parsed = StudioBriefRefSchema.safeParse(JSON.parse(ref.ref_json));
        return (
          !parsed.success ||
          parsed.data.kind !== "block" ||
          parsed.data.blockId !== operation.blockId
        );
      });
      preview.draft.updated_at = now;
      continue;
    }

    if (operation.type === "replace_refs") {
      const refs = z.array(StudioBriefRefSchema).safeParse(operation.refs);
      if (!refs.success) {
        errors.push(
          ...zodIssuesToProposalErrors(refs.error).map((error) => ({
            ...error,
            path: `operations.${operation.opId}.refs${error.path ? `.${error.path}` : ""}`,
          })),
        );
        continue;
      }
      preview.refs = uniqueRefsById(refs.data).map((ref) => ({
        brief_id: record.draft.brief_id,
        ref_id: ref.id,
        ref_kind: ref.kind,
        ref_json: JSON.stringify(ref),
        created_at: now,
        updated_at: now,
      }));
      preview.draft.updated_at = now;
      continue;
    }

    if (operation.type === "upsert_claim") {
      const claimN =
        operation.claim.claimN ?? Math.max(0, ...preview.claims.map((claim) => claim.claim_n)) + 1;
      const existingIndex = preview.claims.findIndex((claim) => claim.claim_n === claimN);
      const nextClaim = {
        brief_id: record.draft.brief_id,
        claim_n: claimN,
        title: operation.claim.title,
        body: operation.claim.body ?? null,
        strength: operation.claim.strength,
        evidence_ids_json: JSON.stringify(operation.claim.evidenceIds),
        caveat_ids_json: JSON.stringify(operation.claim.caveatIds),
        state: operation.claim.state ?? "editing",
        created_at: now,
        updated_at: now,
      };
      if (existingIndex >= 0) {
        preview.claims[existingIndex] = {
          ...nextClaim,
          created_at: preview.claims[existingIndex]?.created_at ?? now,
        };
      } else if (claimN === Math.max(0, ...preview.claims.map((claim) => claim.claim_n)) + 1) {
        preview.claims.push(nextClaim);
      } else {
        errors.push(
          proposalFeedbackError(
            "claim_missing",
            `operations.${operation.opId}.claim.claimN`,
            "The claim to update does not exist in the current draft.",
          ),
        );
      }
      preview.claims.sort((left, right) => left.claim_n - right.claim_n);
      preview.draft.updated_at = now;
      continue;
    }

    if (operation.type === "delete_claim") {
      if (!preview.claims.some((claim) => claim.claim_n === operation.claimN)) {
        errors.push(
          proposalFeedbackError(
            "claim_missing",
            `operations.${operation.opId}.claimN`,
            "The claim to delete does not exist in the current draft.",
          ),
        );
        continue;
      }
      preview.claims = preview.claims
        .filter((claim) => claim.claim_n !== operation.claimN)
        .map((claim) =>
          claim.claim_n > operation.claimN
            ? { ...claim, claim_n: claim.claim_n - 1, updated_at: now }
            : claim,
        );
      preview.draft.updated_at = now;
      continue;
    }

    const parent = preview.reviewComments.find(
      (comment) => comment.comment_id === operation.commentId && comment.parent_comment_id === null,
    );
    if (parent === undefined) {
      errors.push(
        proposalFeedbackError(
          "review_thread_missing",
          `operations.${operation.opId}.commentId`,
          "The review thread to reply to does not exist in the current draft.",
        ),
      );
      continue;
    }
    preview.reviewComments.push({
      comment_id: `preview-${operation.opId}`,
      brief_id: record.draft.brief_id,
      parent_comment_id: operation.commentId,
      reviewer: "agent",
      reviewer_display_name: "AI Agent",
      message: operation.body,
      kind: "comment",
      status: "open",
      anchor_json: null,
      suggestion_json: null,
      created_at: now,
      updated_at: now,
      resolved_at: null,
      resolved_by: null,
    });
  }

  return { preview, errors };
}

async function buildPublishCandidateAudit(
  record: D1StudioBriefDraftRecord,
  validation: ReturnType<typeof calculateStudioBriefDraftValidation>,
) {
  const [bodyMdHash, claimHashes, blockHashes] = await Promise.all([
    sha256Hex(record.draft.body_md ?? ""),
    Promise.all(
      record.claims.map(async (claim) => ({
        claimN: claim.claim_n,
        sha256: await sha256Hex(
          JSON.stringify({
            claimN: claim.claim_n,
            title: claim.title,
            body: claim.body,
            strength: claim.strength,
            evidenceIds: parseDraftStringArray(claim.evidence_ids_json),
            caveatIds: parseDraftStringArray(claim.caveat_ids_json),
            state: claim.state,
          }),
        ),
      })),
    ),
    Promise.all(
      record.blocks.map(async (block) => ({
        blockId: block.block_id,
        blockType: block.block_type,
        sha256: await sha256Hex(block.block_json),
      })),
    ),
  ]);

  return {
    validation,
    contentHashes: {
      bodyMd: bodyMdHash,
      claims: claimHashes,
      blocks: blockHashes,
    },
    reviewThreads: reviewThreadsFromRows(record.reviewComments).map((thread) => ({
      commentId: thread.commentId,
      kind: thread.kind,
      status: thread.status,
      anchor: thread.anchor,
      suggestion: thread.suggestion,
      replyCount: thread.replies.length,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      resolvedAt: thread.resolvedAt,
      resolvedBy: thread.resolvedBy,
    })),
  };
}

async function withStudioBriefDraftIdempotency(
  request: Request,
  env: Env,
  url: URL,
  handler: () => Promise<Response>,
): Promise<Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (idempotencyKey === undefined || idempotencyKey.length === 0) {
    return errorJson(400, "Idempotency-Key header is required for Studio brief draft mutations.");
  }

  const stored = await getStudioBriefWriteIdempotency(env.DB, {
    idempotencyKey,
    method: request.method,
    path: url.pathname,
  });
  if (stored !== null) {
    if (stored.status_code === 204) {
      return noContent();
    }
    return draftJson(JSON.parse(stored.response_json), { status: stored.status_code });
  }

  const response = await handler();
  if (response.status < 400) {
    const responseJson = response.status === 204 ? "null" : await response.clone().text();
    await recordStudioBriefWriteIdempotency(env.DB, {
      idempotencyKey,
      method: request.method,
      path: url.pathname,
      statusCode: response.status,
      responseJson,
      createdAt: new Date().toISOString(),
    });
  }
  return response;
}

async function parseUnknownJsonRequest(
  request: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  const payload = await request.json().catch(() => null);
  if (payload === null) {
    return { ok: false, response: errorJson(400, "Request body failed JSON parsing.") };
  }
  return { ok: true, data: payload };
}

type StudioBriefAgentProposeEditSubmissionResult = z.output<
  typeof StudioBriefAgentProposeEditResultSchema
>;

async function submitStudioBriefAgentProposal(input: {
  env: Env;
  database: D1Database;
  record: D1StudioBriefDraftRecord;
  run: D1StudioBriefAgentRunRow;
  payload: unknown;
  actor: string;
  now: string;
  provenance?: Partial<z.output<typeof StudioBriefAgentProvenanceSchema>>;
}): Promise<StudioBriefAgentProposeEditSubmissionResult | Response> {
  if (input.run.proposal_id !== null) {
    return errorJson(409, "Studio brief agent run already has a proposal.");
  }
  if (input.run.status === "cancelled" || input.run.status === "superseded") {
    return errorJson(409, "Studio brief agent run cannot accept a proposal in this state.");
  }

  const parsed = StudioBriefAgentProposeEditRequestSchema.safeParse(input.payload);
  if (!parsed.success) {
    return StudioBriefAgentProposeEditResultSchema.parse({
      ok: false,
      status: "repair_required",
      errors: zodIssuesToProposalErrors(parsed.error),
    });
  }

  const baseVersionId = parsed.data.baseVersionId ?? input.run.base_version_id;
  const baseContentHash = parsed.data.baseContentHash ?? input.run.base_content_hash;
  const currentHash = await studioBriefDraftContentHash(input.record);
  if (baseVersionId !== input.record.draft.version || baseContentHash !== currentHash) {
    return StudioBriefAgentProposeEditResultSchema.parse({
      ok: false,
      status: "stale_base",
      errors: [
        proposalFeedbackError(
          "stale_base",
          "baseContentHash",
          "The accepted draft changed since this agent run started.",
          false,
        ),
      ],
    });
  }

  const previewResult = applyOperationsForProposalPreview(
    input.record,
    parsed.data.operations,
    input.now,
  );
  if (previewResult.errors.length > 0) {
    return StudioBriefAgentProposeEditResultSchema.parse({
      ok: false,
      status: "repair_required",
      errors: previewResult.errors,
    });
  }

  const validation = calculateStudioBriefDraftValidation(previewResult.preview, input.now);
  const previewHash = await studioBriefDraftContentHash(previewResult.preview);
  const proposalId = randomToken(16);
  const provenance = StudioBriefAgentProvenanceSchema.parse({
    ...parsed.data.provenance,
    ...input.provenance,
    evidenceRefs: input.provenance?.evidenceRefs ?? parsed.data.provenance.evidenceRefs,
  });
  await insertStudioBriefAgentProposal(input.database, {
    proposalId,
    runId: input.run.run_id,
    briefId: input.record.draft.brief_id,
    status: "proposed",
    baseVersionId,
    baseContentHash,
    title: parsed.data.title,
    summary: parsed.data.summary,
    operationsJson: JSON.stringify(parsed.data.operations),
    validationJson: JSON.stringify(validation),
    previewHash,
    provenanceJson: JSON.stringify(provenance),
    createdAt: input.now,
    updatedAt: input.now,
  });
  await updateStudioBriefAgentRunStatus(input.database, {
    briefId: input.record.draft.brief_id,
    runId: input.run.run_id,
    status: "needs_approval",
    proposalId,
    updatedAt: input.now,
    completedAt: input.now,
  });
  await appendStudioBriefDraftHistoryForActor(
    input.env,
    input.record,
    input.actor,
    "draft.agent.proposal.created",
    `Agent proposal ${proposalId} created for approval.`,
    input.now,
  );
  return StudioBriefAgentProposeEditResultSchema.parse({
    ok: true,
    proposalId,
    status: "proposed",
    previewHash,
    validation,
  });
}

function claimResponse(record: D1StudioBriefDraftRecord, claimN: number): Response {
  const claim = record.claims.find((item) => item.claim_n === claimN);
  if (claim === undefined) {
    return errorJson(404, "Studio brief draft claim was not found.");
  }
  return draftJson(
    StudioBriefDraftClaimResponseSchema.parse({ claim: draftClaimToStudioClaim(claim) }),
  );
}

function blockResponse(record: D1StudioBriefDraftRecord, blockId: string): Response {
  const block = record.blocks.find((item) => item.block_id === blockId);
  if (block === undefined) {
    return errorJson(404, "Studio brief draft block was not found.");
  }
  return draftJson(
    StudioBriefDraftBlockResponseSchema.parse({ block: draftBlockToStudioBlock(block) }),
  );
}

function defaultDraftReviewAnchor(): z.output<typeof StudioBriefDraftReviewAnchorSchema> {
  return { target: "draft", targetId: null, quote: null };
}

function parseReviewAnchorJson(
  value: string | null,
): z.output<typeof StudioBriefDraftReviewAnchorSchema> {
  if (value === null) return defaultDraftReviewAnchor();
  try {
    const parsed = StudioBriefDraftReviewAnchorSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : defaultDraftReviewAnchor();
  } catch {
    return defaultDraftReviewAnchor();
  }
}

function parseReviewSuggestionJson(
  value: string | null,
): z.output<typeof StudioBriefDraftReviewSuggestionSchema> | null {
  if (value === null) return null;
  try {
    const parsed = StudioBriefDraftReviewSuggestionSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function reviewThreadFromRows(
  root: D1StudioBriefReviewCommentRow,
  replies: D1StudioBriefReviewCommentRow[],
): StudioBriefDraftReviewThread {
  return StudioBriefDraftReviewThreadSchema.parse({
    commentId: root.comment_id,
    briefId: root.brief_id,
    kind: root.kind,
    status: root.status,
    author: root.reviewer,
    authorDisplayName: root.reviewer_display_name,
    body: root.message,
    anchor: parseReviewAnchorJson(root.anchor_json),
    suggestion: parseReviewSuggestionJson(root.suggestion_json),
    replies: replies.map((reply) => ({
      commentId: reply.comment_id,
      parentCommentId: root.comment_id,
      briefId: reply.brief_id,
      author: reply.reviewer,
      authorDisplayName: reply.reviewer_display_name,
      body: reply.message,
      createdAt: reply.created_at,
      updatedAt: reply.updated_at,
    })),
    createdAt: root.created_at,
    updatedAt: root.updated_at,
    resolvedAt: root.resolved_at,
    resolvedBy: root.resolved_by,
  });
}

function reviewThreadsFromRows(
  rows: readonly D1StudioBriefReviewCommentRow[],
): StudioBriefDraftReviewThread[] {
  const repliesByParent = new Map<string, D1StudioBriefReviewCommentRow[]>();
  for (const row of rows) {
    if (row.parent_comment_id === null) continue;
    const replies = repliesByParent.get(row.parent_comment_id) ?? [];
    replies.push(row);
    repliesByParent.set(row.parent_comment_id, replies);
  }
  return rows
    .filter((row) => row.parent_comment_id === null)
    .map((row) => reviewThreadFromRows(row, repliesByParent.get(row.comment_id) ?? []));
}

function commentsResponse(record: D1StudioBriefDraftRecord): Response {
  return draftJson(
    StudioBriefDraftCommentsResponseSchema.parse({
      comments: reviewThreadsFromRows(record.reviewComments),
    }),
  );
}

function openBlockingReviewThreads(
  record: D1StudioBriefDraftRecord,
): D1StudioBriefReviewCommentRow[] {
  return record.reviewComments.filter(
    (comment) =>
      comment.parent_comment_id === null &&
      comment.status === "open" &&
      (comment.kind === "change-requested" || comment.kind === "suggested-edit"),
  );
}

function textForReviewAnchor(
  record: D1StudioBriefDraftRecord,
  anchor: z.output<typeof StudioBriefDraftReviewAnchorSchema>,
): string | Response {
  if (anchor.target === "draft") return "";
  if (anchor.target === "body") return record.draft.body_md ?? "";
  if (anchor.target === "claim") {
    const claimN = Number.parseInt(anchor.targetId ?? "", 10);
    const claim = record.claims.find((item) => item.claim_n === claimN);
    if (claim === undefined) return errorJson(409, "Review anchor claim target was not found.");
    return [claim.title, claim.body ?? ""].filter((part) => part.trim().length > 0).join("\n\n");
  }
  const block = record.blocks.find((item) => item.block_id === anchor.targetId);
  if (block === undefined) return errorJson(409, "Review anchor block target was not found.");
  return block.block_json;
}

function validateReviewAnchor(
  record: D1StudioBriefDraftRecord,
  anchor: z.output<typeof StudioBriefDraftReviewAnchorSchema>,
): Response | null {
  const targetText = textForReviewAnchor(record, anchor);
  if (targetText instanceof Response) return targetText;
  if (anchor.quote !== null && !targetText.includes(anchor.quote.exact)) {
    return errorJson(409, "Review anchor quote no longer matches the draft text.");
  }
  return null;
}

function countOccurrences(text: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let index = text.indexOf(search);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(search, index + search.length);
  }
  return count;
}

function applyBodySuggestion(
  record: D1StudioBriefDraftRecord,
  comment: D1StudioBriefReviewCommentRow,
): string | Response {
  const anchor = parseReviewAnchorJson(comment.anchor_json);
  const suggestion = parseReviewSuggestionJson(comment.suggestion_json);
  if (comment.kind !== "suggested-edit" || suggestion === null) {
    return errorJson(409, "Review comment is not a suggested edit.");
  }
  if (comment.status !== "open") {
    return errorJson(409, "Suggested edit is not open.");
  }
  if (anchor.target !== "body") {
    return errorJson(409, "Only body markdown suggested edits can be accepted automatically.");
  }
  const bodyMd = record.draft.body_md ?? "";
  if (anchor.quote?.exact !== suggestion.suggestFrom) {
    return errorJson(409, "Suggested edit no longer matches its review anchor.");
  }
  const matches = countOccurrences(bodyMd, suggestion.suggestFrom);
  if (matches === 0) return errorJson(409, "Suggested text was not found in the draft body.");
  if (matches > 1) return errorJson(409, "Suggested text is ambiguous in the draft body.");
  return bodyMd.replace(suggestion.suggestFrom, suggestion.suggestTo);
}

function unresolvedBriefRef(ref: StudioBriefRef, target: string, reason: string): StudioBriefRef {
  return { id: ref.id, kind: "unresolved", target, reason };
}

function resolveStudioBriefDraftRefs(input: {
  refs: StudioBriefRef[];
  record: D1StudioBriefDraftRecord;
  projection: StudioBriefProjection;
  routeDetail: StudioRouteDetailProjection | null;
}): { refs: StudioBriefRef[]; unresolved: string[] } {
  const blocksById = new Map(input.record.blocks.map((block) => [block.block_id, block]));
  const evidenceById = new Map(
    input.projection.brief.evidence.map((evidence) => [evidence.id, evidence]),
  );
  const artifactsByKey = new Map(
    (input.routeDetail?.artifactRefs ?? []).map((artifact) => [artifact.key, artifact]),
  );

  const refs = input.refs.map((ref): StudioBriefRef => {
    if (ref.kind === "unresolved") {
      return ref;
    }

    if (ref.kind === "block") {
      const block = blocksById.get(ref.blockId);
      if (block === undefined) {
        return unresolvedBriefRef(ref, ref.blockId, "Draft block was not found.");
      }
      if (block.block_type !== ref.blockType) {
        return unresolvedBriefRef(
          ref,
          ref.blockId,
          `Draft block has type ${block.block_type}, not ${ref.blockType}.`,
        );
      }
      return ref;
    }

    if (ref.kind === "evidence") {
      const evidence = evidenceById.get(ref.evidenceId);
      if (evidence === undefined) {
        return unresolvedBriefRef(ref, ref.evidenceId, "Brief evidence was not found.");
      }
      return { ...ref, label: ref.label ?? evidence.title };
    }

    if (ref.kind === "metric") {
      const missingEvidenceIds = ref.sourceEvidenceIds.filter(
        (evidenceId) => !evidenceById.has(evidenceId),
      );
      if (missingEvidenceIds.length > 0) {
        return unresolvedBriefRef(
          ref,
          ref.metricId,
          `Metric source evidence was not found: ${missingEvidenceIds.join(", ")}.`,
        );
      }
      return { ...ref, label: ref.label ?? ref.metricId };
    }

    if (ref.kind === "artifact") {
      const artifact = artifactsByKey.get(ref.artifactKey);
      if (artifact === undefined) {
        return unresolvedBriefRef(ref, ref.artifactKey, "Route artifact was not found.");
      }
      return {
        ...ref,
        label: ref.label ?? artifact.name,
        publicUrl: ref.publicUrl ?? artifactApiPath(artifact.key),
      };
    }

    const sourceEvidence = evidenceById.get(ref.sourceId);
    if (sourceEvidence !== undefined) {
      return { ...ref, label: ref.label ?? sourceEvidence.title };
    }
    if (ref.url !== undefined) {
      return { ...ref, label: ref.label ?? ref.sourceId };
    }
    return unresolvedBriefRef(ref, ref.sourceId, "Brief source evidence was not found.");
  });

  return {
    refs,
    unresolved: refs.filter((ref) => ref.kind === "unresolved").map((ref) => ref.id),
  };
}

async function loadProjectionForDraftRefs(
  env: Env,
  record: D1StudioBriefDraftRecord,
): Promise<{ ok: true; data: StudioBriefProjection } | { ok: false; response: Response }> {
  const sourceBriefId = record.draft.source_brief_id;
  if (sourceBriefId !== null) {
    return loadStudioBriefProjection(env, sourceBriefId);
  }
  const route = await loadStudioRouteProjection(env, record.draft.route_slug);
  return route.ok
    ? {
        ok: true,
        data: draftRecordToBriefProjection(record, route.route, route.quality),
      }
    : { ok: false, response: route.response };
}

function storedDraftRefs(record: D1StudioBriefDraftRecord): StudioBriefRef[] {
  return record.refs.map(draftRefToStudioBriefRef);
}

function uniqueRefsById(refs: StudioBriefRef[]): StudioBriefRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    if (seen.has(ref.id)) return false;
    seen.add(ref.id);
    return true;
  });
}

async function replaceResolvedDraftRefs(
  database: D1Database,
  input: { briefId: string; refs: StudioBriefRef[]; updatedAt: string },
): Promise<void> {
  const refs = uniqueRefsById(input.refs);
  await replaceStudioBriefDraftRefs(database, {
    briefId: input.briefId,
    refs: refs.map((ref) => ({
      refId: ref.id,
      refKind: ref.kind,
      refJson: JSON.stringify(ref),
    })),
    updatedAt: input.updatedAt,
  });
}

function bodyDirectiveForBlock(block: StudioBriefBlock): string {
  return `:::${block.type}{ref="${block.id}"}`;
}

function appendDirectiveToBody(bodyMd: string | null, directive: string): string {
  const current = bodyMd?.trimEnd() ?? "";
  return current.length === 0 ? directive : `${current}\n\n${directive}`;
}

type BriefAuthorAgentState = {
  status: "idle" | "queued" | "running" | "needs_approval" | "failed";
  briefId: string | null;
  runId: string | null;
  jobId: string | null;
  proposalId: string | null;
  error: string | null;
  updatedAt: string | null;
};

type BriefAuthorGenerateInput = {
  briefId: string;
  runId: string;
  jobId: string;
  requestedAt: string;
};

type BriefAuthorAgentConfig = BriefAuthorGenerateInput & {
  mode: "generate_brief";
  modelProvider: typeof STUDIO_BRIEF_AGENT_PROVIDER;
  modelId: string;
  promptHash: string;
  actorId: string;
  actorDisplayName: string | null;
  prompt: string;
};

function buildStudioBriefAuthorSystemPrompt(): string {
  return [
    "You are the Bus Priority Impact Studio brief-authoring agent.",
    "You create proposed edits only; humans approve or reject your final proposal before the public brief changes.",
    "Call proposeBriefEdit with a complete, schema-valid edit proposal. If the tool returns repair_required, fix the structured output and retry.",
    "Prefer direct body markdown and claim edits. Preserve evidence IDs, caveats, typed block refs, and public-viewable content primitives unless the requested edit requires changing them.",
    "Do not invent evidence. When evidence is missing, explain the limitation in the proposal summary or add a weak/editing claim rather than fabricating references.",
  ].join("\n");
}

function buildStudioBriefAuthorGeneratePrompt(input: {
  record: D1StudioBriefDraftRecord;
  trigger: z.output<typeof StudioBriefAgentTriggerSchema>;
  baseContentHash: string;
}): string {
  const draft = draftRecordToStudioDraft(input.record);
  return [
    "Draft a better authoring proposal for this Studio brief.",
    "",
    "Return your final work by calling proposeBriefEdit. Include baseVersionId and baseContentHash exactly as provided.",
    "",
    `Base version: ${draft.version}`,
    `Base content hash: ${input.baseContentHash}`,
    `Trigger: ${JSON.stringify(input.trigger)}`,
    "",
    "Current draft JSON:",
    JSON.stringify(
      {
        title: draft.title,
        dek: draft.dek,
        summary: draft.summary,
        bodyMd: draft.bodyMd,
        claims: draft.claims,
        blocks: draft.blocks,
        refs: draft.refs,
        validationScore: draft.validationScore,
        validationWeakClaims: draft.validationWeakClaims,
        validationMissingEvidence: draft.validationMissingEvidence,
        validationBlockingIssues: draft.validationBlockingIssues,
        lastValidatedAt: draft.lastValidatedAt,
      },
      null,
      2,
    ),
  ].join("\n");
}

async function studioBriefAuthorPromptHash(prompt: string): Promise<string> {
  return sha256Hex(`${buildStudioBriefAuthorSystemPrompt()}\n\n${prompt}`);
}

async function markStudioBriefAuthorRunFailed(
  env: Env,
  input: {
    briefId: string;
    runId: string;
    jobId: string;
    errorCode: string;
    errorMessage: string;
    completedAt: string;
  },
): Promise<void> {
  if (env.DB === undefined) return;
  const run = await getStudioBriefAgentRun(env.DB, {
    briefId: input.briefId,
    runId: input.runId,
  });
  if (run !== null && (run.proposal_id !== null || run.status === "needs_approval")) return;
  await updateStudioBriefAgentRunStatus(env.DB, {
    briefId: input.briefId,
    runId: input.runId,
    status: "failed",
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    updatedAt: input.completedAt,
    completedAt: input.completedAt,
  });
  await updateStudioBriefDraftJobStatus(env.DB, {
    briefId: input.briefId,
    jobId: input.jobId,
    jobStatus: "failed",
    jobGenerationMode: "llm_assisted",
    jobLlmStatus: input.errorCode === "not_configured" ? "not_configured" : "failed",
    jobLlmProvider: input.errorCode === "not_configured" ? null : STUDIO_BRIEF_AGENT_PROVIDER,
    jobLlmModel: input.errorCode === "not_configured" ? null : studioBriefAgentModelId(env),
    jobStartedAt: run?.started_at ?? null,
    jobCompletedAt: input.completedAt,
    jobError: input.errorMessage,
    draftStatus: "draft",
    updatedAt: input.completedAt,
  });
}

async function startStudioBriefAuthorAgentRun(
  env: Env,
  record: D1StudioBriefDraftRecord,
  input: BriefAuthorGenerateInput,
): Promise<void> {
  if (env.BRIEF_AUTHOR_AGENT === undefined) {
    throw new Error("Cloudflare Think durable agent binding is not configured.");
  }
  const stub = env.BRIEF_AUTHOR_AGENT.getByName(studioBriefAgentInstanceName(record));
  await stub.submitGenerateJob(input);
}

export class BriefAuthorAgent extends Think<Env, BriefAuthorAgentState> {
  override initialState: BriefAuthorAgentState = {
    status: "idle",
    briefId: null,
    runId: null,
    jobId: null,
    proposalId: null,
    error: null,
    updatedAt: null,
  };

  override getModel(): LanguageModel {
    if (this.env.AI === undefined) {
      throw new Error("Workers AI binding is not configured.");
    }
    const workersAi = createWorkersAI({ binding: this.env.AI });
    return workersAi(studioBriefAgentModelId(this.env) as WorkersAiTextModelId, {
      safePrompt: true,
      sessionAffinity: this.sessionAffinity,
    });
  }

  override getSystemPrompt(): string {
    return buildStudioBriefAuthorSystemPrompt();
  }

  override getTools(): ToolSet {
    return {
      proposeBriefEdit: tool({
        description:
          "Submit a complete brief edit proposal for human approval. The live draft is not mutated.",
        inputSchema: zodSchema(StudioBriefAgentProposeEditRequestSchema),
        execute: async (payload: unknown) => this.proposeBriefEdit(payload),
      }),
    };
  }

  override beforeTurn(): TurnConfig {
    return {
      activeTools: ["proposeBriefEdit"],
      maxSteps: studioBriefAgentMaxSteps(this.env),
      maxOutputTokens: 4096,
      temperature: 0.2,
    };
  }

  override beforeStep(context: PrepareStepContext): StepConfig | void {
    if (context.stepNumber === 0) {
      return {
        activeTools: ["proposeBriefEdit"],
        toolChoice: { type: "tool", toolName: "proposeBriefEdit" },
      };
    }
    return { activeTools: ["proposeBriefEdit"] };
  }

  async submitGenerateJob(input: BriefAuthorGenerateInput): Promise<void> {
    const now = new Date().toISOString();
    if (this.env.DB === undefined) {
      throw new Error("D1 binding is not configured.");
    }
    if (this.env.AI === undefined) {
      await markStudioBriefAuthorRunFailed(this.env, {
        ...input,
        errorCode: "not_configured",
        errorMessage: "Workers AI binding is not configured.",
        completedAt: now,
      });
      return;
    }

    const record = await getStudioBriefDraftRecord(this.env.DB, input.briefId);
    const run = await getStudioBriefAgentRun(this.env.DB, input);
    if (record === null || run === null) {
      await markStudioBriefAuthorRunFailed(this.env, {
        ...input,
        errorCode: "missing_context",
        errorMessage: "Studio brief draft or agent run was not found.",
        completedAt: now,
      });
      return;
    }
    if (run.proposal_id !== null || run.status === "cancelled" || run.status === "superseded") {
      return;
    }

    const trigger = StudioBriefAgentTriggerSchema.parse(JSON.parse(run.trigger_json));
    const prompt = buildStudioBriefAuthorGeneratePrompt({
      record,
      trigger,
      baseContentHash: run.base_content_hash,
    });
    const promptHash = await studioBriefAuthorPromptHash(prompt);
    const modelId = studioBriefAgentModelId(this.env);
    this.configure<BriefAuthorAgentConfig>({
      ...input,
      mode: "generate_brief",
      modelProvider: STUDIO_BRIEF_AGENT_PROVIDER,
      modelId,
      promptHash,
      actorId: run.actor_id,
      actorDisplayName: run.actor_display_name,
      prompt,
    });
    this.setState({
      status: "running",
      briefId: input.briefId,
      runId: input.runId,
      jobId: input.jobId,
      proposalId: null,
      error: null,
      updatedAt: now,
    });
    await this.clearMessages();
    await updateStudioBriefAgentRunStatus(this.env.DB, {
      briefId: input.briefId,
      runId: input.runId,
      status: "running",
      updatedAt: now,
      startedAt: now,
    });
    await updateStudioBriefDraftJobStatus(this.env.DB, {
      briefId: input.briefId,
      jobId: input.jobId,
      jobStatus: "running",
      jobGenerationMode: "llm_assisted",
      jobLlmStatus: "running",
      jobLlmProvider: STUDIO_BRIEF_AGENT_PROVIDER,
      jobLlmModel: modelId,
      jobStartedAt: now,
      jobCompletedAt: null,
      jobError: null,
      draftStatus: "draft",
      updatedAt: now,
    });

    const message: UIMessage = {
      id: `studio-brief-generate-${input.runId}`,
      role: "user",
      parts: [{ type: "text", text: prompt }],
    };
    await this.submitMessages([message], {
      submissionId: `studio-brief-generate-${input.runId}`,
      idempotencyKey: `studio-brief-generate:${input.runId}`,
      metadata: { briefId: input.briefId, runId: input.runId, jobId: input.jobId },
    });
  }

  override async onChatResponse(_result: ChatResponseResult): Promise<void> {
    const config = this.getConfig<BriefAuthorAgentConfig>();
    if (config === null || this.env.DB === undefined) return;
    const run = await getStudioBriefAgentRun(this.env.DB, {
      briefId: config.briefId,
      runId: config.runId,
    });
    if (run !== null && run.proposal_id === null && run.status === "running") {
      await markStudioBriefAuthorRunFailed(this.env, {
        briefId: config.briefId,
        runId: config.runId,
        jobId: config.jobId,
        errorCode: "no_valid_proposal",
        errorMessage: "Workers AI completed without submitting a valid proposal.",
        completedAt: new Date().toISOString(),
      });
    }
  }

  override async onSubmissionStatus(submission: ThinkSubmissionInspection): Promise<void> {
    if (
      submission.status !== "error" &&
      submission.status !== "aborted" &&
      submission.status !== "skipped"
    ) {
      return;
    }
    const config = this.getConfig<BriefAuthorAgentConfig>();
    if (config === null) return;
    await markStudioBriefAuthorRunFailed(this.env, {
      briefId: config.briefId,
      runId: config.runId,
      jobId: config.jobId,
      errorCode: `submission_${submission.status}`,
      errorMessage: submission.error ?? `Think submission ${submission.status}.`,
      completedAt: new Date().toISOString(),
    });
  }

  private async proposeBriefEdit(
    payload: unknown,
  ): Promise<StudioBriefAgentProposeEditSubmissionResult> {
    const config = this.getConfig<BriefAuthorAgentConfig>();
    if (config === null || this.env.DB === undefined) {
      return StudioBriefAgentProposeEditResultSchema.parse({
        ok: false,
        status: "rejected",
        errors: [
          proposalFeedbackError(
            "missing_context",
            "run",
            "The brief author agent is not configured for an active run.",
            false,
          ),
        ],
      });
    }
    const record = await getStudioBriefDraftRecord(this.env.DB, config.briefId);
    const run = await getStudioBriefAgentRun(this.env.DB, {
      briefId: config.briefId,
      runId: config.runId,
    });
    if (record === null || run === null) {
      return StudioBriefAgentProposeEditResultSchema.parse({
        ok: false,
        status: "rejected",
        errors: [
          proposalFeedbackError(
            "missing_context",
            "run",
            "The draft or agent run could not be found.",
            false,
          ),
        ],
      });
    }
    const now = new Date().toISOString();
    const result = await submitStudioBriefAgentProposal({
      env: this.env,
      database: this.env.DB,
      record,
      run,
      payload,
      actor: config.actorDisplayName ?? config.actorId,
      now,
      provenance: {
        modelProvider: config.modelProvider,
        modelId: config.modelId,
        promptHash: config.promptHash,
      },
    });
    if (result instanceof Response) {
      return StudioBriefAgentProposeEditResultSchema.parse({
        ok: false,
        status: "rejected",
        errors: [
          proposalFeedbackError("proposal_rejected", "proposal", await result.text(), false),
        ],
      });
    }
    if (result.ok) {
      await updateStudioBriefDraftJobStatus(this.env.DB, {
        briefId: config.briefId,
        jobId: config.jobId,
        jobStatus: "succeeded",
        jobGenerationMode: "llm_assisted",
        jobLlmStatus: "succeeded",
        jobLlmProvider: config.modelProvider,
        jobLlmModel: config.modelId,
        jobStartedAt: config.requestedAt,
        jobCompletedAt: now,
        jobError: null,
        draftStatus: "draft",
        updatedAt: now,
      });
      this.setState({
        status: "needs_approval",
        briefId: config.briefId,
        runId: config.runId,
        jobId: config.jobId,
        proposalId: result.proposalId,
        error: null,
        updatedAt: now,
      });
    }
    return result;
  }
}

async function handleBriefDraftRoutes(
  request: Request,
  env: Env,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response> {
  const match = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)\/draft(?:\/(.*))?$/);
  if (match === null) {
    return errorJson(404, "Studio brief draft endpoint was not found.");
  }

  const briefId = decodeURIComponent(match[1] ?? "");
  const suffix = match[2] ?? "";

  if (request.method === "POST" && suffix === "agent-runs") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefAgentRunCreateRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      const runId = randomToken(16);
      const baseContentHash = await studioBriefDraftContentHash(record);
      await insertStudioBriefAgentRun(database, {
        runId,
        briefId,
        workspaceId: record.draft.workspace_id,
        status: "queued",
        intent: body.data.intent,
        baseVersionId: record.draft.version,
        baseContentHash,
        triggerJson: JSON.stringify(body.data.trigger),
        actorId: session.identity.email,
        actorDisplayName: session.identity.displayName,
        createdAt: now,
        updatedAt: now,
      });
      const run = await getStudioBriefAgentRun(database, { briefId, runId });
      if (run === null) return errorJson(503, "Studio brief agent run could not be read.");
      await appendStudioBriefDraftHistory(
        env,
        record,
        session,
        "draft.agent.run.created",
        `Agent run ${runId} queued.`,
        now,
      );
      return draftJson(
        StudioBriefAgentRunResponseSchema.parse({ run: agentRunRowToStudioAgentRun(run) }),
      );
    });
  }

  const agentRunMatch = suffix.match(/^agent-runs\/([^/]+)$/);
  if (agentRunMatch !== null && request.method === "GET") {
    const runId = decodeURIComponent(agentRunMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "read:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const record = await getRequiredDraftRecord(env, session, briefId);
    if (record instanceof Response) return record;
    const run = await getStudioBriefAgentRun(database, { briefId, runId });
    if (run === null) return errorJson(404, "Studio brief agent run was not found.");
    return draftJson(
      StudioBriefAgentRunResponseSchema.parse({ run: agentRunRowToStudioAgentRun(run) }),
    );
  }

  const proposeEditMatch = suffix.match(/^agent-runs\/([^/]+)\/propose-edit$/);
  if (proposeEditMatch !== null && request.method === "POST") {
    const runId = decodeURIComponent(proposeEditMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const payload = await parseUnknownJsonRequest(request);
    if (!payload.ok) return payload.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const run = await getStudioBriefAgentRun(database, { briefId, runId });
      if (run === null) return errorJson(404, "Studio brief agent run was not found.");
      const result = await submitStudioBriefAgentProposal({
        env,
        database,
        record,
        run,
        payload: payload.data,
        actor: actorName(session),
        now,
      });
      if (result instanceof Response) return result;
      return draftJson(result);
    });
  }

  const proposalMatch = suffix.match(/^proposals\/([^/]+)$/);
  if (proposalMatch !== null && request.method === "GET") {
    const proposalId = decodeURIComponent(proposalMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "read:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const record = await getRequiredDraftRecord(env, session, briefId);
    if (record instanceof Response) return record;
    const proposal = await getStudioBriefAgentProposal(database, { briefId, proposalId });
    if (proposal === null) return errorJson(404, "Studio brief agent proposal was not found.");
    return draftJson(
      StudioBriefAgentProposalResponseSchema.parse({
        proposal: agentProposalRowToStudioAgentProposal(proposal),
      }),
    );
  }

  const proposalApplyMatch = suffix.match(/^proposals\/([^/]+)\/apply$/);
  if (proposalApplyMatch !== null && request.method === "POST") {
    const proposalId = decodeURIComponent(proposalApplyMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefAgentProposalApplyRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const proposal = await getStudioBriefAgentProposal(database, { briefId, proposalId });
      if (proposal === null) return errorJson(404, "Studio brief agent proposal was not found.");
      if (proposal.status !== "proposed") {
        return errorJson(409, "Studio brief agent proposal is not waiting for approval.");
      }
      const currentHash = await studioBriefDraftContentHash(record);
      if (
        proposal.base_version_id !== record.draft.version ||
        proposal.base_content_hash !== currentHash
      ) {
        await updateStudioBriefAgentProposalStatus(database, {
          briefId,
          proposalId,
          status: "stale",
          updatedAt: now,
        });
        return errorJson(409, "The accepted draft changed since this proposal was created.");
      }

      const operations = parseAgentProposalOperations(proposal);
      const allOperationIds = operations.map((operation) => operation.opId);
      const acceptedOperationIds = body.data.operationIds ?? allOperationIds;
      if (new Set(acceptedOperationIds).size !== acceptedOperationIds.length) {
        return errorJson(400, "Accepted operation ids must be unique.");
      }
      const missingOperationIds = acceptedOperationIds.filter(
        (operationId) => !allOperationIds.includes(operationId),
      );
      if (missingOperationIds.length > 0) {
        return errorJson(
          400,
          `Accepted operation ids were not found: ${missingOperationIds.join(", ")}.`,
        );
      }
      const selectedOperations = operations.filter((operation) =>
        acceptedOperationIds.includes(operation.opId),
      );
      const previewResult = applyOperationsForProposalPreview(record, selectedOperations, now);
      if (previewResult.errors.length > 0) {
        return errorJson(
          409,
          `Proposal operations no longer apply: ${previewResult.errors
            .map((error) => error.message)
            .join(" ")}`,
        );
      }

      const versionId = `version-${randomToken(16)}`;
      const previewDraft = draftRecordToStudioDraft({
        ...previewResult.preview,
        draft: { ...previewResult.preview.draft, version: versionId },
      });
      await writeStudioBriefDraftSnapshotContent(database, {
        briefId,
        snapshot: previewDraft,
        updatedAt: now,
        version: versionId,
      });
      for (const operation of selectedOperations) {
        if (operation.type !== "add_review_reply") continue;
        await insertStudioBriefReviewReply(database, {
          commentId: randomToken(16),
          briefId,
          parentCommentId: operation.commentId,
          reviewer: session.identity.email,
          reviewerDisplayName: session.identity.displayName,
          message: operation.body,
          createdAt: now,
        });
      }
      const updatedBeforeValidation = await getRequiredDraftRecord(env, session, briefId);
      if (updatedBeforeValidation instanceof Response) return updatedBeforeValidation;
      const validation = calculateStudioBriefDraftValidation(updatedBeforeValidation, now);
      await updateStudioBriefDraftValidation(database, { briefId, ...validation });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      const version = await insertDraftVersionMilestone(database, {
        record: updated,
        versionId,
        parentVersionId: record.draft.version,
        actorId: session.identity.email,
        actorType: "human",
        reason: "agent_proposal_applied",
        sourceRunId: proposal.run_id,
        sourceProposalId: proposalId,
        createdAt: now,
      });
      await updateStudioBriefAgentProposalStatus(database, {
        briefId,
        proposalId,
        status:
          acceptedOperationIds.length === allOperationIds.length ? "applied" : "partially_applied",
        updatedAt: now,
        appliedAt: now,
        acceptedOperationIds,
      });
      const appliedProposal = await getStudioBriefAgentProposal(database, { briefId, proposalId });
      if (appliedProposal === null) {
        return errorJson(503, "Studio brief agent proposal could not be read.");
      }
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.agent.proposal.applied",
        `Agent proposal ${proposalId} applied (${acceptedOperationIds.length}/${allOperationIds.length} operations).`,
        now,
      );
      return draftJson(
        StudioBriefAgentProposalApplyResponseSchema.parse({
          draft: draftRecordToStudioDraft(updated),
          proposal: agentProposalRowToStudioAgentProposal(appliedProposal),
          version: draftVersionRowToStudioDraftVersion(version),
        }),
      );
    });
  }

  const proposalRejectMatch = suffix.match(/^proposals\/([^/]+)\/reject$/);
  if (proposalRejectMatch !== null && request.method === "POST") {
    const proposalId = decodeURIComponent(proposalRejectMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefAgentProposalRejectRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const proposal = await getStudioBriefAgentProposal(database, { briefId, proposalId });
      if (proposal === null) return errorJson(404, "Studio brief agent proposal was not found.");
      if (proposal.status === "applied" || proposal.status === "partially_applied") {
        return errorJson(409, "Applied Studio brief agent proposals cannot be rejected.");
      }
      if (proposal.status !== "rejected") {
        await updateStudioBriefAgentProposalStatus(database, {
          briefId,
          proposalId,
          status: "rejected",
          updatedAt: now,
          rejectedAt: now,
          acceptedOperationIds: [],
        });
        await appendStudioBriefDraftHistory(
          env,
          record,
          session,
          "draft.agent.proposal.rejected",
          body.data.reason === undefined || body.data.reason.trim().length === 0
            ? `Agent proposal ${proposalId} rejected.`
            : `Agent proposal ${proposalId} rejected: ${body.data.reason}`,
          now,
        );
      }
      const rejectedProposal = await getStudioBriefAgentProposal(database, { briefId, proposalId });
      if (rejectedProposal === null) {
        return errorJson(503, "Studio brief agent proposal could not be read.");
      }
      return draftJson(
        StudioBriefAgentProposalRejectResponseSchema.parse({
          proposal: agentProposalRowToStudioAgentProposal(rejectedProposal),
        }),
      );
    });
  }

  if (request.method === "GET" && suffix === "versions") {
    const session = await requireStudioOperator(request, env, "read:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const record = await getRequiredDraftRecord(env, session, briefId);
    if (record instanceof Response) return record;
    const versions = await listStudioBriefDraftVersions(database, briefId);
    return draftJson(
      StudioBriefDraftVersionsResponseSchema.parse({
        versions: versions.map(draftVersionRowToStudioDraftVersion),
      }),
    );
  }

  const versionRestoreMatch = suffix.match(/^versions\/([^/]+)\/restore$/);
  if (versionRestoreMatch !== null && request.method === "POST") {
    const versionId = decodeURIComponent(versionRestoreMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftVersionRestoreRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const sourceVersion = await getStudioBriefDraftVersion(database, { briefId, versionId });
      if (sourceVersion === null)
        return errorJson(404, "Studio brief draft version was not found.");
      if (sourceVersion.snapshot_storage !== "d1") {
        return errorJson(409, "Studio brief draft version snapshot is not stored in D1.");
      }
      const snapshotRow = await getStudioBriefDraftVersionSnapshot(database, {
        briefId,
        snapshotKey: sourceVersion.snapshot_key,
      });
      if (snapshotRow === null) {
        return errorJson(409, "Studio brief draft version snapshot was not found.");
      }
      let snapshotPayload: unknown;
      try {
        snapshotPayload = JSON.parse(snapshotRow.snapshot_json);
      } catch {
        return errorJson(409, "Studio brief draft version snapshot is not valid JSON.");
      }
      const parsedSnapshot = StudioBriefDraftSchema.safeParse(snapshotPayload);
      if (!parsedSnapshot.success) {
        return errorJson(409, "Studio brief draft version snapshot failed schema validation.");
      }
      const snapshot = parsedSnapshot.data;
      if (snapshot.briefId !== briefId) {
        return errorJson(409, "Studio brief draft version snapshot belongs to a different brief.");
      }
      const restoredVersionId = `version-${randomToken(16)}`;
      await writeStudioBriefDraftSnapshotContent(database, {
        briefId,
        snapshot,
        updatedAt: now,
        version: restoredVersionId,
      });
      const updatedBeforeValidation = await getRequiredDraftRecord(env, session, briefId);
      if (updatedBeforeValidation instanceof Response) return updatedBeforeValidation;
      const validation = calculateStudioBriefDraftValidation(updatedBeforeValidation, now);
      await updateStudioBriefDraftValidation(database, { briefId, ...validation });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      const restoredVersion = await insertDraftVersionMilestone(database, {
        record: updated,
        versionId: restoredVersionId,
        parentVersionId: record.draft.version,
        actorId: session.identity.email,
        actorType: "human",
        reason: "restored",
        createdAt: now,
      });
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.version.restored",
        `Draft restored from version ${versionId}.`,
        now,
      );
      return draftJson(
        StudioBriefDraftVersionRestoreResponseSchema.parse({
          draft: draftRecordToStudioDraft(updated),
          version: draftVersionRowToStudioDraftVersion(restoredVersion),
        }),
      );
    });
  }

  if (request.method === "PATCH" && suffix === "") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftPatchRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      await updateStudioBriefDraftMetadata(database, {
        briefId,
        updatedAt: now,
        ...(body.data.title === undefined ? {} : { title: body.data.title }),
        ...(body.data.dek === undefined ? {} : { dek: body.data.dek }),
        ...(body.data.summary === undefined ? {} : { summary: body.data.summary }),
        ...(body.data.bodyMd === undefined ? {} : { bodyMd: body.data.bodyMd }),
        ...(body.data.status === undefined ? {} : { status: body.data.status }),
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.updated",
        "Draft metadata updated.",
        now,
      );
      return noContent();
    });
  }

  if (request.method === "POST" && suffix === "generate") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftGenerateRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      if (env.AI === undefined || env.BRIEF_AUTHOR_AGENT === undefined) {
        const jobError =
          "AI generation requires Cloudflare Think and Workers AI bindings, but one is not configured.";
        await updateStudioBriefDraftJobStatus(database, {
          briefId,
          jobId: randomToken(12),
          jobStatus: "failed",
          jobGenerationMode: "llm_assisted",
          jobLlmStatus: "not_configured",
          jobLlmProvider: null,
          jobLlmModel: null,
          jobStartedAt: now,
          jobCompletedAt: now,
          jobError,
          draftStatus: "draft",
          updatedAt: now,
        });
        const updated = await getRequiredDraftRecord(env, session, briefId);
        if (updated instanceof Response) return updated;
        await appendStudioBriefDraftHistory(
          env,
          updated,
          session,
          "draft.generation.not_configured",
          jobError,
          now,
        );
        return draftJson(
          StudioBriefGenerationJobResponseSchema.parse({
            status: "failed",
            error: jobError,
            draft: draftRecordToStudioDraft(updated),
          }),
        );
      }
      const jobId = randomToken(12);
      const runId = randomToken(16);
      const baseContentHash = await studioBriefDraftContentHash(record);
      const trigger = StudioBriefAgentTriggerSchema.parse({ source: "draft/generate" });
      const prompt = buildStudioBriefAuthorGeneratePrompt({
        record,
        trigger,
        baseContentHash,
      });
      const promptHash = await studioBriefAuthorPromptHash(prompt);
      const modelId = studioBriefAgentModelId(env);
      await updateStudioBriefDraftJobStatus(database, {
        briefId,
        jobId,
        jobStatus: "queued",
        jobGenerationMode: "llm_assisted",
        jobLlmStatus: "pending",
        jobLlmProvider: STUDIO_BRIEF_AGENT_PROVIDER,
        jobLlmModel: modelId,
        jobStartedAt: now,
        jobCompletedAt: null,
        jobError: null,
        draftStatus: "draft",
        updatedAt: now,
      });
      await insertStudioBriefAgentRun(database, {
        runId,
        briefId,
        workspaceId: record.draft.workspace_id,
        status: "queued",
        intent: "generate_brief",
        baseVersionId: record.draft.version,
        baseContentHash,
        triggerJson: JSON.stringify(trigger),
        actorId: session.identity.email,
        actorDisplayName: session.identity.displayName,
        modelProvider: STUDIO_BRIEF_AGENT_PROVIDER,
        modelId,
        promptHash,
        createdAt: now,
        updatedAt: now,
      });
      await appendStudioBriefDraftHistory(
        env,
        record,
        session,
        "draft.generation.queued",
        `Agent run ${runId} queued for Workers AI generation.`,
        now,
      );
      const startPromise = startStudioBriefAuthorAgentRun(env, record, {
        briefId,
        runId,
        jobId,
        requestedAt: now,
      }).catch(async (error: unknown) => {
        await markStudioBriefAuthorRunFailed(env, {
          briefId,
          runId,
          jobId,
          errorCode: "runner_start_failed",
          errorMessage:
            error instanceof Error ? error.message : "Brief author agent failed to start.",
          completedAt: new Date().toISOString(),
        });
      });
      if (ctx === undefined) {
        await startPromise;
      } else {
        ctx.waitUntil(startPromise);
      }
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      return draftJson(
        StudioBriefGenerationJobResponseSchema.parse({
          status: updated.draft.job_status,
          error: updated.draft.job_error,
          draft: draftRecordToStudioDraft(updated),
        }),
      );
    });
  }

  if (request.method === "POST" && suffix === "claims") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftClaimCreateRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      const claimN = Math.max(0, ...record.claims.map((claim) => claim.claim_n)) + 1;
      await insertStudioBriefDraftClaim(database, {
        briefId,
        claimN,
        title: body.data.title,
        body: body.data.body ?? null,
        strength: body.data.strength,
        evidenceIds: body.data.evidenceIds,
        caveatIds: body.data.caveatIds,
        state: body.data.state ?? "editing",
        createdAt: now,
        updatedAt: now,
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.claim.created",
        `Claim ${claimN} created.`,
        now,
      );
      return claimResponse(updated, claimN);
    });
  }

  if (request.method === "POST" && suffix === "blocks") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftBlockCreateRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      if (record.blocks.some((block) => block.block_id === body.data.block.id)) {
        return errorJson(409, "Studio brief draft block already exists.");
      }
      await insertStudioBriefDraftBlock(database, {
        briefId,
        blockId: body.data.block.id,
        blockType: body.data.block.type,
        blockJson: JSON.stringify(body.data.block),
        createdAt: now,
        updatedAt: now,
      });
      await updateStudioBriefDraftMetadata(database, { briefId, updatedAt: now });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.block.created",
        `Block ${body.data.block.id} created.`,
        now,
      );
      return blockResponse(updated, body.data.block.id);
    });
  }

  const blockMatch = suffix.match(/^blocks\/([^/]+)$/);
  if (blockMatch !== null && request.method === "PATCH") {
    const blockId = decodeURIComponent(blockMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftBlockPatchRequestSchema);
    if (!body.ok) return body.response;
    if (body.data.block.id !== blockId) {
      return errorJson(400, "Draft block id must match the request path.");
    }
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      if (!record.blocks.some((block) => block.block_id === blockId)) {
        return errorJson(404, "Studio brief draft block was not found.");
      }
      await updateStudioBriefDraftBlock(database, {
        briefId,
        blockId,
        blockType: body.data.block.type,
        blockJson: JSON.stringify(body.data.block),
        updatedAt: now,
      });
      await updateStudioBriefDraftMetadata(database, { briefId, updatedAt: now });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.block.updated",
        `Block ${blockId} updated.`,
        now,
      );
      return noContent();
    });
  }

  if (blockMatch !== null && request.method === "DELETE") {
    const blockId = decodeURIComponent(blockMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      if (!record.blocks.some((block) => block.block_id === blockId)) {
        return errorJson(404, "Studio brief draft block was not found.");
      }
      await deleteStudioBriefDraftBlock(database, { briefId, blockId });
      await deleteStudioBriefDraftRefsForBlock(database, { briefId, blockId });
      await updateStudioBriefDraftMetadata(database, { briefId, updatedAt: now });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.block.deleted",
        `Block ${blockId} deleted.`,
        now,
      );
      return noContent();
    });
  }

  if (request.method === "POST" && suffix === "refs/resolve") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const body = await parseJsonRequest(request, StudioBriefDraftRefsResolveRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      const projection = await loadProjectionForDraftRefs(env, record);
      if (!projection.ok) return projection.response;
      const routeDetail = await maybeLoadStudioRouteDetailProjection(env, record.draft.route_slug);
      return draftJson(
        StudioBriefDraftRefsResolveResponseSchema.parse(
          resolveStudioBriefDraftRefs({
            refs: body.data.refs,
            record,
            projection: projection.data,
            routeDetail,
          }),
        ),
      );
    });
  }

  if (request.method === "GET" && suffix === "refs") {
    const session = await requireStudioOperator(request, env, "read:briefs");
    if (session instanceof Response) return session;
    const record = await getRequiredDraftRecord(env, session, briefId);
    if (record instanceof Response) return record;
    return draftJson(
      StudioBriefDraftRefsResponseSchema.parse({ refs: storedDraftRefs(record), unresolved: [] }),
    );
  }

  if (request.method === "PUT" && suffix === "refs") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftRefsReplaceRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      const projection = await loadProjectionForDraftRefs(env, record);
      if (!projection.ok) return projection.response;
      const routeDetail = await maybeLoadStudioRouteDetailProjection(env, record.draft.route_slug);
      const resolved = resolveStudioBriefDraftRefs({
        refs: body.data.refs,
        record,
        projection: projection.data,
        routeDetail,
      });
      await replaceResolvedDraftRefs(database, { briefId, refs: resolved.refs, updatedAt: now });
      await updateStudioBriefDraftMetadata(database, { briefId, updatedAt: now });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.refs.replaced",
        `Draft refs replaced (${resolved.refs.length}).`,
        now,
      );
      return draftJson(StudioBriefDraftRefsResponseSchema.parse(resolved));
    });
  }

  if (request.method === "POST" && suffix === "attach") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftAttachRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      if (record.blocks.some((block) => block.block_id === body.data.block.id)) {
        return errorJson(409, "Studio brief draft block already exists.");
      }
      const blockRef: StudioBriefRef = {
        id: `block:${body.data.block.id}`,
        kind: "block",
        blockId: body.data.block.id,
        blockType: body.data.block.type,
      };
      const refs = [...storedDraftRefs(record), blockRef, ...body.data.refs];
      const projection = await loadProjectionForDraftRefs(env, record);
      if (!projection.ok) return projection.response;
      const routeDetail = await maybeLoadStudioRouteDetailProjection(env, record.draft.route_slug);
      const resolved = resolveStudioBriefDraftRefs({
        refs,
        record: {
          ...record,
          blocks: [
            ...record.blocks,
            {
              brief_id: briefId,
              block_id: body.data.block.id,
              block_type: body.data.block.type,
              block_json: JSON.stringify(body.data.block),
              created_at: now,
              updated_at: now,
            },
          ],
        },
        projection: projection.data,
        routeDetail,
      });
      const directive = body.data.bodyDirective ?? bodyDirectiveForBlock(body.data.block);
      await insertStudioBriefDraftBlock(database, {
        briefId,
        blockId: body.data.block.id,
        blockType: body.data.block.type,
        blockJson: JSON.stringify(body.data.block),
        createdAt: now,
        updatedAt: now,
      });
      await replaceResolvedDraftRefs(database, { briefId, refs: resolved.refs, updatedAt: now });
      await updateStudioBriefDraftMetadata(database, {
        briefId,
        updatedAt: now,
        ...(body.data.appendToBody
          ? { bodyMd: appendDirectiveToBody(record.draft.body_md, directive) }
          : {}),
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.attachment.created",
        `Attached block ${body.data.block.id}.`,
        now,
      );
      return draftJson(
        StudioBriefDraftAttachResponseSchema.parse({
          draft: draftRecordToStudioDraft(updated),
          block: body.data.block,
          refs: resolved.refs,
        }),
      );
    });
  }

  if (request.method === "GET" && suffix === "comments") {
    const session = await requireStudioOperator(request, env, "read:briefs");
    if (session instanceof Response) return session;
    const record = await getRequiredDraftRecord(env, session, briefId);
    if (record instanceof Response) return record;
    return commentsResponse(record);
  }

  if (request.method === "POST" && suffix === "comments") {
    const session = await requireStudioOperator(request, env, "review:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftCommentCreateRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const anchorError = validateReviewAnchor(record, body.data.anchor);
      if (anchorError !== null) return anchorError;
      const commentId = randomToken(16);
      await insertStudioBriefReviewThread(database, {
        commentId,
        briefId,
        reviewer: session.identity.email,
        reviewerDisplayName: session.identity.displayName,
        message: body.data.body,
        kind: body.data.kind,
        anchorJson: JSON.stringify(body.data.anchor),
        suggestionJson:
          body.data.suggestion === undefined || body.data.suggestion === null
            ? null
            : JSON.stringify(body.data.suggestion),
        createdAt: now,
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.review.comment.created",
        "Review comment created.",
        now,
      );
      const comment = reviewThreadsFromRows(updated.reviewComments).find(
        (thread) => thread.commentId === commentId,
      );
      if (comment === undefined) return errorJson(503, "Review comment could not be read.");
      return draftJson(StudioBriefDraftCommentResponseSchema.parse({ comment }));
    });
  }

  const commentReplyMatch = suffix.match(/^comments\/([^/]+)\/replies$/);
  if (commentReplyMatch !== null && request.method === "POST") {
    const commentId = decodeURIComponent(commentReplyMatch[1] ?? "");
    const session = await requireStudioOperatorWithAnyScope(request, env, [
      "write:briefs",
      "review:briefs",
    ]);
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftCommentReplyRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const parent = record.reviewComments.find(
        (comment) => comment.comment_id === commentId && comment.parent_comment_id === null,
      );
      if (parent === undefined) return errorJson(404, "Review comment was not found.");
      await insertStudioBriefReviewReply(database, {
        commentId: randomToken(16),
        briefId,
        parentCommentId: commentId,
        reviewer: session.identity.email,
        reviewerDisplayName: session.identity.displayName,
        message: body.data.body,
        createdAt: now,
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.review.reply.created",
        "Review reply created.",
        now,
      );
      const comment = reviewThreadsFromRows(updated.reviewComments).find(
        (thread) => thread.commentId === commentId,
      );
      if (comment === undefined) return errorJson(503, "Review comment could not be read.");
      return draftJson(StudioBriefDraftCommentResponseSchema.parse({ comment }));
    });
  }

  const commentAcceptMatch = suffix.match(/^comments\/([^/]+)\/accept-suggestion$/);
  if (commentAcceptMatch !== null && request.method === "POST") {
    const commentId = decodeURIComponent(commentAcceptMatch[1] ?? "");
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, EmptyObjectSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const comment = await getStudioBriefReviewComment(database, { briefId, commentId });
      if (comment === null || comment.parent_comment_id !== null) {
        return errorJson(404, "Review comment was not found.");
      }
      const nextBody = applyBodySuggestion(record, comment);
      if (nextBody instanceof Response) return nextBody;
      await updateStudioBriefDraftMetadata(database, {
        briefId,
        updatedAt: now,
        bodyMd: nextBody,
      });
      await updateStudioBriefReviewComment(database, {
        briefId,
        commentId,
        updatedAt: now,
        status: "resolved",
        resolvedBy: session.identity.email,
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.review.suggestion.accepted",
        "Review suggestion accepted.",
        now,
      );
      return noContent();
    });
  }

  const commentMatch = suffix.match(/^comments\/([^/]+)$/);
  if (commentMatch !== null && request.method === "PATCH") {
    const commentId = decodeURIComponent(commentMatch[1] ?? "");
    const session = await requireStudioOperatorWithAnyScope(request, env, [
      "write:briefs",
      "review:briefs",
    ]);
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftCommentPatchRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const existing = record.reviewComments.find(
        (comment) => comment.comment_id === commentId && comment.parent_comment_id === null,
      );
      if (existing === undefined) return errorJson(404, "Review comment was not found.");
      await updateStudioBriefReviewComment(database, {
        briefId,
        commentId,
        updatedAt: now,
        ...(body.data.body === undefined ? {} : { message: body.data.body }),
        ...(body.data.status === undefined
          ? {}
          : { status: body.data.status, resolvedBy: session.identity.email }),
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.review.comment.updated",
        "Review comment updated.",
        now,
      );
      const comment = reviewThreadsFromRows(updated.reviewComments).find(
        (thread) => thread.commentId === commentId,
      );
      if (comment === undefined) return errorJson(503, "Review comment could not be read.");
      return draftJson(StudioBriefDraftCommentResponseSchema.parse({ comment }));
    });
  }

  const claimMatch = suffix.match(/^claims\/([^/]+)$/);
  if (claimMatch !== null && request.method === "PATCH") {
    const claimN = parseClaimN(claimMatch[1]);
    if (claimN instanceof Response) return claimN;
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftClaimPatchRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      if (!record.claims.some((claim) => claim.claim_n === claimN)) {
        return errorJson(404, "Studio brief draft claim was not found.");
      }
      await updateStudioBriefDraftClaim(database, {
        briefId,
        claimN,
        updatedAt: now,
        ...(body.data.title === undefined ? {} : { title: body.data.title }),
        ...(body.data.body === undefined ? {} : { body: body.data.body }),
        ...(body.data.strength === undefined ? {} : { strength: body.data.strength }),
        ...(body.data.evidenceIds === undefined ? {} : { evidenceIds: body.data.evidenceIds }),
        ...(body.data.caveatIds === undefined ? {} : { caveatIds: body.data.caveatIds }),
        ...(body.data.state === undefined ? {} : { state: body.data.state }),
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.claim.updated",
        `Claim ${claimN} updated.`,
        now,
      );
      return noContent();
    });
  }

  if (claimMatch !== null && request.method === "DELETE") {
    const claimN = parseClaimN(claimMatch[1]);
    if (claimN instanceof Response) return claimN;
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      if (!record.claims.some((claim) => claim.claim_n === claimN)) {
        return errorJson(404, "Studio brief draft claim was not found.");
      }
      await deleteStudioBriefDraftClaim(database, { briefId, claimN, updatedAt: now });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.claim.deleted",
        `Claim ${claimN} deleted.`,
        now,
      );
      return noContent();
    });
  }

  if (request.method === "POST" && suffix === "validate") {
    const session = await requireStudioOperator(request, env, "write:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, EmptyObjectSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await ensureStudioBriefDraftRecord(env, session, briefId, now);
      if (record instanceof Response) return record;
      const validation = calculateStudioBriefDraftValidation(record, now);
      await updateStudioBriefDraftValidation(database, { briefId, ...validation });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.validated",
        "Draft validation refreshed.",
        now,
      );
      return draftJson(StudioBriefDraftValidationResponseSchema.parse({ validation }));
    });
  }

  if (request.method === "POST" && suffix === "review") {
    const session = await requireStudioOperator(request, env, "review:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftReviewRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      await insertStudioBriefReviewComment(database, {
        commentId: randomToken(16),
        briefId,
        reviewer: session.identity.email,
        reviewerDisplayName: session.identity.displayName,
        message: body.data.message,
        createdAt: now,
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.review.requested",
        "Draft review requested.",
        now,
      );
      return noContent();
    });
  }

  if (request.method === "POST" && suffix === "verdict") {
    const session = await requireStudioOperator(request, env, "review:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftVerdictRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      const approved = body.data.verdict === "approve";
      if (approved && openBlockingReviewThreads(record).length > 0) {
        return errorJson(409, "Resolve blocking review items before approving this draft.");
      }
      if (body.data.message !== undefined && body.data.message.trim().length > 0) {
        await insertStudioBriefReviewThread(database, {
          commentId: randomToken(16),
          briefId,
          reviewer: session.identity.email,
          reviewerDisplayName: session.identity.displayName,
          message: body.data.message,
          kind: approved ? "comment" : "change-requested",
          anchorJson: JSON.stringify(defaultDraftReviewAnchor()),
          suggestionJson: null,
          createdAt: now,
        });
      }
      await updateStudioBriefDraftMetadata(database, {
        briefId,
        updatedAt: now,
        status: approved ? "approved" : "draft",
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        approved ? "draft.verdict.approved" : "draft.verdict.request_changes",
        approved ? "Draft approved by reviewer." : "Reviewer requested changes.",
        now,
      );
      return noContent();
    });
  }

  if (request.method === "POST" && suffix === "publish") {
    const session = await requireStudioOperator(request, env, "publish:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftPublishRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      if (record.draft.status !== "approved") {
        return errorJson(409, "Approve the draft before marking it as a publish candidate.");
      }
      const validation = calculateStudioBriefDraftValidation(record, now);
      if (validation.blockingIssues.length > 0) {
        return errorJson(
          409,
          `Draft has blocking validation issues: ${validation.blockingIssues.join(" ")}`,
        );
      }
      await markStudioBriefDraftPublishCandidate(database, { briefId, publishedAt: now });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.publish_candidate",
        "Draft marked as publish candidate.",
        now,
      );
      return noContent();
    });
  }

  if (request.method === "POST" && suffix === "retract") {
    const session = await requireStudioOperator(request, env, "publish:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftRetractRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      await markStudioBriefDraftRetracted(database, { briefId, retractedAt: now });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.retracted",
        "Publish candidate retracted.",
        now,
      );
      return noContent();
    });
  }

  if (request.method === "POST" && suffix === "promotion-receipt") {
    const session = await requireStudioOperator(request, env, "publish:briefs");
    if (session instanceof Response) return session;
    const database = requireD1Database(env);
    if (database instanceof Response) return database;
    const body = await parseJsonRequest(request, StudioBriefDraftPromotionReceiptRequestSchema);
    if (!body.ok) return body.response;
    return withStudioBriefDraftIdempotency(request, env, url, async () => {
      const now = new Date().toISOString();
      const record = await getRequiredDraftRecord(env, session, briefId);
      if (record instanceof Response) return record;
      if (record.draft.status !== "publish_candidate") {
        return errorJson(409, "Draft must be a publish candidate before recording promotion.");
      }
      await recordStudioBriefPromotionReceipt(database, {
        briefId,
        candidateId: body.data.candidateId,
        targetBriefId: body.data.targetBriefId,
        artifactKey: body.data.artifactKey,
        artifactSha256: body.data.artifactSha256,
        recordedAt: body.data.promotedAt ?? now,
      });
      const updated = await getRequiredDraftRecord(env, session, briefId);
      if (updated instanceof Response) return updated;
      await appendStudioBriefDraftHistory(
        env,
        updated,
        session,
        "draft.promotion.recorded",
        `Published as ${body.data.targetBriefId}.`,
        now,
      );
      return draftJson(
        StudioBriefDraftPromotionReceiptResponseSchema.parse({
          draft: draftRecordToStudioDraft(updated),
        }),
      );
    });
  }

  if (request.method === "GET" && suffix === "publish-candidate-export") {
    const session = await requireStudioOperator(request, env, "publish:briefs");
    if (session instanceof Response) return session;
    const record = await getRequiredDraftRecord(env, session, briefId);
    if (record instanceof Response) return record;
    if (record.draft.status !== "publish_candidate" || record.draft.published_at === null) {
      return errorJson(409, "Draft has not been marked as a publish candidate.");
    }
    const generatedAt = new Date().toISOString();
    const validation = calculateStudioBriefDraftValidation(record, generatedAt);
    if (validation.blockingIssues.length > 0) {
      return errorJson(
        409,
        `Draft has blocking validation issues: ${validation.blockingIssues.join(" ")}`,
      );
    }
    const sourceBriefId = record.draft.source_brief_id;
    const projection =
      sourceBriefId === null
        ? await (async () => {
            const route = await loadStudioRouteProjection(env, record.draft.route_slug);
            return route.ok
              ? {
                  ok: true as const,
                  data: draftRecordToBriefProjection(record, route.route, route.quality),
                }
              : { ok: false as const, response: route.response };
          })()
        : await loadStudioBriefProjection(env, sourceBriefId);
    if (!projection.ok) return projection.response;
    const overlaid = overlayDraftOnBrief(projection.data, record);
    const candidateBrief = { ...overlaid.brief, id: briefId };
    const audit = await buildPublishCandidateAudit(record, validation);
    return draftJson(
      StudioBriefPublishCandidateExportResponseSchema.parse({
        briefId,
        sourceBriefId,
        candidateId: `${briefId}:${record.draft.published_at}`,
        artifactKey: `${studioProjectionPrefix(env)}/publish-candidates/${briefId}.json`,
        generatedAt,
        version: record.draft.version,
        publishedAt: record.draft.published_at,
        brief: candidateBrief,
        route: overlaid.route,
        history: { comments: overlaid.comments },
        audit,
      }),
    );
  }

  return errorJson(404, "Studio brief draft endpoint was not found.");
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

async function buildStudioResponse(request: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname === "/api/v1/studio/briefs" && request.method === "POST") {
    return handleStudioBriefCreate(request, env, url);
  }

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
    const brief = await loadStudioBriefProjection(env, briefId);
    if (!brief.ok) {
      if (brief.response.status === 404) {
        const draftOnly = await maybeLoadDraftOnlyBriefProjection(request, env, briefId);
        if (draftOnly !== null) {
          return draftOnly instanceof Response ? draftOnly : studioJson(draftOnly, env);
        }
      }
      return brief.response;
    }
    return studioJson(await maybeOverlayStudioBriefDraft(request, env, brief.data), env);
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

const SESSION_COOKIE = "bp_session";
const SESSION_MAX_AGE_SECONDS = 2592000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

function authError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status });
}

type ResolvedIdentity = {
  identity: { identityId: string; email: string; displayName: string | null } | null;
  operator: { workspaceId: string; scopes: string[] } | null;
};

async function resolveIdentity(request: Request, env: Env): Promise<ResolvedIdentity> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token === null || env.DB === undefined) {
    return { identity: null, operator: null };
  }
  const now = new Date().toISOString();
  const resolved = await getIdentityBySessionTokenHash(env.DB, await sha256Hex(token), now);
  if (resolved === null) {
    return { identity: null, operator: null };
  }
  await recordSessionUse(env.DB, { sessionId: resolved.session.sessionId, usedAt: now });
  const operator = await getOperatorRoleForIdentity(env.DB, resolved.identity.identityId);
  return {
    identity: {
      identityId: resolved.identity.identityId,
      email: resolved.identity.email,
      displayName: resolved.identity.displayName,
    },
    operator:
      operator === null ? null : { workspaceId: operator.workspaceId, scopes: operator.scopes },
  };
}

async function handleAuthRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/v1/me") {
    return json(await resolveIdentity(request, env));
  }

  if (url.pathname === "/api/v1/auth/magic-link/request" && request.method === "POST") {
    const parsed = MagicLinkRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || env.DB === undefined) {
      return new Response(null, { status: 204 });
    }
    const token = randomToken(32);
    const now = new Date().toISOString();
    await createMagicLinkRequest(env.DB, {
      identityId: randomToken(16),
      email: parsed.data.email,
      sessionId: randomToken(16),
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString(),
      now,
    });
    const link = `${url.origin}/auth/consume?token=${token}`;
    if (env.EMAIL !== undefined && env.AUTH_EMAIL_FROM !== undefined) {
      await env.EMAIL.send({
        to: parsed.data.email,
        from: env.AUTH_EMAIL_FROM,
        subject: "Your Bus Priority Studio sign-in link",
        html: `<p>Sign in: <a href="${link}">${link}</a></p>`,
        text: `Sign in: ${link}`,
      });
      return new Response(null, { status: 204 });
    }
    console.log(`magic-link sign-in for ${parsed.data.email}: ${link}`);
    if (env.ENVIRONMENT === "development") {
      return json({ __devMagicLink: link }, { status: 202 });
    }
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/api/v1/auth/magic-link/consume" && request.method === "POST") {
    const parsed = MagicLinkConsumeRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || env.DB === undefined) {
      return authError(401, "UNAUTHORIZED", "Invalid or expired magic-link token.");
    }
    const now = new Date().toISOString();
    const consumed = await consumeMagicLinkRequest(env.DB, {
      tokenHash: await sha256Hex(parsed.data.token),
      now,
    });
    if (consumed === null) {
      return authError(401, "UNAUTHORIZED", "Invalid or expired magic-link token.");
    }
    const identity = await getIdentityById(env.DB, consumed.identityId);
    if (identity === null) {
      return authError(401, "UNAUTHORIZED", "Identity is no longer active.");
    }
    const sessionToken = randomToken(32);
    await createSession(env.DB, {
      sessionId: randomToken(16),
      identityId: consumed.identityId,
      tokenHash: await sha256Hex(sessionToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      userAgent: request.headers.get("user-agent"),
      ipHash: null,
      now,
    });
    const operator = await getOperatorRoleForIdentity(env.DB, consumed.identityId);
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
    headers.append("Set-Cookie", sessionCookie(sessionToken, SESSION_MAX_AGE_SECONDS));
    return new Response(
      JSON.stringify({
        identity: {
          identityId: identity.identityId,
          email: identity.email,
          displayName: identity.displayName,
        },
        operator:
          operator === null ? null : { workspaceId: operator.workspaceId, scopes: operator.scopes },
        session: { kind: "session" },
      }),
      { status: 200, headers },
    );
  }

  if (url.pathname === "/api/v1/auth/signout" && request.method === "POST") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token !== null && env.DB !== undefined) {
      const now = new Date().toISOString();
      const resolved = await getIdentityBySessionTokenHash(env.DB, await sha256Hex(token), now);
      if (resolved !== null) {
        await revokeSession(env.DB, { sessionId: resolved.session.sessionId, now });
      }
    }
    const headers = new Headers();
    headers.append("Set-Cookie", sessionCookie("", 0));
    return new Response(null, { status: 204, headers });
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env = {}, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const authResponse = await handleAuthRoutes(request, env, url);
    if (authResponse !== null) {
      return authResponse;
    }

    if (url.pathname === "/api/v1/rum" && request.method === "POST") {
      return handleRumReport(request);
    }

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

    if (url.pathname.match(/^\/api\/v1\/studio\/briefs\/[^/]+\/draft(?:\/.*)?$/)) {
      return withServerTiming("studio-draft", () => handleBriefDraftRoutes(request, env, url, ctx));
    }

    if (url.pathname === "/api/v1/studio" || url.pathname.startsWith("/api/v1/studio/")) {
      return withServerTiming("studio", () => buildStudioResponse(request, url, env));
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
      return serveSpaFallback(request, url, env.ASSETS);
    }

    if (canServeSpaFallback(request, url) && isLocalDevHost(url.hostname)) {
      return withSpaSeo(request, url, await fetch(new Request(new URL("/", request.url), request)));
    }

    // Non-navigation requests (static files in production, Vite client modules in dev) are
    // served by the assets layer. Required because run_worker_first routes every path through
    // the Worker, including Vite's /src, /@fs, and /node_modules module requests. API paths are
    // excluded so unmatched endpoints return 404 rather than the SPA shell.
    if (env.ASSETS !== undefined && !isApiPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
  async scheduled(controller: ScheduledController, env: Env = {}): Promise<void> {
    await runScheduledProductionRefresh(env, { cron: controller.cron });
  },
} satisfies ExportedHandler<Env>;
