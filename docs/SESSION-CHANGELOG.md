# Session Changelog (assistant-written)

Purpose: quick, chronological notes so future sessions can see what changed without digging through git history.

## Format

- YYYY-MM-DD HH:MM ET — summary (links to PR/commit if applicable)
  - What changed:
  - Why:
  - Follow-ups:

---

- 2026-02-28 20:45 ET — Calendar scheduled workouts editing + timezone fix
  - What changed:
    - Fixed `planned_workouts` → `calendar_events` sync timezone to interpret scheduled times in America/New_York.
    - Reworked UI so planned workouts are edited via a dedicated modal that PATCHes `/api/fitness/planned-workouts` (date/time/title).
    - Restored click-to-start behavior (link to `/fitness/log?planned_workout_id=...`) with a small Edit action.
    - Fixed week view default/weekStart parsing to avoid UTC date shifting.
  - Why:
    - Scheduled workouts are derived calendar rows; editing the derived row was causing non-persistent edits and duplicates.
    - UTC parsing caused week/day offsets and wrong displayed times.
  - Follow-ups:
    - Ensure Supabase migrations are applied consistently across environments (manual SQL vs CLI).
    - Consider adding an admin/debug view to detect/remove orphan workout calendar rows.

