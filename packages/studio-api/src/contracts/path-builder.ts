import type { RouteSpec } from "./route-spec.js";

export type PathBuildInput = {
  params?: Readonly<Record<string, string | number | boolean>>;
  query?: Readonly<
    Record<
      string,
      string | number | boolean | null | undefined | readonly (string | number | boolean)[]
    >
  >;
};

function encodePathValue(value: string | number | boolean): string {
  return encodeURIComponent(String(value));
}

function appendQueryValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(params, key, item);
    }
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    params.append(key, String(value));
  }
}

export function buildRoutePath(route: Pick<RouteSpec, "path">, input: PathBuildInput = {}): string {
  const params = input.params ?? {};
  const path = route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path param: ${key}`);
    }

    return encodePathValue(value);
  });

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(query, key, value);
  }

  const queryString = query.toString();
  return queryString.length === 0 ? path : `${path}?${queryString}`;
}
