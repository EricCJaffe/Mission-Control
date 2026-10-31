-- Rollback for 20261031150000_decisions_board_v2.sql.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'mission' and tablename = 'decisions'
  ) then
    alter publication supabase_realtime drop table mission.decisions;
  end if;
end $$;
drop index if exists mission.decisions_user_completed_idx;
alter table mission.decisions drop constraint if exists decisions_section_check;
alter table mission.decisions
  drop column if exists completed_at,
  drop column if exists added_at,
  drop column if exists section;
