# Tasks

**Last Updated:** March 10, 2026

## Current Status
- Build Status: ✅ Production build passing
- Deployment Status: ✅ Vercel-linked and deployable
- Database Status: ✅ Remote migrations aligned
- Docs Status: ✅ Refreshed to match shipped state

## Recently Shipped
- Withings OAuth/API integration with encrypted token storage, sync status, manual sync, disconnect flow, and legacy CSV fallback
- Genetics multi-report dashboard with six report types and comprehensive synthesis
- Source PDF viewer for labs and genetics
- Health command center with persisted analysis, queued `health.md` updates, and PDF export
- 12-week training plan system with AI intake, detail page, PDF export, progress tracking, and scheduling bridge
- Imaging ingestion and analysis wired into `health.md`, doctor prep, and health context
- Hydration module with targets, logging, alerts, reminders, insights, and downstream health context integration
- Nutrition module with meal suggestions, food logging/search, grocery lists, quiz/gamification, and downstream health context integration
- Recovery module for sauna, cold plunge, stretching, and mobility with readiness and briefing integration
- Morning briefing expansion: hydration, nutrition, recovery, scripture, fitness quote, daily learning
- Notes schema repair and Turbopack root pinning
- Flourishing module with colorful assessments, historical scoring, AI coaching, dashboard/reviews integration, and persona proposal review/apply flow

## Open Product Tasks
### High Priority
- [ ] **Turn on automatic Apple Health syncing — REMINDER for Eric** (2026-07-30)
  DONE already: all migrations applied to remote, and the 2026-03-01 → 2026-07-30
  backfill is imported and verified (152 daily_summaries, 110 body_metrics, 88 sleep_logs,
  23 bp_readings, 31 workouts, 5 running_dynamics, 151 mobility_metrics, 5 workout_routes).
  Re-sending the same payload is idempotent — verified by sending twice with no change.

  REMAINING, all on Eric's side:
  1. `openssl rand -hex 32` → `vercel env add APPLE_HEALTH_INGEST_TOKEN` (all envs), and
     `vercel env add APPLE_HEALTH_USER_ID` = `96982dec-d682-4dd0-9498-1d2d226dab83`.
     Add both to `.env.local` too. Until then the endpoint returns 503 in production.
  2. Buy Health Auto Export on iOS (~$2/mo or lifetime), add a REST API automation:
     POST JSON to `https://<app-domain>/api/fitness/apple-health/ingest`,
     header `Authorization: Bearer <token>`, schedule hourly, range "Since Last Sync".
  3. After the first automated sync, check `apple_health_sync_logs.metrics_unmapped`.
     Currently unmapped and deliberately so: cycling_distance, physical_effort,
     environmental/headphone_audio_exposure, underwater_temperature/depth.

  Confirmed working: the export's `source` fields show `Connect` (Garmin), `Withings`,
  `Sleep Number`, Apple Watch and iPhone all already feeding Apple Health, so this one
  automation covers every device.

- [ ] **Re-test the Withings sync after the race fix** (2026-08-02)
  The 08-02 attempt failed with `Same arguments in less than 10 seconds` — a Withings
  rate-limit on identical requests. Root cause: `sync()` fires three API calls in
  `Promise.all`, each calls `ensureValidToken()`, and with a 5-month-expired token all
  three fired their own identical refresh simultaneously. Fixed by making the refresh
  single-flight in `withings-client.ts`. **Just press Sync now again** on /fitness.
  - If it fails with an auth/invalid_grant error instead, the refresh token was rotated
    and lost by an earlier failed run (Withings rotates on every refresh, and the route
    only persisted on success — also fixed now). Reconnect at
    `/fitness/settings/withings` and it will re-authorise.
  - Same history: 2026-03-11 hit this too, and a retry ~70s later succeeded.

- [ ] **Books and Sermons are hidden, not deleted** (2026-08-02)
  `src/lib/feature-flags.ts` → set `books: true` / `sermons: true` to bring either back.
  Only the sidebar entries are gated; routes, components, API handlers and all data are
  untouched, and both are still reachable by direct URL (`/books`, `/sermons`).

- [ ] **Withings stopped reaching Apple Health around 2026-07-01** (found 2026-07-31)
  Blood pressure ends 06-27; weight / BMI / body fat / lean mass end 07-01. Everything
  Watch- or iPhone-sourced runs current, so it is specifically the Withings bridge. BP
  only ever reaches Apple Health via Withings, so there is no BP at all after 06-27.
  Not an import bug — the data is absent from the Health Auto Export file too.
  Fixes, in order:
  1. Open the Health Mate (Withings) app on the phone — it only pushes to Apple Health
     when opened. Then Settings → Health → Data Access & Devices → Health Mate → Turn On All.
  2. Run the app's own Withings sync at `/fitness/settings/withings`. The OAuth connection
     is still `connected` with valid scopes but **last synced 2026-03-11** — it is
     manual-only and nothing schedules it. This pulls from the Withings cloud directly and
     bypasses Apple entirely, so it backfills regardless of the bridge.
  3. No Withings export is needed; the OAuth connection makes it redundant.
  Blocked for Claude: `WITHINGS_CLIENT_ID`/`SECRET` aren't in `.env.local` and the repo
  isn't linked to Vercel locally (`vercel env ls` → "codebase isn't linked"), so the
  5-month-old token can't be refreshed from here. One `vercel link` would unblock it.

- [x] **Scheduling the Withings sync — DONE 2026-08-02** (see above). The manual
  "Sync now" button on /fitness remains for on-demand runs.

- [ ] **After the first Withings backfill, run the BP dedupe.** 21 Apple-sourced BP rows
  (Apr–Jun) are currently the only BP data for that period, so they were deliberately
  left in place. Once the Withings sync backfills the same readings they'll duplicate:
  ```
  APPLE_HEALTH_USER_ID=96982dec-d682-4dd0-9498-1d2d226dab83 \
    node --env-file=.env.local scripts/dedupe-bp-readings.mjs        # dry run
  ```
  Add `--apply` once the dry run looks right.

- [x] **Apple Health ingest 503 — RESOLVED 2026-08-03.** Eric set the missing env vars
      and `CRON_SECRET`. Original note below.
- [x] ~~Apple Health ingest still 503s in production.~~ The route is deployed (it returns
  its own "not configured" message, not a 404), so the env vars aren't reaching it.
  Either they're not set for Production, or the deployment predates them — **env changes
  need a redeploy to take effect**. Check `vercel env ls production`, then `vercel redeploy`.

- [x] **Two active training plans overlap — RESOLVED 2026-08-03.** Concurrent plans by
      discipline shipped; one active plan per discipline enforced in the database.
      Superseded — original text below.
- [x] ~~Two active training plans overlap — Eric's call~~ (2026-08-03)
  "Return Block — 6-Day Strength + Run" runs 07-27 → 08-09 and the new
  "Couch to 5K" runs 08-03 → 10-25, so 08-03 to 08-09 has sessions from both.
  08-04 in particular has the Return Block's "Run 4 — build" AND the 5K plan's
  Norwegian 4x4.
  - Both now show on /fitness/plans (it previously rendered only the first active
    plan, hiding the other entirely), with a plan-name chip on each session.
  - Options: let the Return Block finish and treat its runs as the 5K plan's first
    week, mark it completed early, or move the 5K start to 08-10. Not decided.

- [x] **Readiness and recovery — RESOLVED 2026-08-03.** Decided: modality logging is
      context and advice only (it double-counts what HRV/RHR/sleep already measure, and
      would make the score raisable by logging). Self-rated soreness / perceived recovery
      enters as a 0.05-weight factor — the only musculoskeletal signal in the model.
- [x] ~~Readiness does not use recovery data~~ (2026-08-03)
  `readiness.ts` scores five inputs: HRV vs baseline, RHR vs baseline, sleep duration +
  score, TSB (training stress balance), and blood pressure. Recovery sessions are read
  by `health-context.ts` for AI prompts but feed NO score.
  - Arguments for adding it: sauna, cold plunge and mobility are deliberate recovery
    actions, and doing them should plausibly move a recovery number.
  - Arguments against: readiness currently measures OUTCOMES the body reports (HRV, RHR,
    sleep). Recovery sessions are INPUTS. Mixing them means logging a sauna raises your
    readiness score without your body having recovered at all — the number starts
    measuring diligence rather than state, and stops being a useful stop/go signal.
  - Middle option: keep readiness outcome-only, and show recovery-session count beside
    it as context rather than folded in — the same separation used for the Spirit
    survey-vs-practice scores.
  - Eric asked how this works; needs his call before changing it.

- [ ] **Cycling from Garmin — richer than the Apple Health path** (Eric, 2026-08-03)
  Bike workouts reach the app today via Garmin → Apple Health → HAE, which is enough to
  count minutes but loses what Garmin actually records: power, cadence, normalised power,
  HR zones, per-lap splits. `cardio_logs` already has columns for avg/max/normalized
  power and the zone breakdown, all currently unwritten.
  - Options: pull from the Garmin Connect API (the credential-storing scrape is slated
    for deletion, so this would need proper OAuth), or import .FIT files from the bike
    computer — `/api/fitness/garmin/import-fit` already exists and parses them.
  - The FIT route is probably the better answer: no credentials, and the file straight
    off the head unit has everything the API would give.
  - Not urgent — Eric isn't back on the bike yet. Worth settling before he is.

- [x] **Prayer module — BUILT 2026-08-03.** Seeded from Eric's own 2025 prayer journal
      PDF: 121 subjects, 26 specific requests, nesting preserved. Rotation model follows
      PrayerMate (least-recently-prayed first, urgent jumps queue); answered-prayer
      tracking follows Echo. Still open: editing subjects/requests in-app (currently
      full CRUD, scheduling (daily/weekly/monthly/once/rotation, matching the calendar's
      vocabulary), a real prayer_logs history behind each checkmark, and answered
      requests now leaving the active list. Still open: prayer_sessions is written by
      nothing yet, and reflections linking to notes.
- [x] ~~Prayer module — NOT BUILT, needs a design conversation~~ (Eric, 2026-08-03)
  Confirmed absent: prayer exists only as a boolean on `daily_anchors`, a checkbox in
  the `practices` table, and three survey questions. No tables, no pages, no history.
  Eric has built one in other apps and wants to discuss features before anything is
  written. Questions worth settling first:
  - Prayer LIST vs prayer JOURNAL — tracking named people/requests over time, or
    free-form entries per session? They imply very different schemas.
  - Answered-prayer tracking, and whether an answered item stays visible.
  - Categories/recurrence (daily, weekly, situational) and whether it should surface a
    rotating subset rather than the whole list.
  - Whether it feeds the Spirit practice score, or stays separate like the reading plans
    do (reading currently ticks `bible_reading` — prayer could tick `prayer` the same way).
  - Privacy: prayer content is more sensitive than most of this app. Same RLS as
    everything else, or something stricter?
  - Overlap with notes: reading reflections mirror into `notes`; prayer could too, or
    could justify its own store.

### Spirit / Soul / Body — roadmap (design captured 2026-08-02)
- [x] **Monthly Alignment retired 2026-08-02.** It overlapped the Flourishing survey by
  ~70% (both monthly, both covering faith/health/relationships/calling) and had never
  been completed once — `monthly_reviews` had zero rows. Hidden behind
  `FEATURES.monthlyAlignment`, not deleted; the route, the submit handler and any past
  rows are untouched.
  - Its one distinctive contribution was a priority WEIGHTING (God First 30%, Family 25%,
    Health 20%, Impact 20%, Stewardship 5%) — the only place the app claimed some areas
    matter more than others. That now lives in `DOMAIN_WEIGHTS`: within Spirit, faith .6
    / calling .4; within Soul, relational .5 / mental .3 / work-money-time .2.
  - Effect on Eric's scores: Spirit 7.63 → 7.45, Soul 6.08 → 5.65. Soul dropped because
    relational (4.25, his weakest domain) now carries the most weight inside it — which
    is the point of weighting rather than a bug.

SHIPPED 2026-08-02 (second pass): practice tracking (`practices` + `practice_logs`,
6 seeded practices, daily check-off at `/spirit`), the traffic-light status system
(`src/lib/status-colors.ts`), and the sidebar regrouped into Spirit / Soul / Body /
Operate. Survey and practice scores are shown side by side, never blended.

- [x] **Reading plans — SHIPPED 2026-08-02.** Six plans seeded (Bible in a Year,
  NT in 90, John in 21, Psalms in 30, a Proverb a Day, Wisdom in 60) at
  `/spirit/reading`. Marking a day read also ticks the `bible_reading` practice.
  - **Eric must set `BIBLE_API_KEY` in Vercel and `.env.local`** — without it the page
    still works, showing references and a link out, but no inline text.
  - **Rotate the API.Bible key**: it was pasted into chat on 2026-08-02.
  - NKJV id is `63097d2a0a2f7db3-01`; public-domain KJV fallback `de4e12af7f28f599-01`.
  - Only references are stored; scripture text is fetched at render and never persisted,
    so a licence change degrades the page rather than breaking it. The API's copyright
    string is displayed with every passage — that's a licence condition.

- [ ] **Daily reminder for practices.** Currently none — the `/spirit` page shows state
  but nothing nudges. In-app prompts are feasible now (same pattern as the Flourishing
  monthly one); push/email needs infrastructure the app doesn't have.

Shipped: the Flourishing survey now rolls up into the dashboard's three pillars
(`src/lib/flourishing/spirit-soul-body.ts`), and a monthly retake prompt appears once
an assessment is 30+ days old. Everything below is designed but NOT built.

- [ ] **AI suggestions when a pillar lags.** `PillarScore` already exposes `weakest`
  (the lowest contributing domain) and `standing`/`trend`, which is the hook: when a
  pillar is `needs_attention`, propose concrete work in that domain. The scoring module
  already stores per-domain tips and scripture — start there rather than a fresh prompt.

- [ ] **Resource library.** Eric wants suggested resources tied to a lagging domain.
  Nothing exists for this yet — needs a content model before any AI wiring.

- [ ] **Blend empirical data into the pillars.** The idea: self-reported answers are one
  signal, real behaviour is another, and they should corroborate each other.
  - **Body** — the strongest candidate, because the data already exists: training
    balance (`hybrid-balance.ts`), sleep, recovery, resting HR/HRV trends. Survey
    question `pb_q2` ("stewarding my body with consistency in sleep, movement,
    nutrition, recovery") is almost literally a query against tables we now populate.
  - **Spirit** — would need reading/study tracking (Bible reading, book reading). The
    books module is currently hidden behind a feature flag; some of that scaffolding
    may be reusable.
  - **Soul (work/money/time)** — least instrumented. Calendar margin and task
    completion are plausible proxies; money would need an external source.
  - Design note: keep the survey score and the empirical score SEPARATE rather than
    blending into one number. A blended figure hides which signal moved, and the
    interesting question is precisely when they disagree — feeling stewarded while the
    training data says otherwise is the insight, not noise to average away.

- [ ] **Rubric: good / maintaining / progressing.** Half-built already — `standing`
  (thriving / maintaining / needs_attention, on 0–10 bands) and `trend`
  (progressing / holding / slipping, with a 0.5-point tolerance so self-report wobble
  doesn't read as movement). What's missing is the empirical half to check it against.

- [ ] **Cadence.** Monthly for now, per Eric; revisit quarterly if monthly proves too
  frequent. `REASSESS_INTERVAL_DAYS` in `spirit-soul-body.ts` is the single knob.
  Currently a dashboard prompt only — no email or push.

- [ ] **Audit client components for stale server props.** Fixed in FlourishingClient
  2026-08-02: it POSTed a new assessment, updated local state, and left the `history` and
  `profile` SERVER props untouched — so a new assessment appeared in the overview while
  History, the flourishing index, strongest/growth domains and the trend comparison all
  kept showing the previous one. `router.refresh()` is the fix.
  A crude grep (`POST` present, `router.refresh()` absent) flags ~20 other client
  components, but most are likely false positives — some manage state optimistically on
  purpose, some refetch explicitly, some just call read-only AI endpoints. Needs a real
  per-component check, not a bulk change.

### Follow-ups parked from the 2026-07-30 session
Captured while Eric was away from the keyboard. Nothing here is broken — these are
open decisions and deferred work, roughly in the order worth doing.

- [x] **Security: `CRON_SECRET` fail-open — FIXED 2026-08-02.** Now fail-closed (503
  when unset, 401 on a bad token). Two further bugs found and fixed in the same route:
  it used the COOKIE-based Supabase client, which has no session in a cron, so RLS
  returned zero users and the job had never processed anyone; and the broken self-call
  is gone — `HealthDocUpdater` is invoked in-process instead.
  - **Eric must set `CRON_SECRET` in Vercel** or both crons return 503 and never run.

- [x] **Withings sync now scheduled — 2026-08-02.** `/api/cron/withings-sync` runs daily
  at 11:00 UTC via `vercel.json`; the metric check follows at 12:00. Needs `CRON_SECRET`.

- [ ] **Decide the fate of `src/components/fitness/RestTimer.tsx`.**
  Now unreferenced — the inline chip replaced it. It still has the 30/60/90/120/180
  presets the chip doesn't. Delete it, or keep it for a settings-driven long-rest view.

- [x] **Rest timer reworked 2026-08-02.** Toggle in the logger toolbar (off by default,
  remembered in localStorage), duration picker 45s-3m, auto-starts when a set is marked
  done, chimes and vibrates at zero. The old design required spotting and tapping a small
  grey chip that only appeared after completion — it read as a placeholder.
  - Still unwired: `set_logs.rest_seconds` (per-exercise rest lengths). The session-level
    duration covers the common case.

- [ ] **Confirm the caret behaviour feels right on a real phone.**
  Tapping anywhere in a weight/reps field snaps the caret to the END of the value, per
  the original request. That also means you can't tap into the middle of a number to
  edit it. One-line change in `SetNumberInput.caretToEnd` if you want mid-number taps
  to land where your thumb hits.

- [x] **Route maps — SHIPPED 2026-08-02.** GPS traces render as inline SVG on the
  workout detail page (`/fitness/history/[id]`). No tiles, no map library, no key.
  - Also fixed: cardio data was only fetched when `workout_type` was literally 'cardio'
    or 'hybrid', so every Apple Health workout ('Outdoor Run' etc.) silently hid its
    heart rate and distance.
- [x] **GPS elevation drift — FIXED 2026-08-02.** Smoothed with a moving average plus a
  3m threshold. The 425m phantom climb is now 40m; genuinely flat routes read 0-6m. All
  five stored routes were recomputed.

- [x] **`running_dynamics` / `mobility_metrics` UI — WAS ALREADY BUILT.** This task was
      stale: /fitness/mobility charts both with sparklines and bands. What was genuinely
      missing and is now added: six_minute_walk_m and cardio_recovery_bpm, plus feeding
      gait data into the AI health context, which read none of it.
- [x] ~~`running_dynamics` and `mobility_metrics` still have no UI.~~ Both are
  accumulating daily rows. Trend charts are the natural next build — walking asymmetry
  and double-support are only meaningful as trend lines.

- [x] **Unmapped Apple metrics — WON'T DO** (Eric, 2026-08-02). Audio exposure,
  physical effort and underwater depth/temperature stay unmapped by choice. They are
  reported in `apple_health_sync_logs.metrics_unmapped` if that ever changes.

- [ ] **Vercel CLI is outdated** (54.12.2 → 58.0.0): `npm i -g vercel@latest`.

- [x] **Garmin scrape — KEEP DORMANT, decided 2026-08-03.** Eric wants the routes left
      in place in case we ever revert to them. Re-checked before deciding: they store
      *encrypted tokens*, not a password (the password only transits the request body),
      and `athlete_profile` currently holds no Garmin credentials at all — the code is
      inert. Earlier note that these "store the Connect password" was wrong.
- [x] ~~Delete the Garmin scrape~~ (was: CONFIRMED OBSOLETE 2026-08-02)
  Proven from Eric's own export: **21 of 31 workouts came from `Connect`** (Garmin) via
  Apple Health, plus 10 metrics (heart rate, resting HR, steps, sleep, active/basal
  energy, distance, flights, cycling distance, weight). Garmin -> Apple Health -> HAE
  already covers it, so no periodic Garmin import is needed.
  - `garmin/sync` and `garmin/auth` still store Eric's Connect PASSWORD encrypted in
    `athlete_profile.garmin_tokens`. That is the last credential-storing path in the app
    and it is now redundant — deleting it removes real risk for no lost function.
  - CSV and FIT import flows work today.
  - Garmin OAuth/live sync is still not implemented.

- [ ] **Decide how recovery items (sauna, cold plunge, etc.) are handled** (Eric, 2026-07-27)
  - A recovery module already exists (`/fitness/recovery`, `recovery.ts`, `RecoverySessionsClient`).
  - Open question: surface them in the workout logger flow / as a loggable "workout" type,
    or keep them purely in the recovery module? Reconcile before adding more recovery UI.

- [ ] **Clean up existing workout templates — not current with Eric's routine** (Eric reminder, 2026-07-27)
  - Templates "Upper Body Push" / "Back and Bicep" etc. reflect an older routine.
  - Rebuild templates to match the current Push A / Pull A / Bodyweight / Push B / Pull B split.

### Medium Priority
- [ ] Email notifications for pending `health.md` updates
  - Health update detection, review, and approval exist.
  - Outbound notification delivery still needs to be added.

### Deferred
- [ ] Withings webhook subscriptions / background incremental sync
  - OAuth connect and manual sync are implemented.
  - Notification subscriptions and automatic push-based refresh are phase 2.

## Operational Notes
- `.claude/` stays local-only and untracked.
- The stale checkout under `/Users/ericjaffe/Documents/Digital Missions Project` is not the active synced repo.
- Active repo for ongoing work is `~/Mission-Control`.
