-- Concurrent training plans, scoped by discipline.
--
-- Strength and cardio are trained in parallel, not in sequence, and a
-- jiu-jitsu block will make it three. The app previously assumed a single
-- active plan — /fitness/plans rendered only the first one it found — which
-- made a second concurrent block invisible rather than merely unsupported.
--
-- One ACTIVE plan per discipline is the constraint that actually matters:
-- two concurrent strength blocks is a mistake, strength alongside cardio is
-- the normal case.

alter table public.training_plans
  add column if not exists discipline text not null default 'general';

alter table public.training_plans drop constraint if exists training_plans_discipline_check;
alter table public.training_plans
  add constraint training_plans_discipline_check
  check (discipline in ('strength', 'cardio', 'martial_arts', 'mobility', 'general'));

-- Backfill from the existing plan_type / name before the index goes on.
update public.training_plans
set discipline = case
  when plan_type in ('running', 'endurance') then 'cardio'
  when name ilike '%strength%' then 'strength'
  else 'general'
end
where discipline = 'general';

-- Only one active plan per discipline. Drafts, completed and archived plans
-- are unconstrained, so history and future blocks accumulate freely.
create unique index if not exists training_plans_one_active_per_discipline
  on public.training_plans (user_id, discipline)
  where status = 'active';
