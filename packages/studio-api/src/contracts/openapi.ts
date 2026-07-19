import {
  healthResponseJsonSchema,
  hotspotListResponseJsonSchema,
  mapManifestResponseJsonSchema,
  releaseStatusResponseJsonSchema,
  routeListResponseJsonSchema,
  routeProfileResponseJsonSchema,
  studioRouteDetailResponseJsonSchema,
  studioRouteEvidenceBundleJsonSchema,
  studioRouteHistoryResponseJsonSchema,
  studioRouteHourlyProfileResponseJsonSchema,
  studioRouteIndex2ResponseJsonSchema,
  studioRouteIndex3ResponseJsonSchema,
  studioRouteSectionsResponseJsonSchema,
  studioRouteSpeedHistoryResponseJsonSchema,
  studioRoutesResponseJsonSchema,
  studioSnapshotResponseJsonSchema,
} from "@bp/domain/json-schema";

type HttpMethod = "delete" | "get" | "patch" | "post" | "put";

type Operation = {
  operationId: string;
  summary: string;
  tags: string[];
  parameters?: Array<{
    name: string;
    in: "path" | "query";
    required: boolean;
    schema: Record<string, unknown>;
    description?: string;
  }>;
  responses: Record<
    string,
    {
      description: string;
      content?: {
        "application/json": {
          schema: unknown;
        };
      };
    }
  >;
};

const routeIdParameter = {
  name: "routeId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Route id or canonical Studio route slug, such as M15+ or m15-sbs.",
};

const artifactKeyParameter = {
  name: "artifactKey",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Slash-delimited public R2 artifact key.",
};

const monthQueryParameter = {
  name: "month",
  in: "query" as const,
  required: false,
  schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
  description: "Optional YYYY-MM serving month.",
};
const studioRoutesSchemaQueryParameter = {
  name: "schema",
  in: "query" as const,
  required: false,
  schema: { type: "integer", enum: [2, 3] },
  description:
    "Use 3 for strict exact route identity, 2 for the legacy addressability index, or omit for route cards.",
};

function jsonResponse(description: string, schema: unknown) {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function errorResponse(description: string) {
  return jsonResponse(description, {
    type: "object",
    additionalProperties: false,
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
    required: ["error"],
  });
}

function getOperation(input: {
  operationId: string;
  summary: string;
  tags: string[];
  responseSchema: unknown;
  parameters?: Operation["parameters"];
}): Operation {
  return {
    operationId: input.operationId,
    summary: input.summary,
    tags: input.tags,
    ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
    responses: {
      "200": jsonResponse("Successful response.", input.responseSchema),
      "404": errorResponse("Requested entity was not found."),
      "503": errorResponse("Required serving binding or artifact is unavailable."),
    },
  };
}

const paths: Record<string, Partial<Record<HttpMethod, Operation>>> = {
  "/api/health": {
    get: getOperation({
      operationId: "getHealth",
      summary: "Return API health status.",
      tags: ["System"],
      responseSchema: healthResponseJsonSchema,
    }),
  },
  "/api/openapi.json": {
    get: getOperation({
      operationId: "getOpenApi",
      summary: "Return the OpenAPI document.",
      tags: ["System"],
      responseSchema: { type: "object", additionalProperties: true },
    }),
  },
  "/api/v1/rum": {
    post: {
      operationId: "postRum",
      summary: "Record browser route performance telemetry.",
      tags: ["Observability"],
      responses: {
        "204": { description: "Telemetry accepted." },
        "400": errorResponse("Request body failed validation."),
        "405": errorResponse("Method is not allowed."),
      },
    },
  },
  "/api/v1/status": {
    get: getOperation({
      operationId: "getReleaseStatus",
      summary: "Return current public serving release status.",
      tags: ["Public"],
      responseSchema: releaseStatusResponseJsonSchema,
      parameters: [monthQueryParameter],
    }),
  },
  "/api/v1/routes": {
    get: getOperation({
      operationId: "getRoutes",
      summary: "List public route cards.",
      tags: ["Public"],
      responseSchema: routeListResponseJsonSchema,
      parameters: [monthQueryParameter],
    }),
  },
  "/api/v1/routes/{routeId}/profile": {
    get: getOperation({
      operationId: "getRouteProfile",
      summary: "Return a public route profile.",
      tags: ["Public"],
      responseSchema: routeProfileResponseJsonSchema,
      parameters: [routeIdParameter, monthQueryParameter],
    }),
  },
  "/api/v1/map/manifest": {
    get: getOperation({
      operationId: "getMapManifest",
      summary: "Return map artifact metadata.",
      tags: ["Public"],
      responseSchema: mapManifestResponseJsonSchema,
      parameters: [monthQueryParameter],
    }),
  },
  "/api/v1/artifacts/{artifactKey}": {
    get: getOperation({
      operationId: "getArtifact",
      summary: "Fetch a public artifact by key.",
      tags: ["Public"],
      responseSchema: { type: "object", additionalProperties: true },
      parameters: [artifactKeyParameter],
    }),
  },
  "/api/v1/hotspots": {
    get: getOperation({
      operationId: "getHotspots",
      summary: "Return public hotspot summaries.",
      tags: ["Public"],
      responseSchema: hotspotListResponseJsonSchema,
      parameters: [monthQueryParameter],
    }),
  },
  "/api/v1/studio/routes": {
    get: getOperation({
      operationId: "getStudioRoutes",
      summary: "List Studio route projections.",
      tags: ["Studio"],
      parameters: [studioRoutesSchemaQueryParameter],
      responseSchema: {
        oneOf: [
          studioRoutesResponseJsonSchema,
          studioRouteIndex2ResponseJsonSchema,
          studioRouteIndex3ResponseJsonSchema,
        ],
      },
    }),
  },
  "/api/v1/studio/snapshot": {
    get: getOperation({
      operationId: "getStudioSnapshot",
      summary: "Return a compact Studio release snapshot.",
      tags: ["Studio"],
      responseSchema: studioSnapshotResponseJsonSchema,
    }),
  },
  "/api/v1/studio/routes/sections": {
    get: getOperation({
      operationId: "listStudioRouteSections",
      summary: "Return route discovery sections.",
      tags: ["Studio"],
      responseSchema: studioRouteSectionsResponseJsonSchema,
    }),
  },
  "/api/v1/studio/routes/{routeId}": {
    get: getOperation({
      operationId: "getStudioRoute",
      summary: "Return a Studio route detail projection.",
      tags: ["Studio"],
      responseSchema: studioRouteDetailResponseJsonSchema,
      parameters: [routeIdParameter],
    }),
  },
  "/api/v1/studio/routes/{routeId}/history": {
    get: getOperation({
      operationId: "getStudioRouteHistory",
      summary: "Return route-month speed and ridership history.",
      tags: ["Studio"],
      responseSchema: studioRouteHistoryResponseJsonSchema,
      parameters: [routeIdParameter],
    }),
  },
  "/api/v1/studio/routes/{routeId}/hourly-profile": {
    get: getOperation({
      operationId: "getStudioRouteHourlyProfile",
      summary: "Return route hourly ridership, speed, and reliability samples.",
      tags: ["Studio"],
      responseSchema: studioRouteHourlyProfileResponseJsonSchema,
      parameters: [routeIdParameter],
    }),
  },
  "/api/v1/studio/routes/{routeId}/speed-history": {
    get: getOperation({
      operationId: "getStudioRouteSpeedHistory",
      summary: "Return route-segment speed history by month and daypart.",
      tags: ["Studio"],
      responseSchema: studioRouteSpeedHistoryResponseJsonSchema,
      parameters: [routeIdParameter],
    }),
  },
  "/api/v1/studio/routes/{routeId}/timeline": {
    get: getOperation({
      operationId: "getStudioRouteTimeline",
      summary: "Return source-backed MTA-wiki route evidence for a route.",
      tags: ["Studio"],
      responseSchema: studioRouteEvidenceBundleJsonSchema,
      parameters: [routeIdParameter],
    }),
  },
};

export const studioOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Bus Priority Impact Studio API",
    version: "1.0.0",
    description:
      "Route-first read contracts consumed by the Bus Priority Impact Studio public website.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  paths,
} as const;
