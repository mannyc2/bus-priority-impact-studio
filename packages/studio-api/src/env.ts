import type { PointedServingReleaseContext } from "@bp/db/d1";

export type StudioApiEnv = {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  GTFS_RT_RAW?: R2Bucket;
  MTA_BUS_TIME_API_KEY?: string;
  SOCRATA_APP_TOKEN?: string;
  STUDIO_RELEASE_KEY?: string;
  GTFS_RT_SAMPLES_PER_CRON?: string;
  GTFS_RT_SAMPLE_SECONDS?: string;
  ENVIRONMENT?: string;
  PLAN097_RECOVERY_ENABLED?: string;
  PLAN097_PREVIOUS_RELEASE_ID?: string;
  SERVING_POINTER_ENABLED?: string;
  /** Request-local only; never a Worker binding or client-selectable value. */
  SERVING_RELEASE_CONTEXT?: PointedServingReleaseContext;
  /** Request-local original binding used only for current signals and the final pointer guard. */
  SERVING_UNSCOPED_DB?: D1Database;
};

export type StudioApiRequestContext = {
  requestId: string;
  routeTemplate: string;
};
