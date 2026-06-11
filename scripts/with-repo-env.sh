#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  scripts/with-repo-env.sh --check-llm
  scripts/with-repo-env.sh --check KEY [KEY...]
  scripts/with-repo-env.sh -- COMMAND [ARG...]

Loads gitignored repo-local env files, then either prints presence-only checks or
executes COMMAND with those variables in the process environment.

Loaded files, when present:
  .env
  tools/pipeline-v2/.env

Secret values are never printed by this script.
USAGE
}

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

load_env_file() {
  file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  . "$file"
  set +a
}

check_keys() {
  missing=0
  for key in "$@"; do
    value="$(eval "printf '%s' \"\${$key:-}\"")"
    if [ -n "$value" ]; then
      printf '%s=set\n' "$key"
    else
      printf '%s=missing\n' "$key"
      missing=1
    fi
  done
  return "$missing"
}

cd "$repo_root"
load_env_file "$repo_root/.env"
load_env_file "$repo_root/tools/pipeline-v2/.env"

if [ "$#" -eq 0 ]; then
  usage
  exit 0
fi

case "$1" in
  --help|-h)
    usage
    exit 0
    ;;
  --check-llm)
    shift
    check_keys PIONEER_API_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY
    ;;
  --check)
    shift
    if [ "$#" -eq 0 ]; then
      printf 'Missing KEY for --check.\n\n' >&2
      usage >&2
      exit 1
    fi
    check_keys "$@"
    ;;
  --)
    shift
    if [ "$#" -eq 0 ]; then
      printf 'Missing COMMAND after --.\n\n' >&2
      usage >&2
      exit 1
    fi
    exec "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
