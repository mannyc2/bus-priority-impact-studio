import { isApiPath } from "@bp/studio-api/contracts";
import { handleStudioScheduled } from "@bp/studio-api/server/scheduled";
import { buildHealthResponse, handleStudioFetch } from "@bp/studio-api/server/worker";
import type { Env } from "./env.js";
import {
  handlePlan097RecoveryRequest,
  PLAN097_OPERATION_PATH,
} from "./operations/plan097-recovery.js";
import { withSecurityHeaders } from "./security-headers.js";
import {
  canServeSpaFallback,
  isLocalDevHost,
  isProductionClosedPath,
  serveLocalDevSpaFallback,
  serveSpaFallback,
} from "./spa.js";

export type { Env } from "./env.js";
export { buildHealthResponse };

export default {
  async fetch(request: Request, env: Env = {}, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const response = await handleRequest(request, url, env, ctx);
    return withWorkerVersionHeader(withSecurityHeaders(response, url), env);
  },
  async scheduled(controller: ScheduledController, env: Env = {}): Promise<void> {
    await handleStudioScheduled(controller, env);
  },
} satisfies ExportedHandler<Env>;

function withWorkerVersionHeader(response: Response, env: Env): Response {
  const versionId = env.CF_VERSION_METADATA?.id.trim();
  if (versionId === undefined || versionId.length === 0) return response;

  const next = new Response(response.body, response);
  next.headers.set("X-BP-Worker-Version", versionId);
  return next;
}

async function handleRequest(
  request: Request,
  url: URL,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (url.pathname === PLAN097_OPERATION_PATH) {
    return handlePlan097RecoveryRequest(request, env);
  }
  if (isApiPath(url.pathname)) {
    return (
      (await handleStudioFetch(request, env, ctx)) ?? new Response("Not found", { status: 404 })
    );
  }

  if (isProductionClosedPath(url)) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  if (canServeSpaFallback(request, url) && env.ASSETS !== undefined) {
    return serveSpaFallback(request, url, env.ASSETS);
  }

  if (canServeSpaFallback(request, url) && isLocalDevHost(url.hostname)) {
    return serveLocalDevSpaFallback(request, url);
  }

  // Non-navigation requests (static files in production, Vite client modules in dev) are
  // served by the assets layer. Required because run_worker_first routes every path through
  // the Worker, including Vite's /src, /@fs, and /node_modules module requests. API paths are
  // excluded so unmatched endpoints return 404 rather than the SPA shell.
  if (env.ASSETS !== undefined && !isApiPath(url.pathname)) {
    return env.ASSETS.fetch(request);
  }

  return new Response("Not found", { status: 404 });
}
