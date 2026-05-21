#!/usr/bin/env sh
set -eu

exec bun --filter @bp/pipeline pull:gtfs-rt-r2-run -- "$@"
