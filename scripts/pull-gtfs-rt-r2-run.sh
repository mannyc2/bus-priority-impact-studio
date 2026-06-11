#!/usr/bin/env sh
set -eu

exec bun --filter @bp/pipeline-v2 cli -- pull gtfs-rt-r2-run "$@"
