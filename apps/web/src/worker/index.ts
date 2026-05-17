import { createD1ServingDb, getRouteScorecard } from "@bp/db/d1";
import {
  HealthResponseSchema,
  healthResponseJsonSchema,
  IsoMonthSchema,
  RouteIdCodec,
  RouteScorecardSchema,
  routeScorecardJsonSchema,
} from "@bp/domain";
import * as z from "zod";
import { runScheduledProductionRefresh } from "./source-refresh.js";

export type Env = {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  GTFS_RT_RAW?: R2Bucket;
  MTA_BUS_TIME_API_KEY?: string;
  LAST_BUILT_SPEED_MONTH?: string;
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

function errorJson(status: number, message: string): Response {
  return json({ error: { message } }, { status });
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

    if (url.pathname.match(/^\/api\/routes\/[^/]+\/scorecard$/)) {
      return buildRouteScorecardResponse(url, env);
    }

    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env = {}): Promise<void> {
    await runScheduledProductionRefresh(env);
  },
} satisfies ExportedHandler<Env>;
