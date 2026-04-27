#!/usr/bin/env sh
set -eu

git config core.hooksPath .githooks
chmod +x .githooks/pre-push
printf '%s\n' 'Installed repo Git hooks from .githooks/.'
