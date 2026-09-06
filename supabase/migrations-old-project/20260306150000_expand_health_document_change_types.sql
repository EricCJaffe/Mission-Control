-- Expand health_document_changes allowed change types for newer trigger flows

ALTER TABLE public.health_document_changes
  DROP CONSTRAINT IF EXISTS health_document_changes_change_type_check;

ALTER TABLE public.health_document_changes
  ADD CONSTRAINT health_document_changes_change_type_check
  CHECK (change_type IN (
    'manual_edit',
    'ai_update',
    'auto_update',
    'medication_change',
    'lab_upload',
    'metric_shift',
    'methylation_upload',
    'genetics_comprehensive',
    'imaging_upload',
    'appointment_prep',
    'bp_reading',
    'workout_logged'
  ));
