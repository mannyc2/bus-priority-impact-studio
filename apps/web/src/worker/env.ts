import type { StudioApiEnv } from "@bp/studio-api/server";

export type Env = StudioApiEnv & {
  ASSETS?: Fetcher;
};
