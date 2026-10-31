-- /decisions board v2: four sections, date added + age, live updates.
-- Eric, 2026-10-31 9:24 AM: "the board needs to show the date the item is
-- added and age... Can the board be updated in real time so that I can keep
-- it open on my desktop and refresh and add a finished section... Ideally the
-- coding in the page stays solid but the entries change based on sql table
-- updates."
--
-- mission.decisions stays the one table behind the board. Additive only:
--   section       decision | stalled | waiting: where an open row shows
--                 (Decisions needed / Stalled, ours 3+ days / Waiting on
--                 others). Completed is derived: answered, or closed with
--                 completed_at, in the last 7 days.
--   added_at      when the item first appeared (a loop's first_seen, a
--                 note's date), for "Oct 27 · 4d" on every card
--   completed_at  when a loop or note was closed somewhere other than the
--                 page (triage-closed.tsv, note status); answered rows use
--                 answered_at
-- Written by the box script only; no grant changes.
--
-- Realtime: mission.decisions joins the supabase_realtime publication so an
-- open board refreshes on any row change. RLS still applies to what each
-- subscriber receives (select own rows only).

alter table mission.decisions
  add column if not exists section text,
  add column if not exists added_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table mission.decisions drop constraint if exists decisions_section_check;
alter table mission.decisions
  add constraint decisions_section_check check (section is null or section in ('decision', 'stalled', 'waiting'));

create index if not exists decisions_user_completed_idx on mission.decisions (user_id, completed_at desc)
  where completed_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'mission' and tablename = 'decisions'
  ) then
    alter publication supabase_realtime add table mission.decisions;
  end if;
end $$;
