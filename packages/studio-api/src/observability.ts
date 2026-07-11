import { HealthResponseSchema } from "@bp/domain/routes";
import { RumReportSchema } from "@bp/domain/studio/rum";
import { Result } from "effect";
import { errorResponse as errorJson } from "./http/errors.js";
import { jsonResponse as json } from "./http/json.js";
import { decodeSchemaEitherStrict, decodeSchemaStrict } from "./schema-decode.js";

export function buildHealthResponse(now = new Date()): Response {
  const body = decodeSchemaStrict(HealthResponseSchema, {
    ok: true,
    service: "bus-priority-impact-studio",
    checkedAt: now.toISOString(),
  });

  return json(body);
}

// Real-user web-vitals beacon. Reports are emitted as structured JSON logs and
// read back through Workers Logs/Observability — no binding or storage needed.
// The RumReportSchema contract lives in @bp/domain and is shared with the browser reporter.
async function handleRumReport(request: Request): Promise<Response> {
  const parsed = decodeSchemaEitherStrict(RumReportSchema, await request.json().catch(() => null));
  if (Result.isFailure(parsed)) {
    return errorJson(400, "Invalid web-vitals report.");
  }

  const report = parsed.success;
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

export async function handleObservabilityRoutes(
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (url.pathname === "/api/v1/rum" && request.method === "POST") {
    return handleRumReport(request);
  }

  if (url.pathname === "/api/health") {
    return buildHealthResponse();
  }

  return null;
}
