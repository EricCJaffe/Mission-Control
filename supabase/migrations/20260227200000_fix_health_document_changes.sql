-- Fix health_document_changes constraint to support auto-update trigger types

-- Drop existing constraint
alter table public.health_document_changes
  drop constraint if exists health_document_changes_change_type_check;

-- Add updated constraint with more change types
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
    'workout_logged'
  ));

-- Add applied_at column to pending_updates if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'health_doc_pending_updates'
    and column_name = 'applied_at'
  ) then
    alter table public.health_doc_pending_updates
      add column applied_at timestamptz;
  end if;
end $$;
