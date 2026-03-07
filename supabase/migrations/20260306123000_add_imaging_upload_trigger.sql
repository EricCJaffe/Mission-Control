alter table public.health_doc_pending_updates
  drop constraint if exists health_doc_pending_updates_trigger_type_check;

alter table public.health_doc_pending_updates
  add constraint health_doc_pending_updates_trigger_type_check
  check (trigger_type in (
    'medication_change',
    'lab_upload',
    'metric_shift',
    'methylation_upload',
    'imaging_upload',
    'appointment_notes',
    'manual_edit',
    'ai_recommendation',
    'workout_logged',
    'bp_reading'
  ));
