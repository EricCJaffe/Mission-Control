-- Decisions inbox, round three: the needs-Eric loops on /decisions.
-- Eric, 2026-10-31 8:21 AM: "Make sure there are comment fields where I can
-- share with u. And that I learn from what I share." and "There should never
-- be 55 decisions waiting and that much stalled that's insane."
--
-- 1. kind gains 'loop': a row of the brain's open/triage-open.tsv owed by
--    Eric (who-owes contains "eric"), keyed loop:<sha256(ref or note)[:40]>,
--    the same key jobs/lib/loops-ask.py uses. Widening a CHECK is safe for
--    existing rows.
-- 2. group_name: the section a loop is shown under (Drafts to send, Eden,
--    HL scope, HL vendor/hardware, Records, Misc). Written by the box script.
-- No grant or policy changes.

alter table mission.decisions drop constraint if exists decisions_kind_check;
alter table mission.decisions
  add constraint decisions_kind_check check (kind in ('decision', 'stalled', 'loop'));

alter table mission.decisions add column if not exists group_name text;
