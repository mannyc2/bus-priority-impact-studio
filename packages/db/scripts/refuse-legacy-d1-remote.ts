throw new Error(
  "Legacy D1 remote migrations are frozen after Plan 098. Use `bun --filter @bp/db db:migrate:d1:v2:remote`; never replay migrations/d1 against populated production.",
);
