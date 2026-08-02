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

- [ ] **Consider scheduling the Withings sync.** It has never run automatically — that's
  why 5 months of drift went unnoticed. Now that Withings is the declared source of
  truth for BP and body composition, nothing else writes them, so if this never runs
  those metrics simply stop. Add a Vercel cron, or accept it as manual and remember to
  run it.

- [ ] **After the first Withings backfill, run the BP dedupe.** 21 Apple-sourced BP rows
  (Apr–Jun) are currently the only BP data for that period, so they were deliberately
  left in place. Once the Withings sync backfills the same readings they'll duplicate:
  ```
  APPLE_HEALTH_USER_ID=96982dec-d682-4dd0-9498-1d2d226dab83 \
    node --env-file=.env.local scripts/dedupe-bp-readings.mjs        # dry run
  ```
  Add `--apply` once the dry run looks right.

- [ ] **Apple Health ingest still 503s in production.** The route is deployed (it returns
  its own "not configured" message, not a 404), so the env vars aren't reaching it.
  Either they're not set for Production, or the deployment predates them — **env changes
  need a redeploy to take effect**. Check `vercel env ls production`, then `vercel redeploy`.

### Spirit / Soul / Body — roadmap (design captured 2026-08-02)
SHIPPED 2026-08-02 (second pass): practice tracking (`practices` + `practice_logs`,
6 seeded practices, daily check-off at `/spirit`), the traffic-light status system
(`src/lib/status-colors.ts`), and the sidebar regrouped into Spirit / Soul / Body /
Operate. Survey and practice scores are shown side by side, never blended.

- [ ] **Reading plans.** Next natural build. Licensing note: reading PLANS (lists of
  references) can be authored/seeded freely, but Bible TEXT is licensed for most modern
  translations (ESV/NIV/NASB need an API key + terms). Public-domain options (KJV, WEB,
  ASV) can be displayed freely. Recommended start: store references and link out to
  Eric's preferred Bible app — zero licensing exposure, works day one.

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

### Follow-ups parked from the 2026-07-30 session
Captured while Eric was away from the keyboard. Nothing here is broken — these are
open decisions and deferred work, roughly in the order worth doing.

- [ ] **Security: `CRON_SECRET` check fails open.**
  `src/app/api/cron/daily-metric-check/route.ts:24` only enforces the bearer token
  `if (process.env.CRON_SECRET)` — with the var unset the route is fully public. Either
  set `CRON_SECRET` in Vercel or make the check fail closed (the new Apple Health route
  shows the pattern). Same file line ~65 has a broken self-call: it builds the app URL
  from `NEXT_PUBLIC_SUPABASE_URL`, so it POSTs to the Supabase host, not the app.

- [ ] **Decide the fate of `src/components/fitness/RestTimer.tsx`.**
  Now unreferenced — the inline chip replaced it. It still has the 30/60/90/120/180
  presets the chip doesn't. Delete it, or keep it for a settings-driven long-rest view.

- [ ] **Rest length is a hardcoded 60s** (`REST_DEFAULT_SECONDS` in `WorkoutLoggerClient`).
  `set_logs.rest_seconds` already exists and nothing writes to it. Wire per-exercise rest
  lengths through if the fixed minute proves wrong in practice.

- [ ] **Confirm the caret behaviour feels right on a real phone.**
  Tapping anywhere in a weight/reps field snaps the caret to the END of the value, per
  the original request. That also means you can't tap into the middle of a number to
  edit it. One-line change in `SetNumberInput.caretToEnd` if you want mid-number taps
  to land where your thumb hits.

- [ ] **Nothing reads the new Apple Health tables yet.**
  `running_dynamics`, `mobility_metrics`, and `workout_routes` are collecting data with
  no UI. Route maps are the obvious first build — the rows already carry a bounding box
  and elevation gain so a map can be framed without reading every point.

- [ ] **GPS elevation drift.** One imported route claims 425m of climb in flat north
  Florida. It's altitude noise, not a parsing bug, but smooth it before showing elevation
  anywhere in the UI.

- [ ] **Six Apple Health metrics remain unmapped** and need columns if wanted:
  `cycling_distance`, `physical_effort`, `environmental_audio_exposure`,
  `headphone_audio_exposure`, `underwater_temperature`, `underwater_depth`.

- [ ] **Vercel CLI is outdated** (54.12.2 → 58.0.0): `npm i -g vercel@latest`.

- [ ] Garmin OAuth full automation
  - Likely obsolete once Apple Health ingest is live: Garmin Connect mirrors into Apple
    Health, so the Apple path may replace the credential-storing Garmin scrape entirely.
  - Revisit after the first week of Apple Health data — if coverage is good, delete
    `garmin/sync` + `garmin/auth` rather than finishing OAuth.
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
