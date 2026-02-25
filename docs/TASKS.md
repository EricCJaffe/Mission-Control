# Tasks

## ✅ COMPLETED — Database & Environment

- [x] **Run database migration**: Applied! All fitness + health tables now exist in database.
- [x] **Fitness module**: Code complete (16 pages, 18+ API routes, 18 components, 16 lib modules)
- [ ] **Set environment variables** on Vercel (if deploying):
  - `OPENWEATHER_API_KEY` — for weather integration (already set locally?)
  - `GARMIN_EMAIL` / `GARMIN_PASSWORD` — for Garmin sync (when OAuth client built)

---

## 🚨 CRITICAL PATH — March 2026 Cardiologist Appointment

**Target: Complete by early March 2026** (appointment is mid-March)

### Sprint 1: Foundation (Days 1-3)
- [ ] **1.1**: Initialize health.md with 12 sections (medical history, meds, supplements, constraints, etc.)
  - File: Seed script or `/api/fitness/health/init` route
  - Includes vector embedding generation
- [ ] **1.2**: Build `buildAISystemPrompt()` function with 14 function types
  - File: `src/lib/fitness/health-context.ts`
  - Loads persona.md, soul.md, health.md, active meds, last 7 days metrics
- [ ] **1.3**: Seed user's medications (5 Rx + 4 supplements) into `medications` table
  - Use API route or migration seed script
- [ ] **1.4**: Update all existing AI routes to use health context
  - `/api/fitness/ai/workout` → use `workout_builder` function type
  - `/api/fitness/ai/insights` → use `weekly_insights` function type
  - `/api/fitness/ai/summary` → use `post_workout_summary` function type
  - `/api/fitness/morning-briefing` → use `morning_briefing` function type
  - `/api/fitness/labs` → use `lab_analysis` function type

### Sprint 2: Lab Processing (Days 4-6)
- [ ] **2.1**: File upload system (Supabase Storage bucket + UI)
  - Files: `src/app/fitness/health/upload/page.tsx`, `/api/fitness/health/upload/route.ts`
  - Bucket: `health-files` (private, user-scoped)
  - Support: single + batch upload with rate limiting
- [ ] **2.2**: Lab report processor (PDF → AI extraction → database)
  - File: `src/lib/fitness/lab-processor.ts`
  - OpenAI GPT-4o vision extraction
  - Creates `lab_panels` + `lab_results` records
  - Status: `processing` → `needs_review` → `confirmed`
- [ ] **2.3**: Lab trend analysis & health.md updater
  - Compare against historical panels
  - Generate AI trend notes ("LDL decreased 15 points...")
  - Cross-reference with training data
  - Propose health.md updates for user approval
- [ ] **2.4**: Upload 2+ years of historical lab reports (user task)
  - Batch process with confirmation workflow

### Sprint 3: Appointment Prep (Days 7-9)
- [ ] **3.1**: Appointment CRUD (basic manager)
  - Files: `/fitness/appointments/page.tsx`, `/api/fitness/appointments/route.ts`
  - Status flow: upcoming → prep_ready → completed
- [ ] **3.2**: Appointment prep generator (AI-powered question builder)
  - File: `/api/fitness/appointments/[id]/prep/route.ts`
  - Uses `appointment_prep` function type
  - Generates 5-8 prioritized questions with context
  - Includes: changes since last visit, proactive flags
- [ ] **3.3**: Test appointment prep with mock March appointment
  - Verify questions are medically appropriate
  - Verify full health context is loaded

### Sprint 4: Cardiologist Report PDF (Days 10-12)
- [ ] **4.1**: Install `@react-pdf/renderer`: `npm install @react-pdf/renderer`
- [ ] **4.2**: Build cardiologist report generator (8 sections)
  - File: `/api/fitness/export/cardiologist-report/route.ts`
  - Sections: patient info, vital trends (charts), exercise summary, cardiac metrics, PMC, lab trends, BP detail, safety events, AI narrative
  - Charts rendered as static images
  - Professional medical formatting
- [ ] **4.3**: Export cardiologist report for March appointment
  - Date range: Since last appointment (or custom)
  - Formats: PDF (primary), Markdown (backup)

---

## 🔥 HIGH PRIORITY — Foundational Safety Features

### Medications & Safety (Days 13-15)
- [ ] **5.1**: Medications/Supplements CRUD
  - Files: `/fitness/medications/page.tsx`, `/api/fitness/medications/route.ts`
  - Grouped view: Prescriptions | Supplements | OTC
  - Add/edit/stop flows with change history tracking
- [ ] **5.2**: Supplement interaction checker (hardcoded + AI)
  - File: `src/lib/fitness/interaction-checker.ts`
  - Hardcoded rules: NSAIDs, potassium, decongestants, grapefruit, creatine, berberine, etc.
  - AI 8-category check using `supplement_interaction_check` function type
  - Returns: safe / caution / contraindicated with explanation
- [ ] **5.3**: Integrate interaction checking into add medication flow
  - Block contraindicated additions
  - Warn on caution items with user acknowledgment
- [ ] **5.4**: Health.md auto-updater (trigger system)
  - File: `src/lib/fitness/health-updater.ts`
  - Triggers: lab upload, med change, BP shift, RHR shift, etc.
  - User confirmation workflow for each proposed update
  - Version history tracking in `health_document_changes`

### Enhanced Morning Briefing (Day 16)
- [ ] **5.5**: Enhance morning briefing with health context
  - File: Update `src/components/fitness/MorningBriefingClient.tsx`
  - Add: medication reminder, fasting status, BP check due, lab work reminder
  - Uses updated `morning_briefing` function type with full context

---

## ⚡ MEDIUM PRIORITY — High Value Features

### Methylation & Genetic Data (Days 17-18)
- [ ] **6.1**: Methylation report processor
  - File: `src/lib/fitness/methylation-processor.ts`
  - Extract: MTHFR, COMT, CBS, VDR, MTR, MTRR, AHCY, MAO-A, APOE, Factor V Leiden
  - Store in `genetic_markers` table
  - Generate supplement + lifestyle implications
  - Update health.md genetic section

### Fasting Module (Days 19-20)
- [ ] **6.2**: Fasting tracker UI
  - Files: `/fitness/fasting/page.tsx`, `src/components/fitness/FastingTrackerClient.tsx`
  - Plan fast, active timer, complete/break, skip
  - Subjective ratings: energy, hunger, clarity (1-10)
- [ ] **6.3**: AI fasting advisor
  - File: `src/lib/fitness/fasting-advisor.ts`
  - Recommend best day (rest day, never before HIIT)
  - Hydration reminders, BP monitoring, electrolytes
  - Correlate with next-day readiness/HRV/body battery

### Supplement Stack Analysis (Day 21)
- [ ] **6.4**: Supplement stack analyzer ("Review My Stack" button)
  - File: `/api/fitness/medications/analyze-stack/route.ts`
  - Uses `supplement_recommendation` function type
  - Analyzes: covered needs, gaps, redundancies, interactions, kidney/liver load, timing optimization

---

## 📋 LOWER PRIORITY — Nice-to-Have Features

### Health.md Version Control (Day 22)
- [ ] **7.1**: Version history UI
  - File: `/fitness/health/history/page.tsx`
  - Timeline view, version comparison (diff), revert capability
  - Direct markdown editor for advanced users

### Appointment Workflow (Day 23)
- [ ] **7.2**: Post-appointment notes processor
  - Log discussion, record med changes, set next appointment
  - AI processes notes and suggests health.md updates

### Workout Logger Enhancement (Day 24)
- [ ] **7.3**: Add medication timing awareness to workout logger
  - Pre-workout check: "Have you taken your morning meds?"
  - "2+ hours post-coffee?" (caffeine clearance)
  - Weather advisory if outdoor + hot

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
