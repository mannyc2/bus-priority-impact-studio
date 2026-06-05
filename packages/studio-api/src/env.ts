export type StudioApiEmailSendBinding = {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<unknown>;
};

export type StudioApiEnv = {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  GTFS_RT_RAW?: R2Bucket;
  MTA_BUS_TIME_API_KEY?: string;
  AI?: Ai;
  BRIEF_AUTHOR_AGENT?: DurableObjectNamespace;
  BASELINE_MONTH?: string;
  LAST_BUILT_SPEED_MONTH?: string;
  STUDIO_RELEASE_KEY?: string;
  STUDIO_AGENT_MODEL?: string;
  STUDIO_AGENT_MAX_STEPS?: string;
  GTFS_RT_SAMPLES_PER_CRON?: string;
  GTFS_RT_SAMPLE_SECONDS?: string;
  AUTH_EMAIL_FROM?: string;
  ENVIRONMENT?: string;
  EMAIL?: StudioApiEmailSendBinding;
};

export type StudioApiRequestContext = {
  requestId: string;
  routeTemplate: string;
};
