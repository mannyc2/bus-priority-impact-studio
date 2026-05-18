import { extname, join, normalize } from "node:path";
import {
  buildStudioCompareProjection,
  getStudioRoute,
  type StudioBriefsResponse,
  type StudioFindingsResponse,
  type StudioRoutesResponse,
} from "@bp/domain";

const distRoot = "apps/web/dist/client";
const artifactRoot = "data/artifacts/studio/v1";
const port = Number.parseInt(envVar("BP_WEB_SMOKE_PORT") ?? "4173", 10);
const hostname = envVar("BP_WEB_SMOKE_HOST") ?? "127.0.0.1";

const routesProjection = await readStudioJson<StudioRoutesResponse>("routes.json");

const server = Bun.serve({
  hostname,
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/v1/studio/")) {
      return studioApiResponse(url);
    }

    return staticResponse(url);
  },
});

console.log(`web smoke server listening at http://${server.hostname}:${server.port}`);

async function studioApiResponse(url: URL): Promise<Response> {
  if (url.pathname === "/api/v1/studio/search") {
    const [findings, briefs] = await Promise.all([
      readStudioJson<StudioFindingsResponse>("findings.json"),
      readStudioJson<StudioBriefsResponse>("briefs.json"),
    ]);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const terms = searchTerms(query);

    return json({
      schemaVersion: 1,
      generatedAt: routesProjection.generatedAt,
      query,
      routes: routesProjection.routes.filter((route) =>
        textIncludesAnyTerm(
          [
            route.slug,
            route.routeId,
            route.label,
            route.corridor,
            route.borough,
            route.reliability,
            route.diagnosis,
            route.sbs ? "sbs select bus service" : "local",
          ].join(" "),
          terms,
        ),
      ),
      findings: findings.findings.filter(({ finding }) =>
        textIncludesAnyTerm(
          [
            finding.id,
            finding.category,
            finding.title,
            finding.body,
            finding.metric,
            finding.routeSlug,
          ].join(" "),
          terms,
        ),
      ),
      briefs: briefs.briefs.filter(({ brief }) =>
        textIncludesAnyTerm(
          [
            brief.id,
            brief.title,
            brief.summary,
            brief.status,
            brief.routeSlug,
            ...brief.claims,
          ].join(" "),
          terms,
        ),
      ),
      quality: routesProjection.quality,
    });
  }

  if (url.pathname === "/api/v1/studio/compare") {
    const routeA = getStudioRoute(routesProjection, url.searchParams.get("a") ?? "");
    const routeB = getStudioRoute(routesProjection, url.searchParams.get("b") ?? "");
    if (routeA === undefined || routeB === undefined) {
      return json(
        { error: { message: "One or more Studio comparison routes were not found." } },
        404,
      );
    }

    return json(
      buildStudioCompareProjection(
        {
          schemaVersion: 1,
          generatedAt: routesProjection.generatedAt,
          quality: routesProjection.quality,
          routes: routesProjection.routes,
          segments: [],
          findings: [],
          briefs: [],
          versions: [],
          comments: [],
          methods: [],
          docsSections: [],
          docsEndpoints: [],
        },
        routeA,
        routeB,
      ),
    );
  }

  const artifactPath = studioArtifactPath(url.pathname);
  if (artifactPath === null) {
    return json({ error: { message: "Studio API endpoint was not found." } }, 404);
  }

  const file = Bun.file(join(artifactRoot, artifactPath));
  if (!(await file.exists())) {
    return json({ error: { message: "Studio API projection artifact was not found." } }, 404);
  }

  return new Response(file, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
      "X-Studio-Release": "studio/v1",
    },
  });
}

async function staticResponse(url: URL): Promise<Response> {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(distRoot, normalizedPath);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return new Response(file, {
      headers: { "Content-Type": contentType(filePath) },
    });
  }

  return new Response(Bun.file(join(distRoot, "index.html")), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function studioArtifactPath(pathname: string): string | null {
  if (pathname === "/api/v1/studio/routes") {
    return "routes.json";
  }
  if (pathname === "/api/v1/studio/findings") {
    return "findings.json";
  }
  if (pathname === "/api/v1/studio/briefs") {
    return "briefs.json";
  }
  if (pathname === "/api/v1/studio/methods") {
    return "methods.json";
  }
  if (pathname === "/api/v1/studio/docs") {
    return "docs.json";
  }

  const routeMatch = pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)(?:\/ladder)?$/);
  if (routeMatch) {
    const slug = decodeURIComponent(routeMatch[1] ?? "");
    return pathname.endsWith("/ladder")
      ? `routes/${slug}/ladder.json`
      : `routes/${slug}/index.json`;
  }

  const findingMatch = pathname.match(/^\/api\/v1\/studio\/findings\/([^/]+)$/);
  if (findingMatch) {
    return `findings/${decodeURIComponent(findingMatch[1] ?? "")}/index.json`;
  }

  const briefMatch = pathname.match(
    /^\/api\/v1\/studio\/briefs\/([^/]+)(?:\/(?:evidence|history))?$/,
  );
  if (briefMatch) {
    return `briefs/${decodeURIComponent(briefMatch[1] ?? "")}/index.json`;
  }

  return null;
}

async function readStudioJson<T>(path: string): Promise<T> {
  return (await Bun.file(join(artifactRoot, path)).json()) as T;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function textIncludesAnyTerm(text: string, terms: readonly string[]): boolean {
  const normalizedText = text.toLowerCase();
  return terms.length === 0 || terms.some((term) => normalizedText.includes(term));
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function envVar(name: string): string | undefined {
  return process.env[name];
}
