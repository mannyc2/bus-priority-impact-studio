import {
  healthResponseJsonSchema,
  mapManifestResponseJsonSchema,
  releaseStatusResponseJsonSchema,
  routeScorecardJsonSchema,
} from "@bp/domain/json-schema";
import { studioOpenApiDocument } from "./contracts/openapi.js";
import { jsonResponse as json } from "./http/json.js";

export function handleSchemaRoutes(url: URL): Response | null {
  if (url.pathname === "/api/schema/health") {
    return json(healthResponseJsonSchema);
  }

  if (url.pathname === "/api/schema/route-scorecard") {
    return json(routeScorecardJsonSchema);
  }

  if (url.pathname === "/api/schema/release-status") {
    return json(releaseStatusResponseJsonSchema);
  }

  if (url.pathname === "/api/schema/map-manifest") {
    return json(mapManifestResponseJsonSchema);
  }

  if (url.pathname === "/api/openapi.json") {
    return json(studioOpenApiDocument);
  }

  return null;
}
