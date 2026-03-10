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
- [ ] Garmin OAuth full automation
  - CSV and FIT import flows work today.
  - Garmin OAuth/live sync is still not implemented.

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
