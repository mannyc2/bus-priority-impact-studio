import type { StudioApiEnv } from "./env.js";

export type ServingDecodePolicyId =
  | "active_artifact_hash"
  | "active_artifact_identity"
  | "active_artifact_json"
  | "active_artifact_schema"
  | "active_d1_catalog"
  | "active_d1_row_schema"
  | "browser_artifact_hash"
  | "browser_artifact_json"
  | "browser_artifact_schema"
  | "active_pointer_required"
  | "optional_contract_absence";

export const SERVING_DECODE_POLICY_INVENTORY = [
  {
    id: "active_pointer_required",
    layer: "worker_request_boundary",
    disposition: "corrupt_fail_closed",
    rationale: "Public serving requires a fully resolved active candidate pointer.",
  },
  {
    id: "optional_contract_absence",
    layer: "worker_api_handlers",
    disposition: "absence_allowed",
    rationale: "Only fields declared nullable or optional by their response schema may be absent.",
  },
  {
    id: "active_d1_catalog",
    layer: "serving_d1_catalog",
    disposition: "corrupt_fail_closed",
    rationale:
      "A malformed pointer, release, candidate, or manifest cannot elect a partial release.",
  },
  {
    id: "active_d1_row_schema",
    layer: "serving_d1_rows",
    disposition: "corrupt_fail_closed",
    rationale: "Malformed required candidate rows cannot be rendered as missing evidence.",
  },
  {
    id: "active_artifact_hash",
    layer: "artifact_locator",
    disposition: "corrupt_fail_closed",
    rationale: "Object bytes and checksum metadata must match the active manifest.",
  },
  {
    id: "active_artifact_identity",
    layer: "artifact_locator",
    disposition: "corrupt_fail_closed",
    rationale:
      "A logical artifact must belong to the request-resolved candidate and retained release.",
  },
  {
    id: "active_artifact_json",
    layer: "worker_api_handlers",
    disposition: "corrupt_fail_closed",
    rationale: "Invalid JSON in a required active artifact is corruption, not absence.",
  },
  {
    id: "active_artifact_schema",
    layer: "worker_api_handlers",
    disposition: "corrupt_fail_closed",
    rationale: "A required active artifact that fails its schema cannot be silently omitted.",
  },
  {
    id: "browser_artifact_hash",
    layer: "browser_serving_decoder",
    disposition: "corrupt_fail_closed",
    rationale: "The browser preserves an explicit integrity_mismatch state.",
  },
  {
    id: "browser_artifact_json",
    layer: "browser_serving_decoder",
    disposition: "corrupt_fail_closed",
    rationale: "The browser preserves an explicit invalid_contract state for invalid JSON.",
  },
  {
    id: "browser_artifact_schema",
    layer: "browser_serving_decoder",
    disposition: "corrupt_fail_closed",
    rationale: "The browser preserves an explicit invalid_contract state for schema failure.",
  },
] as const satisfies ReadonlyArray<{
  id: ServingDecodePolicyId;
  layer:
    | "artifact_locator"
    | "browser_serving_decoder"
    | "serving_d1_catalog"
    | "serving_d1_rows"
    | "worker_api_handlers"
    | "worker_request_boundary";
  disposition: "absence_allowed" | "corrupt_fail_closed";
  rationale: string;
}>;

export class ServingDataCorruptionError extends Error {
  constructor(
    readonly code: ServingDecodePolicyId,
    message: string,
  ) {
    super(message);
    this.name = "ServingDataCorruptionError";
  }
}

export function servingArtifactCorruptionOrLegacyAbsence(
  env: Pick<StudioApiEnv, "SERVING_RELEASE_CONTEXT">,
  input: {
    code: "active_artifact_json" | "active_artifact_schema" | "active_artifact_identity";
    endpoint: string;
    logicalArtifactId: string;
    schemaId: string;
    requestId?: string | null | undefined;
  },
  cause?: unknown,
): null {
  const context = env.SERVING_RELEASE_CONTEXT;
  if (context === undefined) return null;
  const causeName =
    cause instanceof Error ? cause.name : cause === undefined ? null : "UnknownError";
  console.error("Active serving data failed closed.", {
    code: input.code,
    endpoint: input.endpoint,
    logicalArtifactId: input.logicalArtifactId,
    schemaId: input.schemaId,
    candidateId: context.candidate.candidateId,
    releaseId: context.release.releaseId,
    requestId: input.requestId ?? null,
    causeName,
  });
  throw new ServingDataCorruptionError(
    input.code,
    `Active artifact ${input.logicalArtifactId} failed ${input.code}.`,
  );
}
