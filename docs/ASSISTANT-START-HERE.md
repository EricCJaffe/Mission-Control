# Assistant Start Here (Mission Control)

This file is the **quick preflight** for any assistant session before doing work on this repo.

## One-command refresh

Run:

```bash
./scripts/mission-control-preflight.sh
```

## Coding model preference (Eric)

When doing coding work on Mission Control, use the **latest OpenAI Codex** model/harness available (best fit for agentic repo changes).

Practical rule:
- Prefer running coding tasks via an **ACP coding session** configured to use Codex (rather than ad-hoc edits).
- Ensure `OPENAI_API_KEY` is set in the execution environment (local dev uses `.env.local`, but keys should not be committed).

## What to read (in this order)

Core context:
- `docs/CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/INTEGRATIONS.md`
- `docs/ENVIRONMENT.md`
- `docs/WORKFLOWS.md`
- `docs/RUNBOOK.md`
- `docs/DEPLOYMENT.md`
- `docs/CONTRIBUTING.md`
- `docs/OWNERSHIP.md`
- `docs/RELEASES.md`

Work tracking:
- `docs/TASKS.md`
- `docs/DECISIONS/*` (ADRs)

## Keeping it up to date (Eric’s rules)

- Major decision → add an ADR in `docs/DECISIONS/`
- Starting a new feature → add/adjust tasks in `docs/TASKS.md`
- Adding integrations → update `docs/INTEGRATIONS.md`
- Adding env vars → update `docs/ENVIRONMENT.md`
- Deployment/workflow changes → update `docs/WORKFLOWS.md`
- Release notes needed → update `docs/RELEASES.md`

## After any updates

Add a short change summary so other sessions can pick it up quickly:

- What changed
- Why
- Any follow-ups / risks

Where to write it:
- Prefer: `docs/RELEASES.md` (if user-facing / noteworthy)
- Or: add an ADR under `docs/DECISIONS/`
- Also: append a short note to `docs/SESSION-CHANGELOG.md`
