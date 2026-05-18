import type * as z from "zod";
import {
  StudioBriefResponseSchema,
  StudioBriefsResponseSchema,
  StudioCompareResponseSchema,
  StudioDocsResponseSchema,
  StudioFindingResponseSchema,
  StudioFindingsResponseSchema,
  StudioMethodsResponseSchema,
  StudioRouteDetailResponseSchema,
  StudioRouteLadderResponseSchema,
  StudioRoutesResponseSchema,
  StudioSearchResponseSchema,
} from "./api-contract.js";

type StudioApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class StudioApiError extends Error {
  override readonly name = "StudioApiError";
  readonly status: number;
  readonly path: string;
  readonly code: string;

  constructor({
    status,
    path,
    code,
    message,
  }: {
    status: number;
    path: string;
    code?: string;
    message?: string;
  }) {
    super(message ?? `Studio API request failed: ${status} ${path}`);
    this.status = status;
    this.path = path;
    this.code = code ?? `HTTP_${status}`;
  }
}

export class StudioApiContractError extends Error {
  override readonly name = "StudioApiContractError";
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Studio API response failed contract validation: ${path}`);
    this.path = path;
    this.cause = cause;
  }
}

async function readErrorBody(response: Response): Promise<StudioApiErrorBody | null> {
  try {
    return (await response.json()) as StudioApiErrorBody;
  } catch {
    return null;
  }
}

async function apiError(response: Response, path: string): Promise<StudioApiError> {
  const body = await readErrorBody(response);
  return new StudioApiError({
    status: response.status,
    path,
    ...(body?.error?.code ? { code: body.error.code } : {}),
    ...(body?.error?.message ? { message: body.error.message } : {}),
  });
}

async function loadStudioJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw await apiError(response, path);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new StudioApiContractError(path, parsed.error);
  }

  return parsed.data;
}

async function loadNullableStudioJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.output<TSchema> | null> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await apiError(response, path);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new StudioApiContractError(path, parsed.error);
  }

  return parsed.data;
}

export function fetchStudioRoutes() {
  return loadStudioJson("/api/v1/studio/routes", StudioRoutesResponseSchema);
}

export function fetchStudioSearch(query: string) {
  const params = new URLSearchParams({ q: query });
  return loadStudioJson(`/api/v1/studio/search?${params.toString()}`, StudioSearchResponseSchema);
}

export function fetchStudioRoute(routeId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/routes/${encodeURIComponent(routeId)}`,
    StudioRouteDetailResponseSchema,
  );
}

export function fetchStudioRouteLadder(routeId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/routes/${encodeURIComponent(routeId)}/ladder`,
    StudioRouteLadderResponseSchema,
  );
}

export function fetchStudioCompare(a: string, b: string) {
  const params = new URLSearchParams({ a, b });
  return loadNullableStudioJson(
    `/api/v1/studio/compare?${params.toString()}`,
    StudioCompareResponseSchema,
  );
}

export function fetchStudioFindings() {
  return loadStudioJson("/api/v1/studio/findings", StudioFindingsResponseSchema);
}

export function fetchStudioFinding(findingId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/findings/${encodeURIComponent(findingId)}`,
    StudioFindingResponseSchema,
  );
}

export function fetchStudioBriefs() {
  return loadStudioJson("/api/v1/studio/briefs", StudioBriefsResponseSchema);
}

export function fetchStudioBrief(briefId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/briefs/${encodeURIComponent(briefId)}`,
    StudioBriefResponseSchema,
  );
}

export function fetchStudioBriefEvidence(briefId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/briefs/${encodeURIComponent(briefId)}/evidence`,
    StudioBriefResponseSchema,
  );
}

export function fetchStudioBriefHistory(briefId: string) {
  return loadNullableStudioJson(
    `/api/v1/studio/briefs/${encodeURIComponent(briefId)}/history`,
    StudioBriefResponseSchema,
  );
}

export function fetchStudioMethods() {
  return loadStudioJson("/api/v1/studio/methods", StudioMethodsResponseSchema);
}

export function fetchStudioDocs() {
  return loadStudioJson("/api/v1/studio/docs", StudioDocsResponseSchema);
}
