# Releases

## Current Release State
- No formal versioning process is documented.
- `main` is the release branch.
- Vercel deploys from GitHub `main`.

## Latest Changes (Rolling)

### March 9, 2026 — Withings OAuth Integration + Health Platform Expansion
- Added Withings OAuth/API integration with encrypted token storage, status, manual sync, disconnect flow, and legacy CSV fallback.
- Added new Withings database tables for connection state and sync logs.
- Added recent-data backfill and incremental sync logic for blood pressure, body composition, sleep, and daily summaries.
- Wired Withings sync into downstream `health.md` update detection through existing health-context and pending-update flows.
- Added hydration module phase 1 and phase 2: targets, logs, reminders, trend visuals, overload/dehydration alerting, AI insights, and health-context integration.
- Added nutrition module phase 1 and phase 2: meal suggestions, logging, search/barcode-style lookup, grocery-list persistence, quiz/gamification, and downstream AI integration.
- Added recovery module for sauna, cold plunge, stretching, and mobility with AI insights and readiness weighting.
- Expanded morning briefing to include hydration, nutrition, recovery, daily learning, scripture, and fitness quote.
- Added health command center persistence, PDF export, follow-up prompting, and richer training-plan intake flow.
- Added training plan detail view, PDF export, progress tracking, and planned-workout scheduling bridge.
- Integrated comprehensive genetics and imaging findings more deeply into `health.md`, appointment prep, and dashboard-level health context.
- Repaired notes schema drift and pinned Turbopack workspace root in `next.config.ts`.
- Refreshed repo documentation to match actual shipped behavior.

### March 6, 2026 — Genetics Dashboard and Fitness Backlog Completion
- Unified genetics processor across six report types.
- Added comprehensive genetics synthesis endpoint and dashboard card.
- Added signed URL PDF viewing for lab and genetics reports.
- Completed supplement stack analysis and interaction checking.
- Added workout photo uploads, post-appointment health update automation, medication timing awareness, and seasonal zone recalibration.

### March 1, 2026 — Initial Methylation Pipeline
- Shipped full methylation upload, extraction, review, analysis storage, and dashboard flow.
- Added persistent `analysis_json` storage and genetics review UI.
- Fixed lab dashboard methylation loading issues.

### February 27-28, 2026 — Calendar and Health Automation
- Rebuilt calendar module with month/week/day views and planned workout scheduling.
- Shipped `health.md` auto-updater with triggers, approval workflow, and version control.
- Added richer metric dashboards, RHR/HRV insight pages, and dashboard UI polish.
