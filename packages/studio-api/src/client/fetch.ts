import {
  buildRoutePath,
  getStudioApiRoute,
  type PathBuildInput,
  type StudioApiRouteId,
} from "../contracts/index.js";

type StudioApiCredentials = "omit" | "same-origin" | "include";
type StudioApiHeadersInit = ConstructorParameters<typeof Headers>[0];

export type StudioApiClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  credentials?: StudioApiCredentials;
  headers?: StudioApiHeadersInit | (() => StudioApiHeadersInit | Promise<StudioApiHeadersInit>);
};

export type StudioApiRequestInput = PathBuildInput & {
  body?: unknown;
};

async function resolveHeaders(
  headers: StudioApiClientOptions["headers"],
): Promise<StudioApiHeadersInit | undefined> {
  return typeof headers === "function" ? headers() : headers;
}

function resolveRequestUrl(path: string, baseUrl: string | undefined): string {
  if (baseUrl === undefined) return path;
  return String(new URL(path, baseUrl));
}

function encodeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return JSON.stringify(body);
}

export function createStudioApiClient(options: StudioApiClientOptions = {}) {
  const doFetch = options.fetch ?? fetch;

  return {
    path(routeId: StudioApiRouteId, input: PathBuildInput = {}): string {
      return buildRoutePath(getStudioApiRoute(routeId), input);
    },

    async request(routeId: StudioApiRouteId, input: StudioApiRequestInput = {}): Promise<unknown> {
      const route = getStudioApiRoute(routeId);
      const headers = new Headers(await resolveHeaders(options.headers));
      const body = encodeBody(input.body, headers);
      const init: RequestInit & { credentials?: StudioApiCredentials } = {
        method: route.method,
        headers,
        credentials: options.credentials ?? "same-origin",
      };
      if (body !== undefined) {
        init.body = body;
      }

      const response = await doFetch(
        resolveRequestUrl(buildRoutePath(route, input), options.baseUrl),
        init,
      );

      if (!response.ok) {
        throw new StudioApiClientError(response, await response.text());
      }

      if (response.status === 204) return null;
      return response.json();
    },
  };
}

export class StudioApiClientError extends Error {
  constructor(
    readonly response: Response,
    readonly responseText: string,
  ) {
    super(`Studio API request failed: ${response.status}`);
  }
}
