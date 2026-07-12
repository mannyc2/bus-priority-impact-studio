import { studioApiRoutes } from "./registry.js";
import type { RouteSpec } from "./route-spec.js";

type CompiledRoute = {
  method: string;
  path: string;
  regex: RegExp;
  spec: RouteSpec;
};

export type RouteMatch = {
  spec: RouteSpec;
  params: Readonly<Record<string, string>>;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRoutePath(path: string): RegExp {
  const wildcard = path.endsWith("*");
  const normalizedPath = wildcard ? path.slice(0, -1) : path;
  const pattern = normalizedPath
    .split("/")
    .map((part) => {
      if (part.startsWith(":")) return "[^/]+";
      return escapeRegex(part);
    })
    .join("/");

  return new RegExp(`^${pattern}${wildcard ? "(?:/.*)?$" : "$"}`);
}

const studioRouteTemplates = studioApiRoutes
  .filter((route) => route.path.startsWith("/api/v1/studio/"))
  .sort((left, right) => {
    const leftWildcard = left.path.endsWith("*") ? 1 : 0;
    const rightWildcard = right.path.endsWith("*") ? 1 : 0;
    return leftWildcard - rightWildcard || right.path.length - left.path.length;
  })
  .map(
    (route): CompiledRoute => ({
      method: route.method,
      path: route.path,
      regex: compileRoutePath(route.path),
      spec: route,
    }),
  );

const apiRoutes = studioApiRoutes.map(
  (route): CompiledRoute => ({
    method: route.method,
    path: route.path,
    regex: compileRoutePath(route.path),
    spec: route,
  }),
);

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isStudioApiPath(pathname: string): boolean {
  return pathname === "/api/v1/studio" || pathname.startsWith("/api/v1/studio/");
}

export function studioRouteTemplate(pathname: string): string {
  const match = studioRouteTemplates.find((route) => route.regex.test(pathname));
  if (match !== undefined) return match.path;

  return isStudioApiPath(pathname) ? "/api/v1/studio/*" : pathname;
}

export function allowedApiMethodsForPath(pathname: string): readonly string[] {
  const methods = apiRoutes
    .filter((route) => route.regex.test(pathname))
    .map((route) => route.method);

  return [...new Set(methods)].sort();
}

export function findRouteSpec(method: string, pathname: string): RouteSpec | null {
  return matchRouteSpec(method, pathname)?.spec ?? null;
}

function routeParams(path: string, pathname: string): Readonly<Record<string, string>> {
  const pathParts = path.split("/");
  const pathnameParts = pathname.split("/");
  const params: Record<string, string> = {};
  for (let index = 0; index < pathParts.length; index += 1) {
    const part = pathParts[index];
    if (part === undefined || !part.startsWith(":")) continue;
    const wildcard = part.endsWith("*");
    const name = part.slice(1, wildcard ? -1 : undefined);
    params[name] = wildcard ? pathnameParts.slice(index).join("/") : (pathnameParts[index] ?? "");
  }
  return params;
}

export function matchRouteSpec(method: string, pathname: string): RouteMatch | null {
  const normalizedMethod = method.toUpperCase();
  const match = apiRoutes.find(
    (route) => route.method === normalizedMethod && route.regex.test(pathname),
  );

  return match === undefined
    ? null
    : { spec: match.spec, params: routeParams(match.path, pathname) };
}
