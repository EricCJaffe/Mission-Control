#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_DIR="$REPO_DIR/docs"

FILES=(
  "$DOCS_DIR/CONTEXT.md"
  "$DOCS_DIR/WORKFLOWS.md"
  "$DOCS_DIR/ENVIRONMENT.md"
  "$DOCS_DIR/RUNBOOK.md"
  "$DOCS_DIR/TASKS.md"
  "$DOCS_DIR/API.md"
  "$DOCS_DIR/ARCHITECTURE.md"
  "$DOCS_DIR/CONTRIBUTING.md"
  "$DOCS_DIR/DEPLOYMENT.md"
  "$DOCS_DIR/INTEGRATIONS.md"
  "$DOCS_DIR/RELEASES.md"
  "$DOCS_DIR/OWNERSHIP.md"
)

printf "Mission Control preflight — %s\n\n" "$(date)"

echo "Repo: $REPO_DIR"
cd "$REPO_DIR"

echo

echo "== Git sync (safe) =="
git fetch origin --prune
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree NOT clean — skipping pull"
  git status -sb
else
  git pull --ff-only
fi

echo

echo "== Reading docs =="

echo

echo "== Assistant coding model check =="
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY: set"
else
  echo "OPENAI_API_KEY: NOT set in this shell (ok if you rely on .env.local during runtime)"
fi

for f in "${FILES[@]}"; do
  if [[ -f "$f" ]]; then
    echo
    echo "----- ${f#$REPO_DIR/} -----"
    sed -n '1,200p' "$f"
  else
    echo
    echo "----- ${f#$REPO_DIR/} (MISSING) -----"
  fi
done

echo

echo "== Decisions index =="
if [[ -d "$DOCS_DIR/DECISIONS" ]]; then
  find "$DOCS_DIR/DECISIONS" -maxdepth 2 -type f -print | sed "s|^$REPO_DIR/||" | sort
else
  echo "docs/DECISIONS/ not found"
fi

echo

echo "Done. If you changed anything, append a note to docs/SESSION-CHANGELOG.md"
