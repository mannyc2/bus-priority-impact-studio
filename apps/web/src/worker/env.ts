import type { StudioApiEnv } from "@bp/studio-api";
import type { BriefAuthorAgent } from "@bp/studio-api/authoring";

export type Env = StudioApiEnv & {
  ASSETS?: Fetcher;
  BRIEF_AUTHOR_AGENT?: DurableObjectNamespace<BriefAuthorAgent>;
};
