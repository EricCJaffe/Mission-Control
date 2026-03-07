-- Normalize health_document_changes across legacy schemas and newer trigger flows

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'health_document_changes'
      and column_name = 'health_doc_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'health_document_changes'
      and column_name = 'document_id'
  ) then
    alter table public.health_document_changes
      rename column health_doc_id to document_id;
  end if;
end $$;

alter table public.health_document_changes
  add column if not exists change_type text,
  add column if not exists changed_by text,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'health_document_changes'
      and column_name = 'change_trigger'
  ) then
    update public.health_document_changes
    set change_type = coalesce(
      nullif(change_type, ''),
      case
        when change_trigger in ('manual_edit') then 'manual_edit'
        when change_trigger in ('ai_recommendation', 'ai_update') then 'ai_update'
        when change_trigger in ('appointment_notes', 'appointment_prep') then 'appointment_prep'
        when change_trigger in ('lab_upload', 'methylation_upload', 'metric_shift', 'medication_change', 'bp_reading', 'workout_logged', 'imaging_upload', 'genetics_comprehensive') then change_trigger
        else 'auto_update'
      end,
      'auto_update'
    )
    where change_type is null
       or change_type = '';
  else
    update public.health_document_changes
    set change_type = coalesce(nullif(change_type, ''), 'auto_update')
    where change_type is null
       or change_type = '';
  end if;
end $$;

update public.health_document_changes
set changed_by = case
  when changed_by in ('user', 'ai', 'system') then changed_by
  else 'system'
end;

alter table public.health_document_changes
  alter column change_type set not null,
  alter column changed_by set not null;

alter table public.health_document_changes
  drop constraint if exists health_document_changes_change_type_check;

alter table public.health_document_changes
  add constraint health_document_changes_change_type_check
  check (change_type in (
    'manual_edit',
    'ai_update',
    'auto_update',
    'medication_change',
    'lab_upload',
    'metric_shift',
    'methylation_upload',
    'appointment_prep',
    'bp_reading',
    'workout_logged',
    'imaging_upload',
    'genetics_comprehensive'
  ));

alter table public.health_document_changes
  drop constraint if exists health_document_changes_changed_by_check;

alter table public.health_document_changes
  add constraint health_document_changes_changed_by_check
  check (changed_by in ('user', 'ai', 'system'));

create index if not exists health_document_changes_user_created_idx
  on public.health_document_changes(user_id, created_at desc);

create index if not exists health_document_changes_document_created_idx
  on public.health_document_changes(document_id, created_at desc);
