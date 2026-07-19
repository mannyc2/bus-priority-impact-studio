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
};

export type StudioApiRequestContext = {
  requestId: string;
  routeTemplate: string;
};
