import { isApiPath } from "@bp/studio-api/contracts";
import { handleStudioScheduled } from "@bp/studio-api/server/scheduled";
import { buildHealthResponse, handleStudioFetch } from "@bp/studio-api/server/worker";
import type { Env } from "./env.js";
import {
  canServeSpaFallback,
  isLocalDevHost,
  isProductionClosedPath,
  serveLocalDevSpaFallback,
  serveSpaFallback,
} from "./spa.js";

export type { Env } from "./env.js";
export { buildHealthResponse };
// Re-export the Durable Object class so the BRIEF_AUTHOR_AGENT binding (wrangler.jsonc)
// resolves against the Worker entrypoint. Without this, Miniflare's DO wrapper extends
// `undefined` and the dev runtime fails to start.
export { BriefAuthorAgent } from "@bp/studio-api/server/authoring/agent";

export default {
  async fetch(request: Request, env: Env = {}, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
  },
  async scheduled(controller: ScheduledController, env: Env = {}): Promise<void> {
    await handleStudioScheduled(controller, env);
  },
} satisfies ExportedHandler<Env>;
