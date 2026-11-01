# Getting run data into Mission Control

_Added 2026-11-01 with the running plan cards (PR: fitness plan UI modernize)._

Two paths are live: **manual upload** of Garmin exports, and the **Apple
Health** feed through Health Auto Export. A third, the Garmin Connect API, is
partly built and is the right long-term answer. A native HealthKit app is not
worth building.

| Path | Status | Effort for Eric | Effort to build |
|---|---|---|---|
| Manual upload (FIT / GPX / CSV) | **Live with this PR** | ~30 s per run, or a weekly CSV | Done |
| Apple Health via Health Auto Export | **Built; workouts feed stalled** (see §2) | Fix the HAE Workouts automation; then automatic | Done |
| Garmin Connect API (OAuth) | Partly built (`/api/fitness/garmin/*`) | None once connected | Medium: needs Garmin developer program approval |
| Apple Shortcuts automation | Possible, not needed | Build a Shortcut | Small, but HAE already does it better |
| Native iOS app (HealthKit) | **Not recommended** | Install a TestFlight app | Large: an app, review, upkeep |

## 1. Manual upload: Garmin Connect / Fenix 8 exports

**Where:** Fitness → Train → Training Plans (`/fitness/plans`), the *Runs* card
(or the *Upload runs* box before a running plan is loaded). Drag files in or
use *Choose files*. Up to 50 files at once, 25 MB each.

**Formats:**

| Format | How to export it | What is read |
|---|---|---|
| **FIT** (best) | Garmin Connect web → the activity → ⚙ → *Export Original* (a .zip; unzip it and upload the `.fit`). On the watch over USB: `GARMIN/Activity/*.fit` | Start, moving time, distance, avg/max HR, and every HR sample (for zone-2 %) |
| **GPX** | Garmin Connect web → the activity → ⚙ → *Export to GPX* | Start, elapsed time, distance from the track, HR samples |
| **CSV** | Garmin Connect web → *Activities* list → filter → *Export CSV* (top right) | One row per activity: date, distance, time, avg/max HR. No HR samples, so no zone-2 % |

Notes and limits:

- **CSV distances are taken as miles.** That is what a US-unit Garmin account
  exports. If the account is ever switched to kilometers, export FIT instead.
- **Only activities with a distance are imported.** Strength and yoga rows in
  the CSV are skipped and listed as skipped. Strength has its own importer.
- **Duplicates are handled.** The same file twice is refused by a per-user
  unique key. The same run arriving another way (Garmin sync, Apple Health, or
  the other export format) is matched on same day, distance within 0.1 mi, and
  time within 2 minutes, and reported as *already logged*.
- **No GPS track is stored** from an upload, only the summary.
- **Feel and notes** are not in any export. Add them on each run in the *Runs*
  card. They complete the log (+5 *Logged it*), and a note containing "smart
  stop" earns the +5 *Smart Stop*.
- Zone-2 % is computed at upload against the active running plan's zone 2. A
  run uploaded before a plan is loaded has no zone-2 %.

Stored per user in `mission.running_sessions` (`source = 'garmin_upload'`,
`dedupe_key` = the file fingerprint), owner-only RLS. Runs, walks and untyped
"Other" activities are kept; rides, swims and strength are skipped. A run with
no file can be logged by hand (*Log a run by hand*, `source = 'manual'`).
Code: `src/lib/fitness/activity-files.ts`,
`src/app/api/fitness/running/upload/route.ts`.

## 2. Apple Health: built, but the workouts feed needs fixing

**Health Auto Export (HAE)** on the iPhone posts Apple Health data on a
schedule to `POST /api/fitness/apple-health/ingest` (bearer token,
`APPLE_HEALTH_INGEST_TOKEN`, rows written for `APPLE_HEALTH_USER_ID`). It
already brings in workouts, including runs with distance, HR and routes,
upserted on `apple_workout_id` so repeats are harmless. A watchdog alerts when
the feed goes quiet (`src/lib/fitness/apple-health-status.ts`).

**Does it carry the Garmin runs?** Yes, **if Garmin Connect is allowed to
write workouts to Apple Health** (Garmin Connect app → More → Settings → Connected Apps →
Apple Health → allow it to write workouts). Then a Fenix run flows Garmin → Apple Health →
HAE → Mission Control with no manual step, and the running cards pick it up
(they read every run in the plan window, whatever the source).

**Status 2026-11-01:** daily metrics are arriving, but HAE's *Workouts*
automation has delivered nothing since 2026-10-13, so runs are not reaching
the app this way right now. Until it is fixed, use the manual upload.

What Eric would have to do: in HAE, check the *Workouts* automation is enabled
and delivering (a large backlog can hit the endpoint's size cap; narrow the
date range), and in Garmin Connect allow writing workouts to Apple Health.
Nothing to build.

Runs from this feed land in `workout_logs`. *Pull from Apple Health* on the
*Runs* card copies the ones in the plan's window into the session log
(`source = 'apple_health'`, dedupe key `apple:<workout_log id>`), skipping any
run already logged by upload or by hand.

Limits: Apple Health gets Garmin's summary and HR, but HR samples arrive per
HAE's export settings, so zone-2 % may be missing on these runs. Upload the
FIT for any run where zone 2 matters.

## 3. Other options, and why not

- **Apple Shortcuts.** A personal automation can run "Find Health Samples" and
  POST JSON to an endpoint. It works, but it is what HAE already does with less
  fragility, so there is no reason to build it.
- **HealthKit directly.** HealthKit has **no web or server API**. Reading it
  needs a native iOS app with the HealthKit entitlement, an Apple developer
  account, TestFlight or App Store review, and ongoing upkeep. Large effort for
  nothing HAE does not already provide.
- **Garmin Connect API.** Garmin's Health and Activity APIs push activities to
  a webhook after OAuth. Access requires approval into the Garmin Connect
  Developer Program. The OAuth and sync routes exist
  (`src/app/api/fitness/garmin/*`, `GARMIN_SETUP.md`); finishing it is the
  "Garmin OAuth full automation" item in `CLAUDE.md`. It is the most direct
  path, with no phone in the loop, but it waits on Garmin.
- **Strava as a bridge.** Garmin → Strava → Strava API webhook would work, and
  Strava's API is open. It adds another account and service for no gain over
  Apple Health.

## Running plan format

The running plan function's source of truth is four `mission` tables, all
owner-only RLS (migration `20261101160000`):

| Table | Holds |
|---|---|
| `running_plans` | the plan: `body` (the JSON below), `body_md` (as written), `version`, one `active` per user |
| `running_sessions` | the session log: distance, time, pace, HR, zone %, longest continuous run, gain, kcal, feel, points, notes, source, `dedupe_key` |
| `coaching_recommendations` | numbered coaching notes per plan, with review status (`pending_review`, `accepted`, `declined`, `done`) |
| `health_access_docs` | reference docs, e.g. how Apple Health reaches the app (no secrets) |

Nothing personal is in this repo. A plan is loaded through the app (the
*Running plan* box on `/fitness/plans`, paste or open a `.json`), or seeded
once by `scripts/fitness/seed-running-plan.mjs`, which reads untracked files at
apply time (dry run by default; prints counts, never content). Plan shape
(`src/lib/fitness/running-plan.ts`, validated on load):

```json
{
  "version": 1,
  "name": "Sample 10K",
  "start_date": "2030-01-07",
  "race": { "name": "Sample 10K", "date": "2030-03-02", "distance_mi": 6.2, "goal": "Finish" },
  "rules": { "hr_ceiling": 150, "z2_low": 110, "z2_high": 130, "notes": ["Easy means conversational."] },
  "phases": [
    { "name": "Base", "start": "2030-01-07", "end": "2030-02-03", "runs_per_week": 3,
      "long_run_start_mi": 2, "long_run_end_mi": 4, "intensity": "Zone 2", "deload_weeks": ["2030-01-30"] },
    { "name": "Build", "start": "2030-02-04", "end": "2030-03-02", "runs_per_week": 3,
      "long_run_start_mi": 4, "long_run_end_mi": 6, "intensity": "Zone 2 plus strides",
      "needs_clearance": "strides" }
  ],
  "milestones": [{ "id": "four", "label": "Four by February", "emoji": "⭐", "distance_mi": 4, "by": "2030-02-01" }],
  "warning_signs": ["Stop and call your doctor if ..."]
}
```

Weeks are 7-day blocks from `start_date` through the race. The long run ramps
across each phase, and a deload week cuts it by about 30%. `needs_clearance`
shows a red "needs your doctor's OK first" tip on that phase's weeks.

## Scoring

From the plan's running log, computed from the session log on every view
(`running_sessions.points` keeps the score as written, for the record): +10 per mile · +15 *Ceiling Keeper* (max HR at or under the ceiling)
· +10 *Zone Master* (80%+ in zone 2) · +5 *Logged it* (HR, time, feel and
notes all present) · +5 *Smart Stop* · +20 per week with every planned run done
· +50 at each 4-week streak. No penalties. Missing inputs drop out rather than
being guessed. Code: `src/lib/fitness/running-score.ts`.
