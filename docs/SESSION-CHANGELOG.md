# Session Changelog (assistant-written)

Purpose: quick chronological notes so future sessions can see what changed without reconstructing git history.

## Format
- YYYY-MM-DD HH:MM ET — summary
  - What changed:
  - Why:
  - Follow-ups:

---

- 2026-03-09 18:45 ET — Documentation refresh and repo alignment
  - What changed:
    - Updated `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/TASKS.md`, `docs/RELEASES.md`, `docs/INTEGRATIONS.md`, `docs/ENVIRONMENT.md`, `docs/WORKFLOWS.md`, and `docs/BACKLOG.md`.
    - Marked only Garmin OAuth and email notifications as open product backlog items.
    - Documented that `~/Mission-Control` is the active synced repo and `.claude/` remains local-only.
  - Why:
    - The docs had fallen behind the shipped March 6-9 health platform work.
  - Follow-ups:
    - Keep docs updated as future work lands.

- 2026-03-09 17:50 ET — Hydration, nutrition, recovery, notes, and config hardening
  - What changed:
    - Added hydration phase 2, nutrition phase 2, recovery phase 2, notes schema repair, and Turbopack root pinning.
    - Integrated hydration/nutrition/recovery into command center, morning briefing, readiness, and appointment prep.
  - Why:
    - The health platform needed broader daily-life inputs and environment stability.
  - Follow-ups:
    - Remaining product backlog is now Garmin OAuth and email notifications.

- 2026-03-09 15:30 ET — Command center and training-plan maturation
  - What changed:
    - Added command-center persistence, PDF export, AI plan intake, richer plan output, plan detail view, progress tracking, and scheduling bridge.
  - Why:
    - The original one-shot training-plan flow was too shallow and brittle.
  - Follow-ups:
    - Continue refining plan UX as real usage data comes in.

- 2026-03-06 12:30 ET — Imaging, genetics, and health document follow-through
  - What changed:
    - Added imaging ingestion and analysis, fixed genetics review flows across all report types, and wired genetics/imaging into downstream health context and `health.md` updates.
  - Why:
    - Genetic and imaging data needed to affect the broader decision-making system, not stay isolated.
  - Follow-ups:
    - Keep doctor-prep prompts aligned with newer health context additions.

- 2026-02-28 20:45 ET — Calendar scheduled workouts editing + timezone fix
  - What changed:
    - Fixed `planned_workouts` to `calendar_events` sync timezone handling for America/New_York.
    - Reworked scheduled workout editing to go through the source `planned_workouts` modal flow.
  - Why:
    - Editing derived calendar rows was causing non-persistent edits and duplicates.
  - Follow-ups:
    - Keep Supabase migration history aligned across environments.
