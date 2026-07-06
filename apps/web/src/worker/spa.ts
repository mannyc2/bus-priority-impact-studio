import { isApiPath } from "@bp/studio-api/contracts";
import { getStudioSeoMetadata, injectSeoIntoHtml } from "../studio/seo.js";

export function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

export function canServeSpaFallback(request: Request, url: URL): boolean {
  return (
    !isApiPath(url.pathname) &&
    !hasFileExtension(url.pathname) &&
    (request.method === "GET" || request.method === "HEAD")
  );
}

const publicStudioPathPatterns = [
  /^\/$/,
  /^\/(?:interventions|map|methods|routes)\/?$/,
  /^\/routes\/[^/]+\/?$/,
] as const;

export function isPublicStudioPath(pathname: string): boolean {
  return publicStudioPathPatterns.some((pattern) => pattern.test(pathname));
}

export function isProductionClosedPath(url: URL): boolean {
  return (
    !isLocalDevHost(url.hostname) &&
    !isApiPath(url.pathname) &&
    !hasFileExtension(url.pathname) &&
    !isPublicStudioPath(url.pathname)
  );
}

function hasFileExtension(pathname: string): boolean {
  return /\/[^/]+\.[^/]+$/.test(pathname);
}

async function withSpaSeo(request: Request, url: URL, response: Response): Promise<Response> {
  if (request.method === "HEAD") {
    return response;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const metadata = getStudioSeoMetadata(url);
  if (metadata === null) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  // Local dev must never cache the SPA shell, or edits won't show without a hard reload.
  headers.set(
    "Cache-Control",
    isLocalDevHost(url.hostname) ? "no-store" : "public, max-age=60, stale-while-revalidate=300",
  );
  if (metadata.noindex) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return new Response(injectSeoIntoHtml(await response.text(), metadata, url.origin), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function serveSpaFallback(
  request: Request,
  url: URL,
  assets: Fetcher,
): Promise<Response> {
  const response = await assets.fetch(request);
  if (response.status !== 404) {
    return withSpaSeo(request, url, response);
  }

  return withSpaSeo(
    request,
    url,
    await assets.fetch(new Request(new URL("/", request.url), request)),
  );
}

export async function serveLocalDevSpaFallback(request: Request, url: URL): Promise<Response> {
  return withSpaSeo(request, url, await fetch(new Request(new URL("/", request.url), request)));
}
