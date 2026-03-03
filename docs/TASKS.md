# Tasks

**Last Updated:** March 3, 2026

## 📍 CURRENT STATUS

**Build Status:** ✅ Production build passing
**Deployment Status:** ✅ Ready for Vercel deployment
**Database Status:** ✅ All migrations applied, clean state
**Recent Changes (March 1 Session):**
- ✅ **Methylation Report Processing (COMPLETE)**: Full end-to-end pipeline working
  - ✅ PostgREST schema cache issue resolved with direct SQL insert + RPC functions
  - ✅ Rich AI analysis: gene explanations, supplements, dietary, lifestyle, medication, cardiac, doctor discussion
  - ✅ Persistent analysis storage via `analysis_json` JSONB column + RPC functions
  - ✅ Genetics review page with rich AnalysisDisplay component
  - ✅ Auto-redirect to labs dashboard methylation tab after confirm
  - ✅ Fixed dashboard loading bug (methylation tab stuck on "Loading dashboard...")
  - Migration: `20260301200000_health_file_uploads_analysis_json.sql` applied

**Recent Changes (Feb 28 Morning Session):**
- ✅ **Fitness Dashboard UI Polish (COMPLETE)**: Colorful metric cards with themed designs
  - RHR card (red theme) → /fitness/metrics/rhr with AI insights
  - HRV card (purple theme) → /fitness/metrics/hrv with AI insights
  - Sleep card (indigo theme) showing last night + 7-day averages
  - Weight card (green theme) merged with body comp
  - Sidebar icons now colorful (12 different colors across nav sections)
  - Trends pages consolidated: /fitness/metrics/trends redirects to /fitness/trends
  - Components: RHRDashboardClient, HRVDashboardClient (212 lines each)
  - API routes: /api/fitness/insights/rhr, /api/fitness/insights/hrv

**Previous Session (Feb 27):**
- ✅ **Calendar Module Enhancement (COMPLETE)**: Full-featured calendar with fitness integration
  - Three calendar views: Month grid (6 weeks), Week grid (7 days × 24 hours), Day timeline
  - Pill-tab view switcher with smooth transitions
  - Advanced filters: event type, domain, completed status, date range
  - "Schedule Workout" modal with template selection or AI builder
  - Database trigger: Auto-sync planned_workouts ↔ calendar_events
  - Click-through navigation: Calendar → workout history/plans → exercise details
  - API routes: POST/PATCH/DELETE for planned workouts
  - Files: 8 new, 2 modified (~1,500 LOC)
  - Migration: `20260228000000_calendar_workout_sync.sql` applied successfully

- ✅ **Health.md Auto-Updater System (COMPLETE)**: Comprehensive 5-week implementation
  - Trigger detection: medication_change, lab_upload, metric_shift, methylation_upload
  - 7 of 12 sections support automated generation (§2, §3, §4, §5, §6, §7, §9)
  - User approval workflow with diff viewer and batch operations
  - Version control with change logs and revert capability
  - Dashboard widget showing pending update count
  - Review page at `/fitness/health/review-updates` with side-by-side diffs
  - Daily cron job for metric shift monitoring
  - Files: 13 new, 7 modified (~2,000 LOC)
  - Docs: `docs/health-md-auto-updater-plan.md`, `docs/health-md-auto-updater-summary.md`

**Previous Session (Feb 26 Evening):**
- UI Modernization: Lucide React icons replaced all emoji across 70+ files
- Card style migration: bg-white/70 → bg-white, border-white/80 → border-slate-100
- Dashboard Enhancement: Hero cards with SVG score ring, pill tabs, enhanced metric grid
- Medications: Auto-seeding from health.md data, column name resilience
- Health Context Fixes: Fixed body_metrics column names, BP query, fasting_logs safety
- FIT Parser Fixes: Corrected stress extraction, body battery filter
- Cardiologist Report PDF: 2-page report with @react-pdf/renderer
- Appointment Prep: AI pipeline working end-to-end

---

## 🚨 CRITICAL PATH — March 2026 Cardiologist Appointment

**Target: March 13, 2026 — Dr. Chandler, Cardiologist**

### Sprint 1: Foundation ✅ COMPLETE
- [x] **1.1**: Initialize health.md — 12-section living document created via `/api/fitness/health/init`
- [x] **1.2**: `buildAISystemPrompt()` — 19 function types, loads persona/soul/health.md/meds/metrics with safety rules
- [x] **1.3**: Seed medications — 5 Rx + 4 supplements auto-seed on `/fitness/medications` page load
- [x] **1.4**: AI routes use health context — appointment_prep, lab_analysis, morning_briefing all integrated

### Sprint 2: Lab Processing ✅ COMPLETE
- [x] **2.1**: File upload system — Supabase Storage `health-files` bucket, `/fitness/health/upload`
- [x] **2.2**: Lab report processor — AI extraction, creates lab_panels + lab_results, status workflow
- [x] **2.3**: Lab trend analysis — comprehensive analysis with category grouping, trend charts (Recharts)
- [ ] **2.4**: Upload historical lab reports (user task — in progress)

### Sprint 3: Appointment Prep ✅ COMPLETE
- [x] **3.1**: Appointment CRUD — `/fitness/appointments` with status flow
- [x] **3.2**: AI prep generator — 5-8 prioritized questions, changes summary, flags
- [x] **3.3**: March 13 setup page — `/fitness/appointments/march-setup` with prereq checks
- [x] **3.4**: Dr. Chandler appointment created and prep generated successfully

### Sprint 4: Cardiologist Report PDF ✅ COMPLETE
- [x] **4.1**: Installed `@react-pdf/renderer`
- [x] **4.2**: Built 2-page cardiologist report (`src/lib/fitness/cardiologist-report.tsx`)
  - Page 1: Flags, vitals, changes table, prioritized questions with data points
  - Page 2: Prescriptions table, supplements table, 4 notes areas for appointment
- [x] **4.3**: API route `/api/fitness/appointments/report?id=<id>` streams PDF
- [x] **4.4**: "PDF Report" download button on appointment detail view

---

## ✅ COMPLETE — Genetics Multi-Report Dashboard

Full plan: `docs/GENETICS_MULTI_REPORT_PLAN.md`

- [x] **Step 1**: 6 report type slugs defined in `genetics-processor.ts`
- [x] **Step 2**: Migration `20260302000000_genetics_comprehensive_analysis.sql` — table + RPC functions
- [x] **Step 3**: `genetics-processor.ts` (461 lines) with type-specific extraction + analysis prompts
- [x] **Step 4**: Upload flow routes all 6 genetic types to unified processor
- [x] **Step 5**: Review page updated to handle all genetic report types (not just methylation)
- [x] **Step 6**: Methylation API returns all genetic report types
- [x] **Step 7**: `/api/fitness/health/genetics/comprehensive` POST + GET routes
- [x] **Step 8**: Lab Dashboard methylation tab with comprehensive card + collapsible per-report cards
- [x] **Step 9**: Per-report refresh + comprehensive refresh buttons
- [x] **Step 10**: PDF viewer (signed URLs) on each report card

---

## 🔥 OPEN TASKS — Next Session

### Methylation Report Display
- [x] **✅ RESOLVED: Methylation reports now visible on lab results page**
  - Solution: Created dedicated API route `/api/fitness/health/methylation` to fetch genetic markers
  - Updated `LabDashboardClient.tsx` to query `genetic_markers` table directly (not health.md)
  - Display shows:
    - Report header with file name, marker count, upload date, processing status
    - AI analysis summary with supplement & lifestyle recommendations
    - Cardiac relevance section
    - SNP data table grouped by gene (MTHFR, COMT, CBS, etc.)
    - Each marker shows: variant, rsID, genotype, status (normal/heterozygous/homozygous), notes
  - Files:
    - `src/app/api/fitness/health/methylation/route.ts` (new, 77 lines)
    - `src/components/fitness/LabDashboardClient.tsx` (updated methylation tab display)
  - Note: Health.md Section 9 auto-update still pending (separate task)

### Workout Log Button Visibility
- [x] **✅ RESOLVED: Floating action button added to fitness dashboard**
  - Full workout logger exists at `/fitness/log` (template selection, build-on-fly, drag-and-drop, sets, RPE)
  - Solution: Added fixed bottom-right floating action button (blue circle with dumbbell icon)
  - Also added "Log Workout" button in Today's workout hero card
  - Files: `src/components/fitness/FitnessDashboardClient.tsx` (lines 201-207, 307-313)

---

## ⚡ MEDIUM PRIORITY — Future Work

- [x] **PDF Viewer on Lab Dashboard**: "View PDF" buttons on both bloodwork panels and genetics report cards
  - Signed URL generation via `/api/fitness/health/files/signed-url` (1-hour expiry)
  - Opens in new tab, loading state, user ownership verification
- [x] **Supplement interaction checker**: Dual-layer system
  - Fast layer: 17 hardcoded cardiac-focused rules in `interaction-rules.ts`
  - AI layer: GPT-4o-mini analysis via `/api/fitness/medications/ai-review`
  - InteractionChecker component, SupplementProposal modal, MedicationAIInsights component
- [x] **Enhanced morning briefing**: Medication reminders + fasting status
  - Medications grouped by timing (morning/evening), fasting-medication conflict detection
  - "Mark Morning Meds Taken" button, fasting hours display, AI briefing includes both
- [x] **Fasting tracker UI + AI advisor**: End-fast modal with energy/hunger levels, AI fasting advice
- [x] **Supplement stack analyzer ("Review My Stack")**: "Analyze My Stack" in MedicationAIInsights
- [ ] Garmin OAuth full automation (manual FIT import works)
- [x] **AI plan generation**: Full implementation at `/api/fitness/plans/generate` with TrainingPlansClient UI

---

## 📋 LOWER PRIORITY

- [x] **Post-appointment notes processor**: AI → health.md updates via `/api/fitness/appointments/process-notes`
- [x] **Medication timing awareness in workout logger**: MedicationTimingCard component in workout log page
- [x] **Session photos (Supabase Storage)**: WorkoutPhotos component with upload, grid, lightbox, delete
  - Migration: `20260303000000_workout_photos.sql` (needs `supabase db push`)
- [x] **Seasonal zone recalibration**: Auto-calculated HR zones from max HR ceiling with Jacksonville heat adjustments
  - `hr-zones.ts` utility, recalibrate-zones API endpoint, seasonal display in settings UI
  - Summer: -8 bpm, transition months: -2 to -4 bpm, winter: full capacity
- [x] **1RM progression charts**: OneRMProgressionChart component on personal records page
- [ ] **Email notifications for pending health.md updates**
  - **BLOCKED**: Requires email service integration (Resend recommended)
  - Tasks: Install `resend` package, create `/api/notifications/email` route, configure Resend API key
  - Then: Wire health.md pending updates to trigger email notifications

---

## ✅ COMPLETED — Vitality Evolution Phases

### Phase 0: Discovery ✅
- Explored codebase: 54 pages, 27 DB tables, Tailwind v4, no config file, Geist Sans font

### Phase 1: UI Modernization ✅
- Installed lucide-react, replaced all emoji icons across 14 sidebar items + 13 fitness components
- Updated card style: bg-white/70 → bg-white, border-white/80 → border-slate-100 across 61 files
- Updated CLAUDE.md conventions

### Phase 2: Dashboard Enhancement ✅
- Pill tab navigation (Dashboard/Briefing/Metrics/BP/Trends/History/Labs)
- Hero cards: Readiness (SVG score ring), Strain (dark circle), Today's workout
- Enhanced 2x3 metric grid with 3xl numbers + Lucide icons
- Horizontal quick links (4-col grid)

### Phase 3-4: Health Intelligence ✅
- health.md initialized with comprehensive 12-section cardiac profile
- buildAISystemPrompt() with 19 function types + hardcoded safety rules
- Medications auto-seeded (5 Rx + 4 supplements)
- Column name resilience across all medication queries
- Health context bug fixes (body_metrics, bp_readings, fasting_logs column names)

### Phase 5: Appointment Prep & Report ✅
- March 13 appointment created for Dr. Chandler
- AI prep generated with questions, changes, flags
- 2-page PDF cardiologist report with @react-pdf/renderer
- Download button on appointment detail view

### Phase 6: Health.md Auto-Updater System ✅
- **Week 1: Core Infrastructure**
  - Created `health_doc_pending_updates` table migration
  - Built `HealthDocUpdater` service class (694 lines)
  - Created `/api/fitness/health/detect-updates` route
- **Week 2: Trigger Implementations**
  - Medication change trigger (POST/PUT/DELETE)
  - Lab upload trigger
  - Metric shift detector with daily cron job
  - Methylation upload trigger
- **Week 3: Content Generation**
  - 7 section generators (§2, §3, §4, §5, §6, §7, §9)
  - Template-based: medications, supplements tables
  - AI-powered: timing protocol, supplements to consider, vital baselines, training constraints, genetic analysis
  - `/api/fitness/health/generate-section` route
- **Week 4: User Approval UI**
  - `HealthDocPendingUpdates` widget component (compact + full list views)
  - Review page at `/fitness/health/review-updates` with side-by-side diff viewer
  - Approve/reject workflow (individual + batch operations)
  - `/api/fitness/health/approve-updates` route
  - Integration with dashboard and health view page
- **Week 5: Polish & Integration**
  - Enhanced version history UI with change logs
  - Revert capability for restoring previous versions
  - Change type badges and summaries
  - Bug fixes and constraint updates
- **Documentation**: Full implementation plan and summary in `docs/health-md-auto-updater-*.md`

### Phase 7: Calendar Module Enhancement ✅
- **Phase 1-4: Calendar Views**
  - Date utilities library with grid generation and workout tag parsing
  - MonthView: 6-week grid, event badges, click-to-day navigation
  - WeekView: 7-day × 24-hour grid with time slots, scrollable container
  - DayView: Timeline with hourly markers, positioned events
- **Phase 5-6: Integration & Filters**
  - View switcher (pill tabs) with month/week/day modes
  - CalendarFilters component with event type, domain, completed, date range
  - Filter state management with active count badge
- **Phase 7-8: Workout Features**
  - ScheduleWorkoutModal with template selection or AI builder
  - Database trigger for auto-sync: planned_workouts ↔ calendar_events
  - Unique constraint on (user_id, alignment_tag) for planned workouts
  - Backfill existing planned workouts to calendar
- **Phase 9-10: Navigation & API**
  - Click-through: Logged workouts → /fitness/history/{id}, Planned → /fitness/plans
  - API routes: POST/PATCH/DELETE /api/fitness/planned-workouts
  - Template auto-copy and workout data hydration
