alter table public.dashboard_scores
  add column if not exists spirit_alignment text,
  add column if not exists soul_alignment text,
  add column if not exists body_alignment text,
  add column if not exists spirit_action text,
  add column if not exists soul_action text,
  add column if not exists body_action text;
