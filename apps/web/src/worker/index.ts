import { HealthResponseSchema, healthResponseJsonSchema } from "@bp/domain";

export type Env = {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
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

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return buildHealthResponse();
    }

    if (url.pathname === "/api/schema/health") {
      return json(healthResponseJsonSchema);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
