#!/usr/bin/env bash
set -euo pipefail

# Generated 2026-07-05T12:49:30.697Z
# Source manifest: data/artifacts/raw-deprecation/deletion-manifest-2026-07-05.json
# Known reclaim bytes: 67663633702
# OPERATOR-RUN ONLY - review every rm line before executing.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
sqlite_bytes="$(stat -c%s data/local/pipeline.sqlite 2>/dev/null || echo 0)"
[ "$sqlite_bytes" -gt 100000000000 ] || { echo "canonical sqlite missing/small; abort"; exit 1; }

# socrata-partitioned/bus_hourly_ridership_2025 - 8688264344 bytes - 18 raw files, 8688264344 bytes
rm -rf -- 'data/raw/socrata-partitioned/bus_hourly_ridership_2025'

# parking-violations - 6392783256 bytes - 36 raw files, 6392783256 bytes
rm -rf -- 'data/raw/parking-violations'

# socrata-partitioned-smoke/bus_hourly_ridership_2025 - 1301 bytes - 2 raw files, 1301 bytes
rm -rf -- 'data/raw/socrata-partitioned-smoke/bus_hourly_ridership_2025'

# orphaned artifact - 52582584801 bytes - Tier 2 docs pipeline was deleted in plan 024; plan 038 source audit measured this orphan at about 51 GB.
rm -rf -- 'data/artifacts/docs'

df -h /mnt/models
