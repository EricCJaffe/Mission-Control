# Tasks

**Last Updated:** March 9, 2026

## Current Status
- Build Status: ✅ Production build passing
- Deployment Status: ✅ Vercel-linked and deployable
- Database Status: ✅ Remote migrations aligned
- Docs Status: ✅ Refreshed to match shipped state

## Recently Shipped
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

## Open Product Tasks
### High Priority
- [ ] Garmin OAuth full automation
  - Manual import flows work today.
  - OAuth/live sync is still not implemented.

### Medium Priority
- [ ] Email notifications for pending `health.md` updates
  - Health update detection, review, and approval exist.
  - Outbound notification delivery still needs to be added.

## Operational Notes
- `.claude/` stays local-only and untracked.
- The stale checkout under `/Users/ericjaffe/Documents/Digital Missions Project` is not the active synced repo.
- Active repo for ongoing work is `~/Mission-Control`.
