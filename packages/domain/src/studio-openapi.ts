import {
  studioBriefResponseJsonSchema,
  studioBriefsResponseJsonSchema,
  studioCompareResponseJsonSchema,
  studioDocsResponseJsonSchema,
  studioFindingResponseJsonSchema,
  studioFindingsResponseJsonSchema,
  studioMethodsResponseJsonSchema,
  studioRouteDetailResponseJsonSchema,
  studioRouteLadderResponseJsonSchema,
  studioRoutesResponseJsonSchema,
  studioSearchResponseJsonSchema,
} from "./studio-schemas.js";

type HttpMethod = "get" | "post" | "patch";

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
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
    required: ["error"],
  });
}

const routeSlugParameter = {
  name: "routeId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
  description: "Canonical Studio route slug, such as m15-sbs.",
};

const findingIdParameter = {
  name: "findingId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
};

const briefIdParameter = {
  name: "briefId",
  in: "path" as const,
  required: true,
  schema: { type: "string" },
};

function getOperation(
  operationId: string,
  summary: string,
  responseSchema: unknown,
  parameters: Operation["parameters"] = [],
): Operation {
  return {
    operationId,
    summary,
    tags: ["Studio"],
    parameters,
    responses: {
      "200": jsonResponse("Studio response", responseSchema),
      "404": errorResponse("Requested Studio entity was not found."),
      "503": errorResponse("Studio projection artifact or serving binding is unavailable."),
    },
  };
}

const paths: Record<string, Partial<Record<HttpMethod, Operation>>> = {
  "/api/v1/studio/routes": {
    get: getOperation(
      "listStudioRoutes",
      "List Studio route cards.",
      studioRoutesResponseJsonSchema,
    ),
  },
  "/api/v1/studio/search": {
    get: getOperation(
      "searchStudio",
      "Search routes, findings, and briefs.",
      studioSearchResponseJsonSchema,
      [
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Free-text Studio query.",
        },
      ],
    ),
  },
  "/api/v1/studio/routes/{routeId}": {
    get: getOperation(
      "getStudioRoute",
      "Fetch route detail, KPIs, diagnosis, and segment evidence.",
      studioRouteDetailResponseJsonSchema,
      [routeSlugParameter],
    ),
  },
  "/api/v1/studio/routes/{routeId}/ladder": {
    get: getOperation(
      "getStudioRouteLadder",
      "Fetch the ordered route ladder and segment severity.",
      studioRouteLadderResponseJsonSchema,
      [routeSlugParameter],
    ),
  },
  "/api/v1/studio/compare": {
    get: getOperation(
      "compareStudioRoutes",
      "Compare two Studio routes.",
      studioCompareResponseJsonSchema,
      [
        {
          name: "a",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Left route slug.",
        },
        {
          name: "b",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Right route slug.",
        },
      ],
    ),
  },
  "/api/v1/studio/findings": {
    get: getOperation(
      "listStudioFindings",
      "List source-backed Studio findings.",
      studioFindingsResponseJsonSchema,
    ),
  },
  "/api/v1/studio/findings/{findingId}": {
    get: getOperation(
      "getStudioFinding",
      "Fetch one finding and its reasoning trail.",
      studioFindingResponseJsonSchema,
      [findingIdParameter],
    ),
  },
  "/api/v1/studio/briefs": {
    get: getOperation("listStudioBriefs", "List Studio briefs.", studioBriefsResponseJsonSchema),
  },
  "/api/v1/studio/briefs/{briefId}": {
    get: getOperation("getStudioBrief", "Fetch one Studio brief.", studioBriefResponseJsonSchema, [
      briefIdParameter,
    ]),
  },
  "/api/v1/studio/briefs/{briefId}/evidence": {
    get: getOperation(
      "getStudioBriefEvidence",
      "Fetch evidence-focused data for a Studio brief.",
      studioBriefResponseJsonSchema,
      [briefIdParameter],
    ),
  },
  "/api/v1/studio/briefs/{briefId}/history": {
    get: getOperation(
      "getStudioBriefHistory",
      "Fetch version history and review context for a Studio brief.",
      studioBriefResponseJsonSchema,
      [briefIdParameter],
    ),
  },
  "/api/v1/studio/methods": {
    get: getOperation(
      "getStudioMethods",
      "Fetch dataset and methodology metadata.",
      studioMethodsResponseJsonSchema,
    ),
  },
  "/api/v1/studio/docs": {
    get: getOperation(
      "getStudioDocs",
      "Fetch docs navigation and API metadata.",
      studioDocsResponseJsonSchema,
    ),
  },
};

export const studioOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Bus Priority Impact Studio API",
    version: "1.0.0",
    description:
      "Route-first Studio contracts consumed by the Bus Priority Impact Studio website and future generated agent/CLI surfaces.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  paths,
} as const;
