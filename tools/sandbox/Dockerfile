# syntax=docker/dockerfile:1.7
#
# bp-sandbox — read-only Python+bash sandbox for the Bus Priority Studio
# findings-agent codemode runs.
#
# Built by tools/sandbox/build.sh (or `bun run sandbox:build`). Runtime
# invocation lives in tools/pipeline-v2/src/lib/sandbox.ts, which pipes
# the agent's code over stdin to `python3 -` or `bash -s` and runs with
# --network=none --read-only --cap-drop=ALL. The corpus and bp_corpus
# library are bind-mounted at runtime; nothing project-specific is baked
# into the image.

# Pinned by digest for reproducibility. Refresh with:
#   docker pull python:3.12-slim && \
#     docker inspect python:3.12-slim --format '{{index .RepoDigests 0}}'
FROM python:3.12-slim@sha256:090ba77e2958f6af52a5341f788b50b032dd4ca28377d2893dcf1ecbdfdfe203

# OCI image labels — populated by build.sh from git state.
ARG SOURCE_COMMIT=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="bp-sandbox" \
      org.opencontainers.image.description="Read-only Python+bash sandbox for Bus Priority Studio findings-agent codemode runs" \
      org.opencontainers.image.source="https://github.com/mannyc2/bus-priority-impact-studio" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

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

# Hash-pinned Python dependencies (see requirements.in for source, regen with
# `uv pip compile requirements.in --generate-hashes --python-version 3.12 -o requirements.txt`).
COPY requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --require-hashes --no-deps -r /tmp/requirements.txt \
 && pip check \
 && rm /tmp/requirements.txt

RUN useradd --create-home --uid 1000 --shell /bin/bash agent
USER 1000

WORKDIR /work
ENV PYTHONPATH=/work/agent-corpus-lib \
    HOME=/home/agent

# Default to interactive python3; sandbox.ts overrides this with `python3 -`
# or `bash -s` depending on the call.
CMD ["python3"]
