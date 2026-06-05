import { studioApiRoutes } from "./registry.js";

type CompiledRoute = {
  method: string;
  path: string;
  regex: RegExp;
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
    }),
  );

const apiRoutes = studioApiRoutes.map(
  (route): CompiledRoute => ({
    method: route.method,
    path: route.path,
    regex: compileRoutePath(route.path),
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
