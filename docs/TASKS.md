# Tasks

## Critical — Must Do Before App Works

- [ ] **Run database migration**: `supabase db push` to apply `20260225100000_fitness_module.sql` and `20260225100500_seed_exercises.sql`. All fitness tables, RLS policies, and indexes are defined but NOT yet applied to the database. Nothing in the fitness module will work until this runs.
- [ ] **Set environment variables** on Vercel (if deploying):
  - `OPENWEATHER_API_KEY` — for weather integration
  - `GARMIN_EMAIL` / `GARMIN_PASSWORD` — for Garmin sync (when built)

## Fitness Module — What's Done

### Phase 1: Foundation ✅
- Database migration written (not applied)
- Exercise seed data (migration + API endpoint POST `/fitness/exercises/seed`)
- All routing scaffold: 16 fitness pages under `/fitness/*`
- Fitness dashboard with readiness, strain, alerts, quick links
- Workout logger (strength + cardio + hybrid) with block-based architecture
- Superset/circuit grouping, set types, RPE per set
- Rest timer with configurable durations
- Plate calculator
- Workout elapsed timer (auto-starts, auto-fills duration)
- Body metrics entry (weight, sleep, stress, medication timing)
- Blood pressure dashboard with entry form, trend chart, AHA flagging, date range filter
- Workout templates manager (CRUD)
- Exercise library with CRUD + seed button for 52 default exercises
- Workout history page with repeat-workout feature
- Personal records page with auto-detection on save

### Phase 2: Device Integration ⚠️ Partial
- ✅ Weather API route (`/api/fitness/weather`)
- ✅ Garmin sync library functions (`garmin-sync.ts` — activity mapping, dedup, conversion)
- ❌ Garmin OAuth client not built (needs Garmin Health API credentials)
- ❌ Garmin auto-sync not wired up

### Phase 3: Intelligence Layer ✅
- TSS calculation (HR-based, power-based, RPE-based)
- PMC calculator (CTL/ATL/TSB) with API route
- Compliance calculation (planned vs actual)
- AI workout builder with safety-aware system prompt
- AI insights generation (post-workout summary, weekly insights)
- Morning briefing with AI recommendations
- Safety alerts engine (body battery, HRV, RHR, TSB, max HR, BP, weight)

### Phase 4: Trends & Export ⚠️ Partial
- ✅ Trends & analytics page (`FitnessTrendsClient.tsx`)
- ❌ PDF export framework (not started — needs `@react-pdf/renderer`)
- ❌ Cardiologist report PDF (not started)

### Phase 5: Plans, PRs, Equipment ✅
- Training plan creation form with CRUD API
- Training plan status management (active/completed, delete)
- Personal records page with auto-detection
- Equipment tracker (CRUD, mileage tracking)
- Plate calculator
- Mobile polish (44px tap targets, responsive)

### Phase 6: Advanced Metrics ✅ (Code complete, awaiting DB)
- Composite readiness score (0-100)
- Daily strain score (0-21, logarithmic)
- Cardiac efficiency index
- Estimated 1RM (Epley + Brzycki)
- Power zones (cycling FTP)
- Sleep debt tracker
- TDEE estimation
- Recovery timeline predictor
- Weekly stress budget
- Morning briefing page
- Lab results page (text input + AI analysis)
- Athlete profile/settings page
- Enhanced workout save (strain, cardiac efficiency, est. 1RMs, recovery)

### Additional Features Built (Beyond Original Plan)
- Appointments page (`/fitness/appointments`) — CRUD for medical appointments
- Medications page (`/fitness/medications`) — medication tracking with CRUD
- Lab panels page (`/fitness/labs`) — restructured with AI analysis
- Date range filter component (reusable across BP, trends, records)
- Workout history with repeat-workout feature
- Error feedback UI with try-catch guards on all fitness components

## Fitness Module — What's Pending

### High Priority
- [ ] Apply database migration (`supabase db push`)
- [ ] Test full flow end-to-end once DB is live
- [ ] Garmin OAuth + live sync integration

### Medium Priority
- [ ] PDF export framework (`@react-pdf/renderer`)
- [ ] Cardiologist report generator
- [ ] Recharts integration for trend charts (currently placeholder/table views)
- [ ] AI plan generation (generate April 12-week plan from March data)

### Lower Priority / Deferred
- [ ] Session photos (needs Supabase Storage setup)
- [ ] Lab file uploads (PDF/image — currently text-only)
- [ ] Seasonal zone recalibration (needs cycling data)
- [ ] Cardiologist report scheduling
- [ ] Cardiac efficiency trend charts
- [ ] 1RM progression charts

## Other Modules — Pending

- [ ] Custom Soul narrative (beyond default scaffold) — update the `soul` note
- [ ] AI helpers: monthly review summarizer
- [ ] Sermon Builder enhancements (series → book draft, automation outputs)

## Backlog Reference
See `docs/BACKLOG.md` for full module mapping.
See `docs/plan.md` for detailed fitness implementation plan with per-step status.
