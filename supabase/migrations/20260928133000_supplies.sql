-- Supplies: the consumables and small parts maintenance runs on, and the
-- shopping list that keeps them in stock.
--
-- Eric, 2026-09-28: "an inventory of items that we need for maintenance —
-- bug spray, weed killer, cleaning products, garbage bags, parts, small parts
-- for very small engines, small amounts of oil, gas ... when creating a
-- maintenance request ... a running list, a grocery list for lack of a better
-- term ... divided by where to buy it from."
--
-- THREE WAYS SOMETHING LANDS ON THE LIST, SO NOBODY HAS TO REMEMBER
--
--   1. It is below its "keep at least" level.   (computed, never stored)
--   2. Someone flagged it: Eric, or a helper who used the last of it.  (need)
--   3. An open job needs more of it than is on the shelf.  (supply_needs)
--
-- The list is derived from those three on every read (src/lib/supplies.ts),
-- not kept as its own table: a stored list would need its own upkeep, and
-- within a week it would disagree with the shelf.
--
-- The loop closes itself: finishing a job that uses supplies takes them off
-- the shelf (the trigger below), which is what puts them back on the list.
-- Buying one puts it back on the shelf. The only step a person does is the
-- shopping.
--
-- Every statement is schema-qualified: `tasks` exists in `public` too.

create table if not exists mission.supplies (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  name           text not null,
  -- The shelf it lives on. The list is in src/lib/supplies.ts; the check
  -- keeps a typo out of the table.
  category       text not null default 'other',
  -- Where to buy it: "Tractor Supply", "Home Depot", "Amazon". Free text on
  -- purpose; the shopping list groups on it, case-insensitively.
  store          text,
  -- What a count means: bottles, gallons, bags, each.
  unit           text,

  on_hand        numeric not null default 0,
  -- The "keep at least" level. Null means "buy when flagged", which suits a
  -- spark plug nobody wants three of.
  keep_min       numeric,

  -- Flagged for the list regardless of the count: "we're out", or "the one
  -- we have is the wrong size". Cleared when it is bought.
  need           boolean not null default false,
  need_note      text,

  -- The thing you want in the store aisle: "Champion RJ19LM", "SAE 30".
  part_number    text,
  -- The machine it fits, when it only fits one.
  asset_id       uuid references mission.maintenance_assets(id) on delete set null,
  notes          text,

  last_bought_on date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint supplies_category_check check (category in (
    'cleaning', 'pest_lawn', 'fuel_oil', 'engine_parts', 'hardware',
    'household', 'other'
  )),
  constraint supplies_on_hand_check check (on_hand >= 0),
  constraint supplies_keep_min_check check (keep_min is null or keep_min >= 0)
);

create unique index if not exists supplies_owner_name_idx
  on mission.supplies (user_id, lower(name)) where active;
create index if not exists supplies_owner_idx on mission.supplies (user_id, category);

-- What a job needs from the shelf. Keyed on the task, so it works for a
-- maintenance schedule and for a one-off helper job alike: both are tasks.
create table if not exists mission.supply_needs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  task_id    uuid not null references mission.tasks(id) on delete cascade,
  supply_id  uuid not null references mission.supplies(id) on delete cascade,
  qty        numeric not null default 1,
  created_at timestamptz not null default now(),
  constraint supply_needs_qty_check check (qty > 0),
  constraint supply_needs_one_per_task unique (task_id, supply_id)
);

create index if not exists supply_needs_supply_idx on mission.supply_needs (supply_id);
create index if not exists supply_needs_owner_idx on mission.supply_needs (user_id);

alter table mission.supplies     enable row level security;
alter table mission.supply_needs enable row level security;

-- Owner-only, like the rest of the schema. Helpers reach these only through
-- server code with the service role, filtered to their owner.
drop policy if exists supplies_owner on mission.supplies;
create policy supplies_owner on mission.supplies
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists supply_needs_owner on mission.supply_needs;
create policy supply_needs_owner on mission.supply_needs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Finishing a job uses its supplies. Wherever it was ticked.
--
-- The same signal as maintenance_log_completion: a recurring task rolls
-- forward (last_completed_at moves), a one-off reaches `done`. A trigger for
-- the same reason too: a job is completed from /tasks, /maintenance, the
-- dashboard and a helper's phone, and only the database sees all of them.
--
-- Floors at zero rather than failing: a count that was already wrong must not
-- stop a job being marked done. Zero is below any keep_min, so the item lands
-- on the list, which is the right outcome for a count nobody trusts.
-- ---------------------------------------------------------------------------
create or replace function mission.supplies_use_on_completion()
returns trigger
language plpgsql
set search_path = mission, pg_catalog
as $$
begin
  if not (
    new.last_completed_at is distinct from old.last_completed_at
    or (new.status = 'done' and old.status is distinct from 'done')
  ) then
    return new;
  end if;

  update mission.supplies s
     set on_hand = greatest(s.on_hand - n.qty, 0),
         updated_at = now()
    from mission.supply_needs n
   where n.task_id = new.id
     and n.supply_id = s.id
     and s.user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists supplies_use_on_completion on mission.tasks;
create trigger supplies_use_on_completion
  after update of status, last_completed_at on mission.tasks
  for each row execute function mission.supplies_use_on_completion();

notify pgrst, 'reload schema';
