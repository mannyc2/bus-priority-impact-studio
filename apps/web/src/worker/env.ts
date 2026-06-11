import type { StudioApiEnv } from "@bp/studio-api/server";
import type { BriefAuthorAgent } from "@bp/studio-api/server/authoring/agent";

export type Env = StudioApiEnv & {
  ASSETS?: Fetcher;
  BRIEF_AUTHOR_AGENT?: DurableObjectNamespace<BriefAuthorAgent>;
};
