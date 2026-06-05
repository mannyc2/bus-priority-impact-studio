import {
  healthResponseJsonSchema,
  hotspotListResponseJsonSchema,
  mapManifestResponseJsonSchema,
  releaseStatusResponseJsonSchema,
  routeCompareResponseJsonSchema,
  routeListResponseJsonSchema,
  routeProfileResponseJsonSchema,
  routeScorecardJsonSchema,
} from "@bp/domain";
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

  return null;
}
