#!/usr/bin/env bash
# Promote tested dev work to main without using the GitHub web UI.
# Usage: ./promote.sh [--skip-tests]
set -euo pipefail

SKIP_TESTS=false
if [[ "${1:-}" == "--skip-tests" ]]; then SKIP_TESTS=true; fi

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }

# 1. must be on dev with a clean tree
BRANCH=$(git branch --show-current)
[[ "$BRANCH" == "dev" ]] || die "run this from the 'dev' branch (now on '$BRANCH')"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree not clean - commit or stash first"

# 2. sync dev with the server (replaces the old 'git pull' guessing)
info "fetch + sync dev with origin/dev..."
git fetch origin
git pull --no-rebase origin dev

# 3. sanity check before promoting
if [[ "$SKIP_TESTS" == true ]]; then
  info "skipping tests (--skip-tests)"
else
  info "running core tests (node tests/core.test.js)..."
  node tests/core.test.js
fi

# 4. push dev (no-op if already in sync)
info "push dev..."
git push origin dev

# 5. bring local main up to date, then merge dev in (like the GitHub PR did)
info "update local main from origin/main..."
git checkout main
git pull --no-rebase origin main

info "merge dev into main..."
git merge --no-ff dev -m "Merge dev into main"

info "push main..."
git push origin main

# 6. go back to dev so you can keep editing
git checkout dev
info "done: dev and main are both pushed. You are back on dev."
