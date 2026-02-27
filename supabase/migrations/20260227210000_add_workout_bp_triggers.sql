-- Add workout_logged and bp_reading trigger types to health_doc_pending_updates

-- Drop existing constraint
alter table public.health_doc_pending_updates
  drop constraint if exists health_doc_pending_updates_trigger_type_check;

-- Add updated constraint with new trigger types
alter table public.health_doc_pending_updates
  add constraint health_doc_pending_updates_trigger_type_check
  check (trigger_type in (
    'medication_change',
    'lab_upload',
    'metric_shift',
    'methylation_upload',
    'appointment_notes',
    'manual_edit',
    'ai_recommendation',
    'bp_reading',
    'workout_logged'
  ));
