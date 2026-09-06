-- When each practice actually comes due.
--
-- Cadence already said daily / weekly / monthly, but the dashboard showed
-- every practice every day regardless, so Church sat unticked on a Tuesday and
-- Giving sat unticked for twenty-nine days a month. A checklist that is mostly
-- un-completable on any given day trains you to ignore it.
--
-- due_weekday pins a weekly practice to a day (0 = Sunday), due_day_of_month
-- pins a monthly one. Null means "any day in the period", which stays right
-- for something like a weekly fast with no fixed day.

alter table public.practices
  add column if not exists due_weekday smallint check (due_weekday between 0 and 6),
  add column if not exists due_day_of_month smallint check (due_day_of_month between 1 and 28);

comment on column public.practices.due_weekday is
  '0=Sunday..6=Saturday. Weekly practices surface only on this day. Null = any day that week.';
comment on column public.practices.due_day_of_month is
  'Monthly practices surface only on this day. Capped at 28 so it exists in every month.';

update public.practices set due_weekday = 0 where key = 'church';
update public.practices set due_day_of_month = 1 where key = 'giving';
update public.practices set active = false where key = 'small_group';
