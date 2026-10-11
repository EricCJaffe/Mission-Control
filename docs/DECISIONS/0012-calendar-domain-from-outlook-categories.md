# 0012 Calendar domain comes from Outlook categories

## Date
2026-10-11

## Status
Accepted. Eric approved the migration on 2026-10-11 at 9:09 AM ET. It was applied at 10:36 AM ET as ledger version `20261011143629`, before the code merged.

## Context

Every synced Outlook event was stored as `work`. Time Eric had tagged Family in Outlook counted as Impact. All-day and multi-day events were charged, in full, to the week of their start date, so a 20-day RV trip (about 480 hours) landed in a single week.

The sync already refused to overwrite `domain` on update, because a reassignment in the UI had to survive the next run. That also meant a category change could never correct the original `work`.

## Decision

- The first recognised Outlook category maps to a domain (`OUTLOOK_CATEGORY_DOMAINS` in `scripts/sync/lib/eventDomain.ts`). Unrecognised categories fall through to the existing title rules, then to `work`.
- The sync overwrites a domain only when `domain_origin` is `sync`. `hand` and unknown origin are left alone. The update route marks a posted domain as `hand`.
- Scheduled hours are the overlap with the period. All-day and multi-day events count 12 hours per overlapped day (`ALL_DAY_HOURS`).
- The weekly Family review derives those hours. A number typed on the review replaces them for that period. RV trip days count as family unless a day-rated family calendar event already covers them.

## Consequences

- Until `20261011143629_calendar_domain_origin_and_family_review.sql` is applied, new events get the right domain and existing rows are not reclassified. After it is applied, the next sync may correct rows that are still the old hard-coded `work`.
- The Family review reads the calendar even while that area's stored source is still `manual`.

## Links

- `scripts/sync/lib/eventDomain.ts`
- `src/lib/calendar/hours.ts`
- `supabase/migrations/20261011143629_calendar_domain_origin_and_family_review.sql`
