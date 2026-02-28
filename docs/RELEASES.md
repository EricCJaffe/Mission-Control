# Releases

## Current Process
- No release process documented in this repo.

## Upcoming (Plan)
- Feature Set 1: Home dashboard with Priority Matrix, Today view, Alignment banner.
- Feature Set 2: Tasks v2 (categories, recurrence, "why").
- Feature Set 3: Calendar module (recurring events + links).
- Feature Set 4: Monthly Review + Survey + scoring + archive.
- Feature Set 5: Metrics dashboard (minimal, non-vanity).

## Latest Changes (Rolling)

### Feb 28, 2026 (Evening) — Methylation Report Processing (BLOCKED - In Progress)
- **⚠️ Status**: Upload and extraction working, database insert blocked by PostgREST schema cache
- **PDF Processing**: Updated to use unpdf library (mirroring working lab processor)
  - Text extraction: ✅ Working (45K characters from 4.3MB PDF)
  - OpenAI SNP extraction: ✅ Working (8-9 genetic markers with full data)
  - Data mapping: ✅ Correct schema (snp_id, gene, genotype, risk_level, clinical_significance)
- **Database Insert**: ❌ BLOCKED by PostgREST schema cache issue
  - Error: PGRST204 "Could not find the 'risk_level' column in the schema cache"
  - Column exists in DB (confirmed via psql query)
  - Schema cache persists across multiple full Supabase restarts
  - Even custom RPC functions blocked by cache (PGRST202)
- **Troubleshooting Attempted**:
  - Multiple Supabase restarts, SIGHUP to PostgREST, dev server restarts
  - Created `insert_genetic_markers()` Postgres function to bypass PostgREST
  - All approaches blocked by schema cache
- **Files Modified**:
  - `src/lib/fitness/methylation-processor.ts` - Updated to unpdf + RPC
  - `src/app/api/fitness/health/methylation/route.ts` - Fixed column names
  - `src/components/fitness/LabDashboardClient.tsx` - Display updates
  - Created `docs/METHYLATION_BUG.md` - Full troubleshooting documentation
- **Next Steps**: Reset database, check migration order, consider direct Postgres connection

### Feb 28, 2026 (Morning) — Fitness Dashboard UI Polish + Metric Insights (Enhancement)
- **Metric Cards with Color Theming**: Added visual variety to fitness dashboard
  - Resting HR: Red theme with clickable card to detailed trends
  - HRV: Purple theme with clickable card to detailed trends
  - Sleep: Indigo theme showing last night + 7-day averages
  - Weight: Green theme with link to trends
  - Form/TSB: Dynamic colors based on status (fresh=blue, optimal=green, etc.)
- **RHR & HRV Detail Pages**: New trend pages at /fitness/metrics/rhr and /fitness/metrics/hrv
  - 90-day trend charts with reference lines (Recharts)
  - Stats cards: current 7-day avg, 90-day avg, range, trend direction
  - AI insights system with persistent storage and refresh capability
  - Educational info about cardiac metrics
  - API routes: POST /api/fitness/insights/rhr and /api/fitness/insights/hrv
- **Enhanced Sleep Card**: Improved data display
  - Shows last night's hours (large) + 7-day average (small)
  - Shows last night's score + 7-day average score
  - Queries 7 days of sleep_logs for averaging
  - Removed redundant "Sleep Score" metric card
- **Merged Weight & Body Comp**: Combined duplicate cards into single weight card
  - Links to /fitness/trends for detailed tracking
  - Removed standalone "Body Composition" card
- **Trends Page Consolidation**: Redirected /fitness/metrics/trends to /fitness/trends
  - Eliminated duplicate trends pages
  - Updated all trend links throughout the app
- **Colorful Sidebar Icons**: Added color variety to navigation
  - Core: Dashboard (blue), Projects (indigo), Tasks (green), Calendar (orange), Metrics (purple), Fitness (red), Books (amber), Sermons (pink)
  - Planning: Goals (cyan), Reviews (teal), Templates (sky)
  - Knowledge: Notes (yellow), Persona/Soul (violet), SOPs (rose)
- **Turbopack Corruption Recovery**: Fixed dev server crash recovery workflow
  - Documented issue: Heap out of memory → corrupted .next cache
  - Solution: Kill server, rm -rf .next, remove lock file, restart
  - Added to troubleshooting knowledge base
- **Methylation Report Display Fix**: Genetic markers now visible on lab results page
  - Issue: Reports uploaded successfully but methylation tab showed "No reports"
  - Root cause: Tab queried health.md document instead of genetic_markers table
  - Solution: Created `/api/fitness/health/methylation` route to fetch from genetic_markers
  - Display: File header, AI analysis (supplements/lifestyle/cardiac), SNP table by gene
  - Each marker shows: variant, rsID, genotype, status, color-coded by impact
  - Files: New API route (77 lines), updated LabDashboardClient.tsx methylation section

### Feb 27, 2026 — Calendar Enhancement + Health.md Auto-Updater (Major)
- **Calendar Module Overhaul**: Transformed from simple day-view list into full-featured planning tool
  - Three calendar views: Month grid (6 weeks), Week grid (7 days × 24 hours), Day timeline
  - Pill-tab view switcher with smooth transitions between month/week/day modes
  - Advanced filters: Event type (8 types), domain (4 domains), show/hide completed, date range picker
  - "Schedule Workout" modal with template selection or AI builder integration
  - Database trigger: Auto-sync planned_workouts ↔ calendar_events (create/update/delete)
  - Click-through navigation: Calendar → workout history/plans → exercise details
  - API routes: POST/PATCH/DELETE /api/fitness/planned-workouts with template auto-copy
  - Components: MonthView, WeekView, DayView, CalendarFilters, ScheduleWorkoutModal
  - Library: date-utils.ts with grid generation, workout tag parsing, filter utilities
  - Migration: 20260228000000_calendar_workout_sync.sql (triggers, unique constraint, backfill)
- **Health.md Auto-Updater System**: Comprehensive 5-week implementation for living health document
  - Trigger detection: medication_change, lab_upload, metric_shift (daily cron), methylation_upload
  - 7 of 12 sections support automated generation (§2, §3, §4, §5, §6, §7, §9)
  - User approval workflow with side-by-side diff viewer and batch operations
  - Version control with change logs and revert capability
  - Dashboard widget showing pending update count with compact/full list views
  - Review page at /fitness/health/review-updates with approve/reject workflow
  - HealthDocUpdater service class (694 lines) with template-based + AI-powered generators
  - Docs: health-md-auto-updater-plan.md, health-md-auto-updater-summary.md

### Feb 26, 2026 — Vitality Evolution + Cardiologist Report (Major)
- **UI Modernization**: Lucide React icons replaced all emoji across 70+ files, card style migrated to solid white + border-slate-100
- **Dashboard Enhancement**: Hero cards with SVG readiness score ring, pill tab navigation, enhanced 2x3 metric grid
- **Health Intelligence**: health.md initialized, buildAISystemPrompt() fixed (correct DB column names for body_metrics, bp_readings, medications)
- **Medications**: Auto-seed from health.md data on page load, column name resilience for both DB schema variants
- **FIT Parser Fixes**: Corrected stress extraction (stress_level_value not field_two), body battery filter allows 0, fallback field sweep for top-level objects, hasData guard uses != null, DB upsert uses ?? null
- **Cardiologist Report PDF**: 2-page PDF with @react-pdf/renderer — flags, vitals, changes table, prioritized questions, prescriptions, supplements, handwritten notes areas
- **Appointment Prep**: Full AI pipeline — generates 5-8 questions, changes summary, flags via buildAISystemPrompt('appointment_prep'). Tested with Dr. Chandler March 13 appointment.
- **Infrastructure**: /health redirects to /fitness/health/init, error handling improved across appointment prep flow

### Feb 25, 2026 — Fitness Module (Major)
- **Workout Logger**: Block-based architecture, strength + cardio + hybrid, superset/circuit grouping, 6 set types, RPE per set, rest timer, plate calculator, elapsed workout timer, auto-fill duration
- **Fitness Dashboard**: Readiness + strain widgets, safety alerts, quick links, today's plan
- **Exercise Library**: 52 default exercises with seed button, CRUD for custom exercises
- **Workout Templates**: CRUD with structured exercise ordering
- **Training Plans**: Creation form with CRUD API, status management
- **Blood Pressure**: Entry form with AHA auto-flagging, trend chart, date range filter
- **Body Metrics**: Weight, sleep, stress, medication timing entry
- **Equipment Tracker**: CRUD with mileage tracking
- **Personal Records**: Auto-detection on save, dedicated page
- **Workout History**: Browse past workouts, repeat-workout feature
- **Morning Briefing**: AI-powered readiness + recommendations
- **Lab Results**: Text input with AI analysis
- **Athlete Settings**: Cardiac settings, FTP, baselines
- **Appointments + Medications**: CRUD pages for medical tracking
- **Intelligence Layer**: TSS, PMC, compliance, AI builder, safety alerts, readiness scoring, strain scoring, cardiac efficiency, est. 1RM, power zones, sleep debt, TDEE, recovery predictor
- **Database**: Full migration written (16 tables, RLS, indexes) — **not yet applied**

### Earlier
- Inline review queue supports select/apply/reject.
- Research notes include status (inbox/in progress/review) and badges.
- Concept placement is insert-only and produces proposals.
- Sermon Builder module with series editor and AI conversions.
- Book Writer AI with artifact generation.
