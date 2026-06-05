export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isStudioApiPath(pathname: string): boolean {
  return pathname === "/api/v1/studio" || pathname.startsWith("/api/v1/studio/");
}

export function studioRouteTemplate(pathname: string): string {
  if (pathname === "/api/v1/studio/routes") return "/api/v1/studio/routes";
  if (pathname === "/api/v1/studio/search") return "/api/v1/studio/search";
  if (pathname === "/api/v1/studio/compare") return "/api/v1/studio/compare";
  if (pathname === "/api/v1/studio/findings") return "/api/v1/studio/findings";
  if (pathname === "/api/v1/studio/briefs") return "/api/v1/studio/briefs";
  if (pathname === "/api/v1/studio/methods") return "/api/v1/studio/methods";
  if (pathname === "/api/v1/studio/docs") return "/api/v1/studio/docs";
  if (pathname === "/api/v1/studio/snapshot") return "/api/v1/studio/snapshot";
  if (/^\/api\/v1\/studio\/routes\/[^/]+\/ladder$/.test(pathname)) {
    return "/api/v1/studio/routes/:routeId/ladder";
  }
  if (/^\/api\/v1\/studio\/routes\/[^/]+$/.test(pathname)) {
    return "/api/v1/studio/routes/:routeId";
  }
  if (/^\/api\/v1\/studio\/findings\/[^/]+$/.test(pathname)) {
    return "/api/v1/studio/findings/:findingId";
  }
  if (/^\/api\/v1\/studio\/briefs\/[^/]+\/draft(?:\/.*)?$/.test(pathname)) {
    return "/api/v1/studio/briefs/:briefId/draft*";
  }
  if (/^\/api\/v1\/studio\/briefs\/[^/]+\/evidence$/.test(pathname)) {
    return "/api/v1/studio/briefs/:briefId/evidence";
  }
  if (/^\/api\/v1\/studio\/briefs\/[^/]+\/history$/.test(pathname)) {
    return "/api/v1/studio/briefs/:briefId/history";
  }
  if (/^\/api\/v1\/studio\/briefs\/[^/]+$/.test(pathname)) {
    return "/api/v1/studio/briefs/:briefId";
  }
  return isStudioApiPath(pathname) ? "/api/v1/studio/*" : pathname;
}
