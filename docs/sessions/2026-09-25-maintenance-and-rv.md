# Handoff — Maintenance and RV modules (2026-09-24/25)

For the next session. Everything below is merged and live at
https://missioncontrol.bibleos.app unless it says otherwise.

## Shipped
- **/maintenance** (PR #21): inventory, best-practice recurring schedules
  (each one a task in the "Home & Equipment Maintenance" project), service log
  written by a trigger on `mission.tasks`, calendar projection, Open Issues.
- **/rv** (PR #22): trip planner, Pre-Trip / Arrival / Departure checklists
  with server-side runs, guides, rig summary. Maintenance for the coach,
  generator and Jeep lives in /maintenance; /rv only displays it.
- **Middleware** (PR #23): /maintenance, /rv, /ideas, /brain now require login.
- **Departure Tow/Haul step + guide** (PR #24, merged with this file).

## ⚠️ Things that will bite
- **The repo is PUBLIC.** The RV handoff pack (VINs, plate, ferry password,
  card last-4, friends' addresses) is in the database only. Never commit it.
  It is seeded by `scripts/rv/seed-pack.mts <bundle>/docs`; the last bundle
  used was `~/.cache/rvpack2/rv-handoff/` on ubuntu-dev (local, not backed up —
  the database is the source of truth now).
- **Vercel missed the production build for PR #22's merge.** No status ever
  appeared on the merge commit; a production deploy was created by hand via the
  Vercel API. After merging, check the commit status and do the same if needed.
- `db push` does not work from this repo (see CLAUDE.md). Migrations are
  applied via MCP `apply_migration` and filed under the ledger version.

## Open, owned by Eric
- Generator (Onan QG 4000): faults 45 → 36 → 26. Plan in the Maintenance
  issue: fresh fuel + Sea Foam, prime, 2–3 starts max, else dealer (warranty;
  the coach sat ~1 year before purchase).
- Nantucket ferry return: call 508-495-3278 to move it to Sun Oct 18 (red item
  on the fall trip until he taps Fixed).
- Upload the Gmail-only attachments (5934153.PDF, 15284985.jpg,
  jaffe.eric.pdf) and Mary Jo's itinerary on the trip's Documents tab.
- Enter the coach odometer in Maintenance so mileage schedules count.
- Starlink Mini: ladder quick-release mount recommended (Amazon B0DQXK7ZY8).

## Open, for a session
- Hours/miles-due maintenance items show on /maintenance but not in the weekly
  brief (the brief reads task due dates only).
- Confirmations are in the owner-only storage folder; Mary Jo can read trips
  (household RLS) but cannot open them.
- A Notion MCP connector was added 2026-09-25; the session had to restart to
  see it.
