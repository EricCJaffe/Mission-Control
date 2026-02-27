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
