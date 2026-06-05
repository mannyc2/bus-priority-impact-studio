import { handleStudioApiRequest } from "../api.js";
import type { StudioApiEnv } from "./env.js";

export { buildHealthResponse } from "../observability.js";

export async function handleStudioFetch(
  request: Request,
  env: StudioApiEnv,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  return handleStudioApiRequest(request, env, ctx);
}
