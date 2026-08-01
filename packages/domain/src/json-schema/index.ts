import { MapManifestResponseSchema } from "../maps/index.js";
import {
  HealthResponseSchema,
  ReleaseStatusResponseSchema,
  RouteScorecardSchema,
} from "../routes/index.js";
import { toProjectJsonSchema } from "../schema-registry.js";
import { StudioDocsResponseSchema, StudioMethodsResponseSchema } from "../studio/docs/index.js";
import {
  StudioCompareResponseSchema,
  StudioReleasePayloadSchema,
  StudioSearchResponseSchema,
} from "../studio/release.js";
import {
  StudioInterventionsEvidenceResponseSchema,
  StudioRouteEvidenceArtifactSchema,
  StudioRouteEvidenceBundleSchema,
  StudioRouteEvidenceIndexSchema,
} from "../studio/route-evidence.js";
import {
  StudioRouteDetailResponseSchema,
  StudioRouteHistoryResponseSchema,
  StudioRouteHourlyProfileResponseSchema,
  StudioRouteSectionsResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
  StudioRoutesResponseSchema,
} from "../studio/routes/index.js";
import {
  StudioRouteIndex2ResponseSchema,
  StudioRouteIndex3ResponseSchema,
  StudioSnapshotResponseSchema,
} from "../studio/snapshots.js";

export { toProjectJsonSchema } from "../schema-registry.js";

export const routeScorecardJsonSchema = toProjectJsonSchema(RouteScorecardSchema);
export const healthResponseJsonSchema = toProjectJsonSchema(HealthResponseSchema);
export const releaseStatusResponseJsonSchema = toProjectJsonSchema(ReleaseStatusResponseSchema);
export const mapManifestResponseJsonSchema = toProjectJsonSchema(MapManifestResponseSchema);

export const studioRoutesResponseJsonSchema = toProjectJsonSchema(StudioRoutesResponseSchema);
export const studioSearchResponseJsonSchema = toProjectJsonSchema(StudioSearchResponseSchema);
export const studioRouteIndex2ResponseJsonSchema = toProjectJsonSchema(
  StudioRouteIndex2ResponseSchema,
);
export const studioRouteIndex3ResponseJsonSchema = toProjectJsonSchema(
  StudioRouteIndex3ResponseSchema,
);
export const studioRouteSectionsResponseJsonSchema = toProjectJsonSchema(
  StudioRouteSectionsResponseSchema,
);
export const studioRouteDetailResponseJsonSchema = toProjectJsonSchema(
  StudioRouteDetailResponseSchema,
);
export const studioRouteHistoryResponseJsonSchema = toProjectJsonSchema(
  StudioRouteHistoryResponseSchema,
);
export const studioRouteHourlyProfileResponseJsonSchema = toProjectJsonSchema(
  StudioRouteHourlyProfileResponseSchema,
);
export const studioRouteSpeedHistoryResponseJsonSchema = toProjectJsonSchema(
  StudioRouteSpeedHistoryResponseSchema,
);
export const studioRouteEvidenceArtifactJsonSchema = toProjectJsonSchema(
  StudioRouteEvidenceArtifactSchema,
);
export const studioRouteEvidenceBundleJsonSchema = toProjectJsonSchema(
  StudioRouteEvidenceBundleSchema,
);
export const studioRouteEvidenceIndexJsonSchema = toProjectJsonSchema(
  StudioRouteEvidenceIndexSchema,
);
export const studioInterventionsEvidenceResponseJsonSchema = toProjectJsonSchema(
  StudioInterventionsEvidenceResponseSchema,
);
export const studioCompareResponseJsonSchema = toProjectJsonSchema(StudioCompareResponseSchema);
export const studioMethodsResponseJsonSchema = toProjectJsonSchema(StudioMethodsResponseSchema);
export const studioDocsResponseJsonSchema = toProjectJsonSchema(StudioDocsResponseSchema);
export const studioSnapshotResponseJsonSchema = toProjectJsonSchema(StudioSnapshotResponseSchema);
export const studioReleasePayloadJsonSchema = toProjectJsonSchema(StudioReleasePayloadSchema);
