alter table public.prayer_logs
  add column if not exists kind text not null default 'prayed'
    check (kind in ('prayed', 'note')),
  add column if not exists updated_at timestamptz not null default now();

comment on column public.prayer_logs.kind is
  'prayed = the checkmark, advances the rotation. note = a dated reflection, leaves the rotation untouched.';

create index if not exists prayer_logs_request_kind_idx
  on public.prayer_logs (request_id, kind, prayed_at desc);
