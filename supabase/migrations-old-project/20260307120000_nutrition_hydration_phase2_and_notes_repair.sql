alter table public.hydration_targets
  add column if not exists reminder_time time,
  add column if not exists reminder_message text;

alter table public.notes
  add column if not exists status text default 'inbox';

create index if not exists notes_status_idx on public.notes(status);

create table if not exists public.nutrition_food_reference (
  id uuid primary key default gen_random_uuid(),
  barcode text unique,
  name text not null,
  brand text,
  serving_size text,
  calories integer,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fat_g numeric(6,1),
  fiber_g numeric(6,1),
  sodium_mg integer,
  potassium_mg integer,
  phosphorus_mg integer,
  saturated_fat_g numeric(6,1),
  tags text[] not null default array[]::text[],
  source text not null default 'seed',
  created_at timestamptz not null default now()
);

create index if not exists nutrition_food_reference_name_idx on public.nutrition_food_reference using gin (to_tsvector('english', name));
create index if not exists nutrition_food_reference_barcode_idx on public.nutrition_food_reference(barcode);
alter table public.nutrition_food_reference enable row level security;
drop policy if exists nutrition_food_reference_readable on public.nutrition_food_reference;
create policy nutrition_food_reference_readable on public.nutrition_food_reference
  for select using (true);

create table if not exists public.nutrition_grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  goal text,
  items jsonb not null default '[]'::jsonb,
  source text not null default 'ai_suggestions',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_grocery_lists_user_idx on public.nutrition_grocery_lists(user_id, created_at desc);
alter table public.nutrition_grocery_lists enable row level security;
drop policy if exists nutrition_grocery_lists_owner on public.nutrition_grocery_lists;
create policy nutrition_grocery_lists_owner on public.nutrition_grocery_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.nutrition_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  questions jsonb not null default '[]'::jsonb,
  score integer,
  total integer,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_quiz_attempts_user_idx on public.nutrition_quiz_attempts(user_id, created_at desc);
alter table public.nutrition_quiz_attempts enable row level security;
drop policy if exists nutrition_quiz_attempts_owner on public.nutrition_quiz_attempts;
create policy nutrition_quiz_attempts_owner on public.nutrition_quiz_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.nutrition_food_reference (barcode, name, brand, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, potassium_mg, phosphorus_mg, saturated_fat_g, tags, source)
values
  ('850000000001', 'Plain Greek Yogurt', 'Generic', '170 g', 120, 17, 6, 4, 0, 60, 240, 180, 2.5, array['protein','breakfast'], 'seed'),
  ('850000000002', 'Low Sodium Cottage Cheese', 'Generic', '113 g', 90, 13, 4, 2, 0, 320, 120, 140, 1.0, array['protein','snack'], 'seed'),
  ('850000000003', 'Rolled Oats', 'Generic', '1/2 cup dry', 150, 5, 27, 3, 4, 0, 150, 130, 0.5, array['fiber','breakfast'], 'seed'),
  ('850000000004', 'Blueberries', 'Generic', '1 cup', 85, 1, 21, 0, 4, 1, 114, 18, 0, array['fruit','fiber'], 'seed'),
  ('850000000005', 'Salmon Fillet', 'Generic', '5 oz', 280, 34, 0, 16, 0, 90, 600, 300, 3.5, array['omega3','dinner'], 'seed'),
  ('850000000006', 'Mixed Greens', 'Generic', '2 cups', 20, 2, 4, 0, 2, 30, 160, 40, 0, array['vegetable','lunch'], 'seed'),
  ('850000000007', 'Brown Rice', 'Generic', '1 cup cooked', 216, 5, 45, 2, 4, 10, 150, 150, 0.5, array['carb','dinner'], 'seed'),
  ('850000000008', 'Protein Shake', 'Generic', '1 bottle', 160, 30, 7, 3, 1, 180, 250, 170, 1.0, array['protein','drink'], 'seed')
on conflict (barcode) do nothing;
