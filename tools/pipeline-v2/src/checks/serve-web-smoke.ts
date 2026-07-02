import { extname, join, normalize } from "node:path";
import type { StudioRoutesResponse } from "@bp/domain/studio/routes";

const distRoot = "apps/web/dist/client";
const artifactRoot = "data/artifacts/studio/v1";
const port = Number.parseInt(envVar("BP_WEB_SMOKE_PORT") ?? "4173", 10);
const hostname = envVar("BP_WEB_SMOKE_HOST") ?? "127.0.0.1";

await readStudioJson<StudioRoutesResponse>("routes.json");

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

  if (pathname === "/api/v1/studio/methods") {
    return "methods.json";
  }

  const routeMatch = pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)$/);
  if (routeMatch) {
    return `routes/${decodeURIComponent(routeMatch[1] ?? "")}/index.json`;
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
    default:
      return "application/octet-stream";
  }
}

function envVar(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? undefined : value;
}
