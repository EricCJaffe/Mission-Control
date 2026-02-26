# Tasks

**Last Updated:** February 26, 2026 (Evening)

## 📍 CURRENT STATUS

**Build Status:** ✅ Production build passing
**Deployment Status:** ✅ Ready for Vercel deployment
**Database Status:** ✅ All migrations applied, clean state
**Recent Changes (Feb 26 Evening Session):**
- UI Modernization: Lucide React icons replaced all emoji across 70+ files
- Card style migration: bg-white/70 → bg-white, border-white/80 → border-slate-100
- Dashboard Enhancement: Hero cards with SVG score ring, pill tabs, enhanced metric grid
- Medications: Auto-seeding from health.md data, column name resilience (name/type and medication_name/medication_type)
- Health Context Fixes: Fixed body_metrics column names (resting_hr, hrv_ms, weight_lbs, sleep_duration_min), BP query, fasting_logs safety
- FIT Parser Fixes: Corrected stress extraction (stress_level_value), body battery filter, fallback field sweep
- Cardiologist Report PDF: 2-page report with @react-pdf/renderer (questions, vitals, meds, notes sections)
- Appointment Prep: AI pipeline working end-to-end with Dr. Chandler appointment
- /health redirects to /fitness/health/init

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

## 🔥 OPEN TASKS — Next Session

### Methylation Report Display
- [ ] **Methylation reports uploaded but not visible on lab results page**
  - Upload pipeline works (`/fitness/health/upload` → `processMethylationReport()` → `genetic_markers` table)
  - Issue: Lab results page queries `lab_panels`/`lab_results`, not `genetic_markers`
  - Need: Dedicated genetics/methylation view, or integrate into lab dashboard
  - Files: `src/lib/fitness/methylation-processor.ts`, `src/components/fitness/LabDashboardClient.tsx`
  - Also update health.md Section 9 (Genetic/Methylation) after processing

### Workout Log Button Visibility
- [ ] **No visible "Log Workout" button on fitness pages**
  - Full workout logger exists at `/fitness/log` (template selection, build-on-fly, drag-and-drop, sets, RPE)
  - Issue: After Phase 2 dashboard rewrite, the log button may not be prominent enough
  - Need: Prominent CTA on fitness dashboard, verify logger page loads correctly
  - Files: `src/components/fitness/FitnessDashboardClient.tsx`, `src/app/fitness/log/page.tsx`

---

## ⚡ MEDIUM PRIORITY — Future Work

- [ ] Supplement interaction checker (hardcoded + AI rules)
- [ ] Health.md auto-updater (triggered by lab uploads, med changes, metric shifts)
- [ ] Enhanced morning briefing with medication reminders + fasting status
- [ ] Fasting tracker UI + AI advisor
- [ ] Supplement stack analyzer ("Review My Stack")
- [ ] Garmin OAuth full automation (manual FIT import works)
- [ ] AI plan generation (auto-generate training plans from historical data)

---

## 📋 LOWER PRIORITY

- [ ] Health.md version history UI (diff viewer, revert)
- [ ] Post-appointment notes processor (AI → health.md updates)
- [ ] Medication timing awareness in workout logger
- [ ] Session photos (Supabase Storage)
- [ ] Seasonal zone recalibration
- [ ] 1RM progression charts

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
