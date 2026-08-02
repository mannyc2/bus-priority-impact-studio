#!/usr/bin/env sh
set -eu

printf '%s\n' \
  'This month-selected publisher is retired. Prepare with `publish serving-release` and dispatch the protected `publication.yml` workflow from main.' >&2
exit 2
