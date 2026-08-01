# Session Changelog (assistant-written)

Purpose: quick chronological notes so future sessions can see what changed without reconstructing git history.

## Format
- YYYY-MM-DD HH:MM ET — summary
  - What changed:
  - Why:
  - Follow-ups:

---

- 2026-08-01 09:40 ET — Withings as source of truth for BP and body composition
  - What changed:
    - Apple Health ingest no longer writes `bp_readings` at all. The two paths cannot be de-duplicated: Apple flattens a reading to local midnight while the Withings API keeps the real measurement time, so the same cuff reading arrives with different timestamps. Two duplicates already existed (2026-03-02 142/90, 2026-03-08 153/91).
    - Apple ingest now strips weight / body fat / lean mass / BMI on any date where `body_metrics.weight_source = 'Withings'`, so Withings is never overwritten while Apple still fills unclaimed days. Weight can't duplicate (one row per date) — only overwrite — so a preference is sufficient there where BP needed a hard exclusion.
    - Added `scripts/dedupe-bp-readings.mjs`, matching on (day, systolic, diastolic) rather than timestamp. Cleaned the 2 existing duplicates.
    - Recorded the full precedence table in `docs/DATA_SOURCES.md`, superseding the Garmin-era rules.
  - **Bug found and fixed — this one mattered:**
    - PostgREST normalises a batch upsert to the UNION of all rows' columns and NULL-fills whatever a row omits. So dropping `weight_lbs` from one row didn't skip the column, it wrote NULL over the existing weight — the first attempt at the deferral rule actively destroyed the value it was meant to protect. This was a *latent* bug in all the existing upserts too, since Apple payloads are naturally ragged (a date may have HRV but no weight).
    - Fixed with `upsertGrouped()`, which batches rows by identical column signature so each statement only names columns every row in it supplies. All six upserts now route through it. Verified by seeding a Withings-owned sentinel row and confirming it survived a full re-ingest.
  - Why:
    - Eric wants Withings BP/weight/body-comp as source of truth without duplicating against Apple Health.
  - Follow-ups:
    - 21 Apple-sourced BP rows (Apr–Jun) remain — currently the only BP for that period. Run the dedupe script after the first Withings backfill.
    - Nothing schedules the Withings sync, and nothing else writes BP now, so those metrics stop if it isn't run.
    - A same-source repeat measurement is NOT treated as a duplicate: 2024-12-20 had two Withings readings of 135/87 six minutes apart, which is normal practice. The first version of the dedupe script would have deleted one.

- 2026-07-30 14:15 ET — Apple Health: extended metrics, migrations applied, backfill imported
  - What changed:
    - Applied **all 9 pending migrations** to remote Supabase via `supabase db push` (the 5 that had been queued since 2026-07-23, plus 4 new Apple Health ones). Remote and local migration state now match.
    - New schema for data that had nowhere to land: `body_metrics.blood_oxygen_pct`/`respiratory_rate`; `daily_summaries.exercise_minutes`/`stand_minutes`/`stand_hours`/`daylight_minutes`; new tables `running_dynamics`, `mobility_metrics`, `workout_routes` (GPS traces as jsonb, downsampled above 4000 points, with bounding box + elevation gain precomputed).
    - Normalizer extended to fill all of the above; unmapped metrics down from 26 to 6.
    - **Imported the 2026-03-01 → 2026-07-30 backfill through the real endpoint**: 152 daily_summaries, 110 body_metrics, 88 sleep_logs, 23 bp_readings, 31 workouts, 5 running_dynamics, 151 mobility_metrics, 5 workout_routes.
  - Why:
    - Eric asked for exercise maps, running dynamics, blood oxygen and Apple exercise time to be captured rather than discarded, and authorised applying the migrations.
  - Bugs the real import caught (all fixed):
    - `hrv_ms` is an `integer` column — sending 34.52 failed the whole body_metrics batch.
    - The sleep column is `awake_seconds`, not `awake_sleep_seconds`; and `sleep_start`/`sleep_end`/`total_sleep_seconds` are NOT NULL, so entries missing them are now skipped rather than failing the batch.
    - `ON CONFLICT` cannot use the **partial** unique index from `20260730120000`. Replaced with a plain unique constraint in `20260730150000` — safe because Postgres treats NULLs as distinct, so non-Apple rows don't collide.
  - Follow-ups:
    - Endpoint still returns 503 in production until `APPLE_HEALTH_INGEST_TOKEN` / `APPLE_HEALTH_USER_ID` are set in Vercel — see the reminder in `docs/TASKS.md`.
    - One imported route reports 425m elevation gain in flat north Florida; GPS altitude drift, not a parsing bug. Consider smoothing if routes get surfaced in the UI.
    - Nothing yet *reads* `running_dynamics`, `mobility_metrics`, or `workout_routes` — the data is being collected ahead of any UI.

- 2026-07-30 10:20 ET — Apple Health ingest (server side)
  - What changed:
    - Added `POST /api/fitness/apple-health/ingest` — the only non-cookie-auth route in the app, since the phone posts with no browser session. Bearer token + service-role writes, fail-CLOSED (503) when `APPLE_HEALTH_INGEST_TOKEN`/`APPLE_HEALTH_USER_ID` are absent, timing-safe token compare. Deliberately unlike `cron/daily-metric-check`, which skips its check entirely when `CRON_SECRET` is unset.
    - Added `src/lib/fitness/apple-health-import.ts` — normalises Health Auto Export payloads into `body_metrics`, `daily_summaries`, `sleep_logs`, `bp_readings`, `workout_logs`/`cardio_logs`. Handles HAE's `"yyyy-MM-dd HH:mm:ss Z"` dates, which `new Date()` mis-parses, and kg→lb / km→mi conversion.
    - Migration `20260730120000_apple_health_ingest.sql`: allows `'Apple Health'` on `daily_summaries.source` and `sleep_logs.source`, adds `workout_logs.apple_workout_id` + partial unique index for idempotent re-sends, and creates `apple_health_sync_logs` (including `raw_payload` and `metrics_unmapped`).
  - Why:
    - Apple exposes HealthKit only on-device, so there is no server-side pull. Garmin Connect and Health Mate both mirror into Apple Health, so one inbound path can replace three integrations.
  - Follow-ups:
    - **Not live yet** — see the Apple Health reminder at the top of `docs/TASKS.md` (migration, 2 env vars, buy Health Auto Export).
    - **Mapping validated against a real 9.6MB export** (2026-03-01 → 2026-07-30, 41 metrics / 31 workouts): all 14 mapped metric names matched, and the normalizer produced 152 daily_summaries, 110 body_metrics, 88 sleep_logs, 23 bp_readings, 31 workouts with zero malformed dates or bad durations. Findings folded back in: added `body_mass_index` → `body_metrics.bmi` (57 rows), and sleep now keeps the LONGEST session per day because ~2/3 of Apple's sleep entries are naps and last-write let a nap overwrite a night. Also capped `raw_payload` logging at 512KB so a backfill doesn't bloat the sync log.
    - Real-world note: HAE pre-merges multi-source days into one point (source is a pipe-joined list), so the per-day summing cannot double-count Garmin + Watch + iPhone.
    - 26 metrics remain unmapped — mostly ones with no column to land in (audio exposure, walking asymmetry, running dynamics, underwater depth). `respiratory_rate`, `blood_oxygen_saturation`, and `apple_exercise_time` are the plausible future adds.
    - GPX route files in the export are not imported; there is no table for GPS traces, and the workout `route` arrays are ignored too.
    - Verified by 35 normalizer assertions, the real-export run above, and by exercising the 503/401/400/405 paths against a live server. The DB write path has still not run — it needs the migration applied.

- 2026-07-29 09:35 ET — Workout logger set-entry ergonomics
  - What changed:
    - Replaced the page-bottom `RestTimer` card with `InlineRestTimer` — a ~24px chip that appears under a set once it's marked done. One tap runs a 60s countdown in place, with a `+30s` bump, tap-to-clear, and a vibrate on finish. `RestTimer.tsx` is now unreferenced.
    - Added `SetNumberInput`: −/+ steppers around the weight and reps fields (5 lb and 1 rep), rendered as `type="text"` so the caret can be forced to the end of the value on focus/tap. Number inputs don't support `setSelectionRange`, which is why the type changed.
    - Added `src/lib/fitness/carry-forward.ts` — typing weight/reps into a set now fills the still-blank sets below it, stopping at the first set that's been edited by hand or completed. Sets it filled keep following until edited, so live typing (`1` → `13` → `135`) propagates.
    - Tightened the set-row grid so the extra stepper buttons still fit a 320px phone.
  - Why:
    - Editing weight/reps on mobile was painful: tapping a field put the caret in front of the digits, and the only rest timer sat below every exercise so it had to be scrolled to.
  - Follow-ups:
    - Decide whether to delete the now-unused `RestTimer.tsx` or keep it for a settings-driven long-rest view.
    - Rest length is a fixed 60s constant (`REST_DEFAULT_SECONDS`); wire it to per-exercise `rest_seconds` if that's wanted.
    - Verified by build/typecheck/lint and by driving the components in headless Chrome; not yet exercised in the signed-in logger on a real phone.

- 2026-03-10 10:55 ET — Flourishing module implementation
  - What changed:
    - Added the Flourishing subsystem: canonical question set, persisted assessments, current profile, and persona proposal review/apply flow.
    - Built `/flourishing` and `/flourishing/[assessmentId]` with a colorful assessment UI, results dashboard, history, and coaching output.
    - Added dashboard/reviews integration and included flourishing state in shared AI context.
    - Applied the Supabase migration and verified the build still passes.
  - Why:
    - The app needed a first-class whole-life review system that connects persona, soul, health, and alignment rather than leaving them fragmented.
  - Follow-ups:
    - Consider downstream goal/task generation later if the flourishing workflow proves stable.

- 2026-03-09 22:10 ET — Withings OAuth/API sync implementation
  - What changed:
    - Added Withings OAuth connect/start, callback, status, sync, disconnect, and webhook-placeholder routes.
    - Added `withings_connections` and `withings_sync_logs` tables plus encrypted token handling.
    - Added shared Withings normalizers so CSV and API sync use the same dedupe/upsert behavior.
    - Reworked `/fitness/settings/withings` into a connection/sync screen with legacy CSV import retained below it.
    - Applied the Withings migration to remote Supabase and refreshed docs/env/workflow references.
  - Why:
    - The app needed to move from filesystem-only Withings import to a real API-backed sync flow.
  - Follow-ups:
    - Add Withings webhook subscriptions and background incremental sync later.

- 2026-03-09 18:45 ET — Documentation refresh and repo alignment
  - What changed:
    - Updated `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/TASKS.md`, `docs/RELEASES.md`, `docs/INTEGRATIONS.md`, `docs/ENVIRONMENT.md`, `docs/WORKFLOWS.md`, and `docs/BACKLOG.md`.
    - Marked only Garmin OAuth and email notifications as open product backlog items at that point.
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
