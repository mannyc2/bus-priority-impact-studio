import { jsonResponse } from "./json.js";

export function errorCodeForStatus(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "UNPROCESSABLE_ENTITY";
  if (status === 502) return "BAD_GATEWAY";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return `HTTP_${status}`;
}

export function errorResponse(
  status: number,
  message: string,
  code = errorCodeForStatus(status),
): Response {
  return jsonResponse({ error: { code, message } }, { status });
}
