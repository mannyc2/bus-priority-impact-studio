import type { StudioApiEnv } from "./env.js";
import { runScheduledProductionRefresh } from "./source-refresh.js";

export async function handleStudioScheduled(
  controller: ScheduledController,
  env: StudioApiEnv,
): Promise<void> {
  await runScheduledProductionRefresh(env, { cron: controller.cron });
}
