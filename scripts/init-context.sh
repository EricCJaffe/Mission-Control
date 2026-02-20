#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_DIR="$ROOT_DIR/docs"

write_if_missing() {
  local path="$1"
  local content="$2"
  if [ ! -f "$path" ]; then
    printf "%s" "$content" > "$path"
  fi
}

mkdir -p "$DOCS_DIR/DECISIONS"

write_if_missing "$DOCS_DIR/README.md" "\
# Docs Index

Start here:
- \`docs/CONTEXT.md\`
- \`docs/WORKFLOWS.md\`
- \`docs/ENVIRONMENT.md\`
- \`docs/RUNBOOK.md\`

Reference:
- \`docs/API.md\`
- \`docs/ARCHITECTURE.md\`
- \`docs/CONTRIBUTING.md\`
- \`docs/DEPLOYMENT.md\`
- \`docs/SUPABASE.md\`
- \`docs/INTEGRATIONS.md\`
- \`docs/RELEASES.md\`
- \`docs/DECISIONS/README.md\`
- \`docs/TASKS.md\`
- \`docs/OWNERSHIP.md\`
"

write_if_missing "$DOCS_DIR/CONTEXT.md" "\
# Project Context

## Purpose
Short description of what this product does.

## Tech Stack
- List key technologies and services.

## Key Entry Points
- \`src/main.tsx\` (or equivalent)
- \`src/App.tsx\` (or equivalent)

## Routing Structure
- Public routes:
- Auth routes:
- App routes:

## Auth and Membership
- Where auth lives:
- Where membership/tenancy lives:

## Module Flags
- Where feature flags or modules are defined:

## Testing
- Test runner:
- Smoke tests:
"

write_if_missing "$DOCS_DIR/WORKFLOWS.md" "\
# Workflows

## Local Dev
- Install deps:
- Start dev server:
- Build:
- Preview:

## Tests and Lint
- Test:
- Watch:
- Lint:

## Deploy
- Primary deploy path:
- Any environment-specific notes:
"

write_if_missing "$DOCS_DIR/API.md" "\
# API

## Overview
- Internal APIs and key endpoints.

## Auth
- Auth mechanism and tokens.

## Errors
- Error shapes and status codes.
"

write_if_missing "$DOCS_DIR/ARCHITECTURE.md" "\
# Architecture

## Summary
- High-level architecture and data flow.

## Key Components
- Entry points, providers, and core modules.

## Risks
- Known high-risk dependencies or single points of failure.
"

write_if_missing "$DOCS_DIR/CONTRIBUTING.md" "\
# Contributing

## Setup
- Install dependencies.
- Run the dev server.

## Quality
- Lint and tests to run before PRs.

## Conventions
- Code style and naming conventions.
"

write_if_missing "$DOCS_DIR/DEPLOYMENT.md" "\
# Deployment

## Environments
- Staging:
- Production:

## Steps
- Build:
- Deploy:

## Rollback
- How to revert or rollback a release.
"

write_if_missing "$DOCS_DIR/SUPABASE.md" "\
# Supabase

## Client
- Client setup file:
- Env vars:

## Auth
- Auth provider:
- Membership/tenant context:

## Database
- Migrations path:
- Functions path:
- Config path:
"

write_if_missing "$DOCS_DIR/INTEGRATIONS.md" "\
# Integrations

## External APIs
- Name: purpose, auth, owner, and links.

## Webhooks
- Source: events, verification, and endpoints.

## Internal Services
- Service: purpose and ownership.
"

write_if_missing "$DOCS_DIR/RELEASES.md" "\
# Releases

## Upcoming
- Date:
- Scope:

## Recent
- Date:
- Summary:
"

write_if_missing "$DOCS_DIR/ENVIRONMENT.md" "\
# Environment

## Required Env Vars
- List required env vars and where they are used.

## Secrets
- Where secrets are stored (do not commit).
- How to provision for local dev.

## Local Setup Notes
- Any OS-specific steps.
"

write_if_missing "$DOCS_DIR/OWNERSHIP.md" "\
# Ownership

## Owners
- Area: owner name or team

## Escalation
- Who to contact when things break
"

write_if_missing "$DOCS_DIR/RUNBOOK.md" "\
# Runbook

## Common Issues
- Symptom:
- Checks:
- Fix:
"

write_if_missing "$DOCS_DIR/TASKS.md" "\
# Tasks

## Active
- [ ] Replace with current priorities.

## Backlog
- [ ] Replace with backlog items.

## Done
- [ ] (Empty)

## Conventions
- Keep tasks small and outcome-focused.
- Add links to related ADRs, PRs, or files when helpful.
- Move items to Done instead of deleting.
"

write_if_missing "$DOCS_DIR/DECISIONS/README.md" "\
# Architecture Decisions

## Purpose
Use lightweight ADRs to capture high-impact decisions and their rationale.

## When to Write
- New major dependency or framework.
- Changes to auth, data access, or security model.
- Significant architectural shifts.
- Performance or reliability tradeoffs.

## Naming
- \`NNNN-short-title.md\` with a sequential number.

## Template
- Start from \`docs/DECISIONS/0000-template.md\`.
"

write_if_missing "$DOCS_DIR/DECISIONS/0000-template.md" "\
# NNNN Title

## Date
YYYY-MM-DD

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
What problem are we solving and what forces are in play.

## Decision
What we decided and why.

## Consequences
Impact, tradeoffs, and follow-on work.

## Links
Related docs or PRs.
"

echo "Context docs initialized in $DOCS_DIR"
