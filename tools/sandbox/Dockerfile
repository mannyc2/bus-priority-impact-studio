# syntax=docker/dockerfile:1.7
#
# bp-sandbox — read-only Bun/TypeScript+bash sandbox for the Bus Priority Studio
# findings-agent codemode runs.
#
# Built by tools/sandbox/build.sh (or `bun run sandbox:build`). Runtime
# invocation lives in tools/pipeline-v2/src/lib/sandbox.ts, which pipes
# the agent's code over stdin to Bun TypeScript or `bash -s` and runs with
# --network=none --read-only --cap-drop=ALL. The corpus and the analytics
# package are bind-mounted at runtime; nothing project-specific is baked into
# the image.

FROM oven/bun:1.3.13-debian

# OCI image labels — populated by build.sh from git state.
ARG SOURCE_COMMIT=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="bp-sandbox" \
      org.opencontainers.image.description="Read-only Bun/TypeScript+bash sandbox for Bus Priority Studio findings-agent codemode runs" \
      org.opencontainers.image.source="https://github.com/mannyc2/bus-priority-impact-studio" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# System packages. Cache mount on /var/cache/apt and /var/lib/apt/lists
# accelerates rebuilds without persisting layers.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
 && apt-get update \
 && apt-get install -y --no-install-recommends --no-install-suggests \
        ripgrep \
        jq \
 && rm -rf /var/lib/apt/lists/*

USER 1000

WORKDIR /work
ENV HOME=/home/agent \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-transpiler-cache

# Default to Bun; sandbox.ts overrides this per call.
CMD ["bun"]
