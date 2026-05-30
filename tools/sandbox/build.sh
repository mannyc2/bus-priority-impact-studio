#!/usr/bin/env bash
# Build bp-sandbox:latest and bp-sandbox:<short-sha>.
#
# Used by `bun run sandbox:build` (root package.json) and by CI before any
# `bun --filter @bp/pipeline-v2 test` run that exercises the sandbox.
#
# Exit codes:
#   0 — image built and self-test passed
#   1 — docker unavailable or build failed
#   2 — built image failed a basic smoke check
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

IMAGE_NAME="${IMAGE_NAME:-bp-sandbox}"
PLATFORM="${PLATFORM:-linux/amd64}"

if ! command -v docker >/dev/null 2>&1; then
  echo "build.sh: docker not on PATH" >&2
  exit 1
fi

SOURCE_COMMIT="$(git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "==> Building ${IMAGE_NAME}:${SOURCE_COMMIT} (and :latest) for ${PLATFORM}"
DOCKER_BUILDKIT=1 docker build \
  --platform="${PLATFORM}" \
  --build-arg "SOURCE_COMMIT=${SOURCE_COMMIT}" \
  --build-arg "BUILD_DATE=${BUILD_DATE}" \
  -t "${IMAGE_NAME}:${SOURCE_COMMIT}" \
  -t "${IMAGE_NAME}:latest" \
  "${SCRIPT_DIR}"

echo "==> Smoke-testing ${IMAGE_NAME}:latest"
output=$(docker run --rm --network=none --read-only \
  --tmpfs /tmp:rw,size=8m \
  --user 1000:1000 \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  "${IMAGE_NAME}:latest" \
  python3 -c 'import pandas, duckdb, pyarrow; print(f"pandas={pandas.__version__} duckdb={duckdb.__version__} pyarrow={pyarrow.__version__}")')
echo "    ${output}"

if ! echo "${output}" | grep -q "pandas="; then
  echo "build.sh: smoke test failed" >&2
  exit 2
fi

echo "==> OK. ${IMAGE_NAME}:${SOURCE_COMMIT} and ${IMAGE_NAME}:latest are ready."
