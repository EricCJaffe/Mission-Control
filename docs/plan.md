# Fitness Module — Implementation Plan

## Codebase Alignment Summary

Before diving into phases, here's how the fitness module maps to existing conventions:

| Concern | Existing Pattern | Fitness Module Approach |
|---------|-----------------|----------------------|
| **Ownership** | Core tables use `user_id` (not `org_id`) | Use `user_id` — this is a core planning module |
| **Pages** | Server component, `export const dynamic = "force-dynamic"`, fetch with `supabaseServer()` | Same pattern for all fitness pages |
| **Client components** | `[Feature]ListClient.tsx` in `src/components/` | `FitnessDashboardClient.tsx`, `WorkoutLoggerClient.tsx`, etc. |
| **Route handlers** | POST, `req.formData()`, redirect after mutation | Same for CRUD; JSON body for AI routes and complex logging |
| **Middleware** | `pathname.startsWith('/fitness')` + matcher | Add `/fitness/:path*` to both |
| **Navigation** | `NavLink` in `Sidebar.tsx` with emoji icon | Add `💪 Fitness` to CORE section |
| **Migrations** | `YYYYMMDDHHmmss_name.sql`, latest is `20260224140000` | Start at `20260225100000` |
| **AI calls** | `callOpenAI({ model, system, user })` from `src/lib/openai.ts` | Wrap in fitness-specific service layer, reuse `callOpenAI` |
| **Styling** | Tailwind v4 only, cards = `rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm` | Same patterns throughout |
| **Types** | Inline at top of component files | Same — no separate types directory |
| **RLS** | `auth.uid() = user_id` for all, single policy per table | Same pattern |
| **Vectors** | `embedding VECTOR(1536)` on searchable content | On `exercises`, `workout_templates`, `workout_logs`, `ai_insights` |

---

## Phase 1: Foundation — Database, Routing Scaffold, Basic Logging ✅ COMPLETE

### Step 1.1: Database Migration — Core Fitness Tables ✅

**File:** `supabase/migrations/20260225100000_fitness_module.sql` (created, **not yet applied** — needs `supabase db push`)

Create all 12 tables from the spec in a single migration:
- `exercises` — exercise library with categories, muscle groups, embeddings
- `workout_templates` — reusable workout structures (JSONB `structure` column)
- `training_plans` — periodized blocks with config, zones, medication awareness
- `planned_workouts` — prescribed sessions from a plan
- `workout_logs` — completed sessions with TSS, compliance, RPE
- `set_logs` — individual sets within strength workouts
- `cardio_logs` — HR zone data per cardio session (add `weather_data JSONB` column per spec §7)
- `body_metrics` — daily tracking (Garmin + manual), `UNIQUE` on `(user_id, metric_date)` instead of just `metric_date` to keep RLS clean
- `bp_readings` — blood pressure with auto-flagging
- `fitness_form` — PMC data (CTL/ATL/TSB), `UNIQUE` on `(user_id, calc_date)`
- `equipment` — shoes, bikes, trainers with mileage tracking
- `ai_insights` — weekly AI-generated insights
- `personal_records` — auto-detected PRs across all categories

All tables: `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`, RLS enabled, policy `auth.uid() = user_id`.

Create all indexes from spec §4.

**Key schema adjustments from spec:**
- Change `body_metrics.metric_date` UNIQUE constraint to `UNIQUE(user_id, metric_date)` — the spec has just `UNIQUE` on `metric_date` which breaks with RLS
- Change `fitness_form.calc_date` UNIQUE to `UNIQUE(user_id, calc_date)` — same reason
- Add `weather_data JSONB` to `cardio_logs` (spec §7 mentions this)
- Add `equipment_id UUID REFERENCES equipment(id)` to `workout_logs` for equipment tracking
- Use `gen_random_uuid()` for IDs (matches existing pattern, not `extensions.uuid_generate_v4()` — the spec uses `gen_random_uuid()` which is fine since `pgcrypto` is enabled)

### Step 1.2: Seed Exercise Library ✅

**File:** `supabase/migrations/20260225100500_seed_exercises.sql` + `src/app/fitness/exercises/seed/route.ts` (POST endpoint)

Seed ~40-50 common exercises covering:
- **Push:** Bench press (flat/incline/decline), dumbbell press, OHP, lateral raises, cable fly, tricep pushdown, dips, skull crushers
- **Pull:** Deadlift, barbell row, lat pulldown, seated cable row, face pulls, bicep curl, hammer curl, shrugs
- **Legs:** Squat, leg press, leg curl, leg extension, calf raises, lunges, RDL
- **Core:** Plank, hanging knee raise, cable crunch, Russian twist, ab wheel
- **Cardio:** Run, Walk, Bike (indoor), Bike (outdoor), Treadmill, Elliptical, Swimming
- **Mobility:** Foam rolling, dynamic stretching, yoga flow

All seeded with `is_template = true` and appropriate `muscle_groups` arrays. `user_id` set to `auth.uid()` — these will be inserted via an API route or a seed script that runs authenticated.

**Alternative approach (simpler):** Create an API route `POST /fitness/exercises/seed` that inserts the exercise library for the current user on first use. This avoids needing a specific user ID in migrations.

### Step 1.3: Routing Scaffold & Navigation ✅

**Files to create:**
- `src/app/fitness/page.tsx` — Main fitness dashboard (server component)
- `src/app/fitness/layout.tsx` — Optional: fitness-specific sub-navigation (dashboard / log / templates / plans / trends)
- `src/app/fitness/log/page.tsx` — Workout logging page
- `src/app/fitness/exercises/page.tsx` — Exercise library browser/editor
- `src/app/fitness/templates/page.tsx` — Workout template manager
- `src/app/fitness/plans/page.tsx` — Training plan viewer
- `src/app/fitness/trends/page.tsx` — Trends & analytics dashboard
- `src/app/fitness/bp/page.tsx` — Blood pressure dashboard
- `src/app/fitness/equipment/page.tsx` — Equipment tracker

**Files to modify:**
- `src/components/Sidebar.tsx` — Add `<NavLink href="/fitness" label="Fitness" shortLabel="FT" icon="💪" />` in CORE section (after Metrics)
- `middleware.ts` — Add `pathname.startsWith('/fitness')` to `isProtected` and `'/fitness/:path*'` to matcher

### Step 1.4: Fitness Dashboard (Main Page) ✅

**File:** `src/app/fitness/page.tsx` (server) + `src/components/FitnessDashboardClient.tsx` (client)

Layout (responsive):
- **Today card:** What's planned today, readiness check (body battery, HRV if available), quick-start button
- **Weekly calendar strip:** 7-day view with workout type icons, completion status, compliance coloring
- **Metric cards row:** RHR, HRV, Weight, BP (latest), Form/TSB — each as a small card with sparkline
- **Recent workouts list:** Last 5 completed workouts with type, duration, key stats

Server component fetches: today's planned workout, this week's workout logs, latest body metrics, latest BP reading, latest fitness form entry.

### Step 1.5: Strength Workout Logging (Mobile-First) ✅

**Files:**
- `src/app/fitness/log/page.tsx` — Entry point (select template or start blank)
- `src/components/WorkoutLoggerClient.tsx` — The core logging UI (client component, heavy interactivity)
- `src/app/fitness/log/save/route.ts` — POST handler to save completed workout (JSON body, not formData — too complex for form encoding)

**WorkoutLoggerClient features (Phase 1 MVP):**
- Template selector dropdown (or "Start Blank")
- Exercise list from template with previous performance shown
- Per-exercise: expandable set list with quick-tap logging (weight, reps, set type)
- Superset grouping visual (exercises grouped with rounds indicator)
- Set type selector: warmup / working / cooldown / drop / failure / AMRAP
- RPE per set (optional 1-10 scale) and session RPE
- Rest timer: configurable, auto-starts on set completion, prominent countdown
- Notes field per exercise and per session
- "Complete Workout" button that saves all data

**Save route (`/fitness/log/save/route.ts`):**
- Accepts JSON body (not formData — the nested set data is too complex)
- Creates `workout_logs` row
- Creates `set_logs` rows for each set
- Creates `cardio_logs` row if hybrid/cardio workout
- Auto-detects personal records (compare against `personal_records` table)
- Returns JSON `{ ok: true, workout_id, prs: [...] }` (client shows PR celebration)

### Step 1.6: Manual Cardio Logging ✅

**Extend `WorkoutLoggerClient.tsx`:**
- When workout type is "cardio" or "hybrid", show cardio fields
- Fields: activity type, duration, avg HR, max HR, distance, pace
- Time-in-zone inputs (Z1/Z2/Z3/Z4 minutes) — manual for now, auto from Garmin later
- Key cardiac metrics: HR recovery (1min), Z2 drift duration, cardiac drift %

### Step 1.7: Body Metrics & Blood Pressure Entry ✅

**Files:**
- `src/app/fitness/bp/page.tsx` — BP dashboard with entry form + trend chart
- `src/components/BPDashboardClient.tsx` — Client component for BP
- `src/app/fitness/bp/new/route.ts` — POST handler for BP readings
- `src/app/fitness/metrics/new/route.ts` — POST handler for daily body metrics (weight, etc.)

**BP Entry Widget:**
- Quick-entry form: systolic, diastolic, pulse
- Context dropdowns: position (seated/standing/lying), arm (left/right), time of day, pre/post meds, pre/post workout
- Auto-flag calculation on save (normal/elevated/high_stage1/high_stage2/crisis)
- Crisis reading (>180/>120) shows immediate red alert banner
- Trend chart: dual-line (systolic + diastolic) with AHA threshold background bands

**Weight Entry Widget (on fitness dashboard or body metrics page):**
- Quick-entry: weight (lbs), optional body fat %, muscle mass
- Trend chart with 7-day rolling average line

### Step 1.8: Workout Templates Manager ✅

**Files:**
- `src/app/fitness/templates/page.tsx` — List/create templates
- `src/components/TemplateEditorClient.tsx` — Template builder UI
- `src/app/fitness/templates/new/route.ts` — Create template
- `src/app/fitness/templates/update/route.ts` — Update template

**Features:**
- Create workout templates with ordered exercises
- Configure standalone exercises with warmup/working/cooldown set targets
- Configure superset groups with exercises, rounds, rest periods
- Save as reusable template (name, type, split_type)
- Import initial push/pull templates (user will provide their routines)

### Step 1.9: Exercise Library ✅

**Files:**
- `src/app/fitness/exercises/page.tsx` — Browse/search/add exercises
- `src/app/fitness/exercises/new/route.ts` — Add exercise
- `src/app/fitness/exercises/seed/route.ts` — Seed default exercises

---

## Phase 2: Device Integration — Garmin & Weather ⚠️ PARTIAL (Weather done, Garmin sync lib done, OAuth pending)

### Step 2.1: Garmin Connect Integration (Option B — TypeScript API Client) ⚠️ PARTIAL

**Approach:** Build a TypeScript Garmin Connect client that authenticates via Garmin SSO (same approach as `python-garminconnect` but in TS). This runs as a Next.js API route (not Edge Function) since we need full Node.js capabilities.

**Files:**
- `src/lib/garmin/client.ts` — Garmin Connect API client (auth, token refresh, data fetching)
- `src/lib/garmin/types.ts` — TypeScript types for Garmin responses
- `src/lib/garmin/sync.ts` — Sync logic (daily metrics, activities)
- `src/app/api/fitness/garmin/sync/route.ts` — Manual sync trigger endpoint
- `src/app/api/fitness/garmin/auth/route.ts` — Garmin auth/token management

**Data synced:**
- Daily: RHR, HRV, body battery, sleep score/duration, stress avg, training readiness, VO2 max → `body_metrics`
- Per activity: HR data, zones, distance, pace, power → `cardio_logs` + `workout_logs`

**Sync strategy:**
- Manual "Sync Now" button on fitness dashboard
- Auto-sync: Consider a cron-triggered API route (Vercel Cron or external cron hitting the endpoint)
- Garmin data takes priority for HR/zone metrics; user can manually override

**Prerequisite from user:** Garmin Connect email and password stored as environment variables (`GARMIN_EMAIL`, `GARMIN_PASSWORD`).

### Step 2.2: Weather Integration ✅

**Files:**
- `src/lib/weather.ts` — OpenWeatherMap client (current + forecast)
- `src/app/api/fitness/weather/route.ts` — GET endpoint for current weather + forecast

**Features:**
- Fetch current conditions and 5-day forecast for Jacksonville, FL (zip 32234)
- Display weather icons + temp on weekly calendar for outdoor workout days
- Pre-workout weather advisory: heat index thresholds trigger zone adjustment recommendations
- Store weather snapshot in `cardio_logs.weather_data` JSONB when logging outdoor cardio
- Zone adjustment rules per spec §7 (heat index brackets)

**Prerequisite from user:** OpenWeatherMap API key stored as `OPENWEATHER_API_KEY` env var.

---

## Phase 3: Intelligence Layer — TSS, PMC, AI ✅ COMPLETE

### Step 3.1: TSS Calculation Engine ✅

**File:** `src/lib/fitness/tss.ts`

Implement three TSS calculation methods:
- **HR-based (running):** `hrTSS = (duration_min × IF² × 100) / 60` where `IF = avg_HR / LTHR (140)`
- **Power-based (cycling):** `TSS = (duration_sec × NP × IF) / (FTP × 3600) × 100`
- **RPE-based (strength):** Lookup table: RPE 5 = ~40 TSS/hr, RPE 7 = ~60 TSS/hr, RPE 9 = ~80 TSS/hr

Auto-calculate TSS on workout save and update `workout_logs.tss`.

### Step 3.2: PMC (Performance Management Chart) Calculator ✅

**File:** `src/lib/fitness/pmc.ts`

- Calculate CTL (42-day exponential weighted avg), ATL (7-day), TSB (CTL - ATL)
- Run daily: API route `POST /api/fitness/pmc/calculate` that processes all workout logs and updates `fitness_form` table
- Form status guardrails: Fresh (>15), Optimal (0-15), Fatigued (-10 to 0), Overreaching (<-10), Critical (<-25)
- Ramp rate calculation (7d and 28d CTL change)

### Step 3.3: Compliance Calculation ✅

**File:** `src/lib/fitness/compliance.ts`

Compare actual workout vs. planned:
- Green: within ±20% of planned duration/volume/TSS
- Yellow: 50-79% or 121-150%
- Orange: >50% deviation
- Red: missed/skipped

Calculate on workout save, store in `workout_logs.compliance_pct` and `compliance_color`.

### Step 3.4: AI Workout Builder ✅

**Files:**
- `src/lib/fitness/ai.ts` — Fitness AI service layer (wraps `callOpenAI`)
- `src/app/api/fitness/ai/workout/route.ts` — Generate workout endpoint
- `src/app/api/fitness/ai/insights/route.ts` — Generate insights endpoint
- `src/app/api/fitness/ai/summary/route.ts` — Post-workout summary endpoint

**System prompt context** (per spec §8): athlete profile, medications, HR zones, current status (RHR, HRV, body battery, TSB), safety rules (never exceed 155 bpm, body battery < 25 → recovery only, etc.)

**Template Mode:** AI takes an existing template + recent logs → suggests progressive overload adjustments. Returns modified template JSONB.

**On-the-fly Mode:** Natural language → structured workout JSON. "45 minutes, push day, feeling good" → full workout with exercises, sets, reps, target weights.

**Post-workout Summary:** After saving a workout, generate a brief AI insight about the session.

**Weekly Insights:** Sunday evening generation — training volume vs plan, metric changes, PRs, readiness assessment, recommendations.

### Step 3.5: Safety Alerts Engine ✅

**File:** `src/lib/fitness/alerts.ts`

Check on each Garmin sync or manual entry:
- Body battery < 25 → recovery day suggestion
- HRV drop >20% from 7-day avg → flag overtraining/illness
- RHR increase >5 bpm from baseline → flag
- TSB < -25 → force deload recommendation
- Max HR exceeded 155 in a session → safety warning
- BP Stage 2+ → flag and recommend re-check
- BP Crisis → immediate alert
- Weight change >3 lbs in 24 hours → fluid retention flag

Store alerts as `ai_insights` with appropriate `priority` level.

---

## Phase 4: Trends, Charts, PDF Export ⚠️ PARTIAL (Trends page done, PDF export not yet built)

### Step 4.1: Trends & Analytics Dashboard ✅

**Files:**
- `src/app/fitness/trends/page.tsx` — Server component, fetches historical data
- `src/components/FitnessTrendsClient.tsx` — Client component with charts

**Charts to implement** (using lightweight charting — consider adding `recharts` or `chart.js` as a dependency):

Primary:
- Resting HR trend (line, target zone <70 highlighted)
- HRV trend (line)
- PMC chart (3-line: Fitness CTL / Fatigue ATL / Form TSB)
- Blood pressure trend (dual line + AHA threshold bands)
- Weight trend (line + 7-day rolling average)
- Weekly volume (stacked bars: Z2 + HIIT + Strength minutes)
- Zone distribution (stacked bar per week, target 80/20 Z2/Z4)
- Compliance rate (planned vs completed)

Secondary (later):
- Z2 drift duration over time
- HR recovery rate after HIIT
- Pace at Z2 HR over time
- Strength progression (1RM estimates)
- Equipment mileage
- Sleep score correlation
- Weather impact analysis
- BP vs exercise frequency

**Charting library decision:** Add `recharts` (React-native, lightweight, Tailwind-friendly). It's the most common choice for Next.js projects and doesn't require heavy setup.

### Step 4.2: PDF Export Framework ❌ NOT STARTED

**Files:**
- `src/lib/fitness/pdf.ts` — PDF generation utilities
- `src/app/fitness/export/route.ts` — PDF export endpoint (GET with query params for type + date range)

**Approach:** Use `@react-pdf/renderer` for structured PDF generation. This gives us full control over layout, is React-native, and works server-side.

**Exportable PDFs:**
- Weekly Summary: calendar + metrics + AI insights
- Trends Report: date range selection, all charts as static renders
- Workout Detail: single workout with all sets/reps/HR data
- Monthly Assessment: AI-generated monthly report

### Step 4.3: Cardiologist Report PDF ❌ NOT STARTED

**File:** `src/app/fitness/export/cardiologist/route.ts`

**Structure per spec §9:** 8-section report including medication context, vital signs summary (with charts), exercise summary, cardiac metrics, TSS/readiness, BP detail, safety events, AI assessment.

Professional formatting with:
- Clean typography, clinical terminology
- Charts rendered as static images
- AHA guideline reference bands
- Disclaimer: "This report is auto-generated from personal training data and is not a medical assessment"
- Date range selector (default: since last appointment)

---

## Phase 5: Training Plans, PRs, Equipment, Polish ✅ MOSTLY COMPLETE

### Step 5.1: Training Plan Engine ✅

**Files:**
- `src/app/fitness/plans/page.tsx` — Plan viewer/manager
- `src/components/TrainingPlanClient.tsx` — Plan visualization
- `src/app/fitness/plans/new/route.ts` — Create plan
- `src/app/api/fitness/ai/plan/route.ts` — AI plan generation

**Features:**
- Import the March 5-week "Cardiac Strength Protocol" plan as `training_plans` + `planned_workouts`
- Plan visualization: timeline with mesocycles, deload weeks marked, weekly structure
- AI generates April 12-week plan based on March data (3 mesocycles × 4 weeks, 3 build + 1 deload)
- Weekly view shows planned vs actual with compliance coloring

### Step 5.2: Personal Records System ✅

**File:** `src/lib/fitness/records.ts`

- Auto-detect PRs during workout save (compare against `personal_records` table)
- Categories: max weight, max reps, max volume, estimated 1RM, best pace, longest Z2 drift, lowest RHR, highest HRV
- Celebration UI: confetti/callout when new PR is set (client-side animation)
- PR history timeline view

### Step 5.3: Equipment Tracking ✅

**Files:**
- `src/app/fitness/equipment/page.tsx` — Equipment list/manager
- `src/app/fitness/equipment/new/route.ts` — Add equipment
- `src/app/fitness/equipment/update/route.ts` — Update equipment

**Features:**
- Add shoes, bikes, trainers with purchase date and replacement threshold
- Auto-accumulate distance from workout logs (link workout → equipment)
- AI alerts when approaching replacement threshold
- Status management: active / retired / maintenance

### Step 5.4: Plate Calculator ✅

**File:** `src/components/PlateCalculator.tsx` (client component, used inside WorkoutLoggerClient)

Given target weight, show plates needed per side assuming standard 45 lb bar and standard plate set (45, 35, 25, 10, 5, 2.5 lb plates).

### Step 5.5: Mobile Polish ✅ (44px tap targets, rest timer visibility, responsive)

- Verify all tap targets ≥ 44px
- Test swipe navigation between exercises during logging
- Optimize rest timer visibility (always-visible during active workout)
- Quick-start: one tap from dashboard to start today's planned workout
- Review responsive breakpoints across all fitness pages

---

## New Dependencies Required

| Package | Purpose | Phase |
|---------|---------|-------|
| `recharts` | Charting for trends/analytics | Phase 4 |
| `@react-pdf/renderer` | PDF generation for exports + cardiologist report | Phase 4 |

No other new dependencies needed — the existing stack (Next.js 16, React 19, Supabase, Tailwind v4, OpenAI) covers everything else.

---

## Environment Variables Required

| Variable | Purpose | Phase |
|----------|---------|-------|
| `GARMIN_EMAIL` | Garmin Connect login | Phase 2 |
| `GARMIN_PASSWORD` | Garmin Connect login | Phase 2 |
| `OPENWEATHER_API_KEY` | Weather API | Phase 2 |
| `OPENAI_API_KEY` | Already exists — used for AI features | Phase 3 |

---

## Files Changed in Existing Codebase

Only 2 existing files modified:
1. **`src/components/Sidebar.tsx`** — Add Fitness NavLink (1 line)
2. **`middleware.ts`** — Add `/fitness` to protected routes (2 lines)

Everything else is **new files only** — zero risk to existing functionality.

---

## Migration Safety

- All new tables, no alterations to existing tables
- All tables use `user_id` ownership (matches core pattern)
- RLS enabled on every table
- No changes to existing RLS policies
- No changes to existing storage buckets
- Vector extension already enabled — just adding new `VECTOR(1536)` columns

---

## Estimated File Count by Phase

| Phase | New Files | Modified Files |
|-------|-----------|---------------|
| Phase 1 | ~20-25 (migrations, pages, components, routes) | 2 (Sidebar, middleware) |
| Phase 2 | ~8-10 (Garmin client, weather, API routes) | 0 |
| Phase 3 | ~10-12 (TSS, PMC, AI service, alerts, API routes) | 1-2 (extend workout save) |
| Phase 4 | ~6-8 (trends components, PDF generation, export routes) | 0 |
| Phase 5 | ~8-10 (plans, records, equipment, plate calc) | 1-2 (extend workout logger) |

**Total: ~55-65 new files, 3-4 existing files modified**

---

## Phase 6: Advanced Metrics, Scoring, Lab Results & Garmin Sync

### Status: Schema + Types + Libs + API Routes WIRED UP (awaiting DB migration)

This phase extends the fitness module with Whoop-style composite scoring, cardiac-specific
metrics, lab result analysis, calendar integration, and Garmin activity matching.

### What's Been Built

#### Schema Additions (migration modified, not yet run)
| Table/Change | Purpose | Status |
|---|---|---|
| `athlete_profile` | Centralized user settings — FTP, zones, meds, targets, baselines | **Done** |
| `daily_readiness` | Composite 0-100 readiness score with factor breakdown | **Done** |
| `daily_strain` | 0-21 logarithmic strain score per day | **Done** |
| `lab_results` | Lab uploads with AI analysis, parsed results, flags | **Done** |
| `sleep_debt_view` | Rolling 7/14-day sleep balance (SQL view) | **Done** |
| `workout_logs` +columns | `avg_hr`, `max_hr`, `garmin_data`, `source`, `strain_score` | **Done** |
| `cardio_logs` +columns | `cardiac_efficiency`, `cardiac_cost`, `efficiency_type`, `hr_recovery_2min` | **Done** |
| `planned_workouts` +column | `status` (pending/completed/skipped/substituted) | **Done** |
| `body_metrics` +columns | `meds_taken_at`, `sleep_stages` | **Done** |

#### Type Definitions (`src/lib/fitness/types.ts`)
New types: `ReadinessInputs`, `ReadinessResult`, `ReadinessFactor`, `StrainInputs`,
`StrainResult`, `BalanceResult`, `SleepDebt`, `CardiacEfficiencyResult`,
`RecoveryPrediction`, `WeeklyBudget`, `Estimated1RM`, `PowerZones`, `AthleteProfile`,
`LabResult`, `MorningBriefing`, `PlanPhase`, `WorkoutSource`, plus updated `WorkoutLog`,
`CardioLog`, `BodyMetrics`, `PlannedWorkout` with new columns.

#### Core Lib Functions (all pure TypeScript, no DB dependency)
| File | Functions | Status |
|---|---|---|
| `readiness.ts` | `calculateReadinessScore()` — weighted composite from 7 factors | **Done** |
| `strain.ts` | `calculateDailyStrain()`, `calculateWorkoutStrain()` — log-scale 0-21 | **Done** |
| `cardiac-efficiency.ts` | `runningEfficiency()`, `cyclingEfficiency()`, `cardiacCost()`, `calculateCardiacEfficiency()` | **Done** |
| `estimated1rm.ts` | `epley1RM()`, `brzycki1RM()`, `estimated1RM()`, `bestEstimated1RM()`, `buildEstimated1RMRecords()` | **Done** |
| `power-zones.ts` | `calculatePowerZones()`, `getPowerZone()`, `cyclingTSS()`, `estimateFTPFrom20Min()` | **Done** |
| `sleep-debt.ts` | `calculateSleepDebt()`, `formatSleepDebt()` | **Done** |
| `tdee.ts` | `calculateBMR()`, `estimateTDEE()`, `estimateWeeklyTDEE()` | **Done** |
| `recovery.ts` | `predictRecovery()` — post-workout recovery timeline | **Done** |
| `weekly-budget.ts` | `calculateWeeklyBudget()`, `updateBudgetPace()`, `formatBudget()` | **Done** |

#### Enhanced Existing Services
| File | Changes | Status |
|---|---|---|
| `ai.ts` | `buildSystemPrompt()` now accepts BP, meds timing, sleep debt, readiness, FTP context. New functions: `generateMorningBriefing()`, `analyzeLabResults()` | **Done** |
| `alerts.ts` | New checks: `checkSleepQuality()`, `checkBPTrainingCorrelation()`, `checkMedicationTiming()`, `checkHrRecovery()`. Enhanced `runAllAlerts()` with all new checks. | **Done** |

#### API Routes
| Route | Method | Purpose | Status |
|---|---|---|---|
| `/api/fitness/readiness` | GET | Calculate + cache daily readiness score | **Done** |
| `/api/fitness/strain` | GET/POST | Daily strain score, recalculate after workout | **Done** |
| `/api/fitness/calendar` | GET | iCal export of planned workouts (.ics) | **Done** |
| `/api/fitness/morning-briefing` | GET | Morning briefing with AI recommendations | **Done** |
| `/api/fitness/athlete-profile` | GET/PUT | Manage athlete settings | **Done** |
| `/api/fitness/labs` | GET/POST | Upload and AI-analyze lab results | **Done** |

#### New Pages & Components (Phase 6b)
| Page / Component | Purpose | Status |
|---|---|---|
| `/fitness/morning` + `MorningBriefingClient.tsx` | Morning Briefing — readiness gauge, overnight stats, today's plan, AI coach, factor breakdown, BP alert | **Done** |
| `/fitness/labs` + `LabResultsClient.tsx` | Lab Results — upload form (date, type, provider, raw text), detail view with parsed results + AI flags + analysis | **Done** |
| `/fitness/settings` + `AthleteProfileClient.tsx` | Athlete Profile — cardiac settings, cycling FTP, baselines & goals, sleep & medication schedule | **Done** |
| `FitnessDashboardClient.tsx` enhanced | Added readiness + strain widgets after alerts, new quick links (Morning Brief, Labs, Settings) | **Done** |
| `WorkoutLoggerClient.tsx` enhanced | Post-workout screen shows strain, cardiac efficiency, est. 1RMs, recovery prediction; avg/max HR inputs for strength; HR recovery 2-min for cardio | **Done** |
| Body metrics form enhanced | Added sleep duration (hours), stress avg, medication timing (`meds_taken_at`) fields + route handler | **Done** |

#### New Lib: Garmin Sync (`garmin-sync.ts`)
| Function | Purpose | Status |
|---|---|---|
| `mapGarminActivityType()` | Maps Garmin activity types to our types (run, bike, strength, HIIT, etc.) | **Done** |
| `matchActivityToPlannedWorkout()` | Match by date + type with compatible fallback | **Done** |
| `garminActivityToCardioLog()` | Convert Garmin metrics to cardio_log format | **Done** |
| `extractStrengthHR()` | Pull HR stats from Garmin Strength mode activity | **Done** |
| `buildDeduplicationCheck()` | Prevent duplicate imports via `garmin_activity_id` | **Done** |

#### Enhanced Workout Save Route (`/fitness/log/save`)
| Feature | Status |
|---|---|
| Cardiac efficiency calculation (running + cycling) | **Done** |
| Estimated 1RM detection (Epley + Brzycki, PR detection) | **Done** |
| Workout strain scoring (log-scale) | **Done** |
| Planned workout status update (`completed`) | **Done** |
| Recovery prediction in response | **Done** |
| Response includes: `strain_score`, `cardiac_efficiency`, `estimated_1rms`, `recovery` | **Done** |

### What's NOT Yet Built (requires DB or external integrations)

| Feature | Blocker | Next Step |
|---|---|---|
| **Garmin OAuth + sync** | Need Garmin Health API credentials, npm package | Build Garmin Connect client + `/api/fitness/garmin/sync` route |
| **Garmin data flowing** | Depends on OAuth working | Will auto-populate body_metrics, cardio_logs, workout_logs |
| **Cardiac efficiency trend charts** | UI + enough data accumulated | Add to trends/analytics page |
| **1RM progression charts** | UI + data | Add to strength trends |
| **Cardiologist report generator** | Separate feature scope | Build PDF/markdown report from accumulated data |
| **Session photos** | Supabase Storage setup | Photo upload + vectorized notes |
| **Lab file uploads (PDF/image)** | Supabase Storage setup | Currently text-only input; add file upload later |
| **Seasonal zone recalibration** | Need cycling data first | AI suggestion after 2-3 months cycling data |

### Item Checklist (from user requirements)

| # | Feature | Status |
|---|---|---|
| 1 | BP context in AI analysis | **Done** — enriched `buildSystemPrompt` |
| 2 | Cardiologist report scheduling | Deferred — Phase 7 |
| 3 | Seasonal zone recalibration | Deferred — needs cycling data |
| 4 | RPE-HR calibration | **Done** — data captured in set_logs + cardio_logs, calibration in AI context |
| 5 | Sleep quality → performance | **Done** — `checkSleepQuality()` alert + readiness factor |
| 6 | Medication timing | **Done** — schema column + `checkMedicationTiming()` alert + AI context |
| 7 | Progressive overload / est. 1RM | **Done** — `estimated1rm.ts` with Epley+Brzycki |
| 8 | Warm-up protocol enforcement | **Done** — strengthened in AI safety rules |
| 9 | Cool-down HR tracking | **Done** — `hr_recovery_2min` column + `checkHrRecovery()` alert |
| 10 | Session photos/notes | Deferred — needs Storage |
| 11 | Calendar export | **Done** — `/api/fitness/calendar` iCal endpoint |
| 12 | TDEE estimation | **Done** — `tdee.ts` with Mifflin-St Jeor |
| 13 | Superset rest optimization | Partially done — `rest_seconds` tracked, AI analysis pending |
| 14 | Cycling power zones | **Done** — `power-zones.ts` + FTP in athlete_profile |
| 15 | Garmin workout sync | Schema ready, API not yet built |
| 16 | Lab results with AI | **Done** — schema + AI analysis + API routes |

### Advanced Metrics (from companion spec)

| # | Metric | Status |
|---|---|---|
| 1 | Composite Readiness Score (0-100) | **Done** — `readiness.ts` + API + dashboard widget + morning briefing |
| 2 | Daily Strain Score (0-21) | **Done** — `strain.ts` + API + dashboard widget + post-workout display |
| 3 | Strain-Recovery Balance | **Done** — calculation in `weekly-budget.ts` |
| 4 | Sleep Debt Tracker | **Done** — `sleep-debt.ts` + SQL view |
| 5 | Cardiac Efficiency Index | **Done** — `cardiac-efficiency.ts` + auto-calc on save + post-workout display |
| 6 | Recovery Timeline Predictor | **Done** — `recovery.ts` + post-workout display |
| 7 | Morning Briefing | **Done** — API route + `/fitness/morning` page + full UI |
| 8 | Weekly Stress Budget | **Done** — `weekly-budget.ts` |

### SQL Migration — Must Be Run Manually

The migration file `supabase/migrations/20260225100000_fitness_module.sql` contains ALL schema
changes and has **not been applied** to the database yet. It must be run via:

```bash
supabase db push
```

This single migration creates:
- **16 tables**: exercises, workout_templates, training_plans, equipment, planned_workouts,
  workout_logs, set_logs, cardio_logs, body_metrics, bp_readings, fitness_form, ai_insights,
  personal_records, athlete_profile, daily_readiness, daily_strain, lab_results
- **Column additions**: workout_logs (avg_hr, max_hr, garmin_data, source, strain_score),
  cardio_logs (cardiac_efficiency, cardiac_cost, efficiency_type, hr_recovery_2min),
  planned_workouts (status), body_metrics (meds_taken_at, sleep_stages)
- **1 SQL view**: sleep_debt_view
- **RLS policies** on all tables
- **Indexes** on all key columns

No separate migration needed — everything is in the single file since it hasn't been applied yet.
