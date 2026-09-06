-- Health Document Pending Updates Table
-- Stores proposed health.md section updates awaiting user approval

create table if not exists public.health_doc_pending_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Section identification
  section_number integer not null,
  section_name text not null,

  -- Content
  current_content text not null,
  proposed_content text not null,
  diff_html text, -- HTML formatted diff for display

  -- Trigger context
  trigger_type text not null check (trigger_type in (
    'medication_change',
    'lab_upload',
    'metric_shift',
    'methylation_upload',
    'appointment_notes',
    'manual_edit',
    'ai_recommendation'
  )),
  trigger_data jsonb, -- Context about what triggered the update
  reason text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),

  -- Workflow
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by text, -- 'user' or 'auto'
  applied_at timestamptz,

  -- Metadata
  batch_id uuid, -- Group related updates for batch approval
  priority integer default 0 -- Higher = more urgent
);

-- Indexes
create index health_doc_pending_updates_user_status_idx
  on public.health_doc_pending_updates(user_id, status);

create index health_doc_pending_updates_batch_idx
  on public.health_doc_pending_updates(batch_id) where batch_id is not null;

create index health_doc_pending_updates_created_idx
  on public.health_doc_pending_updates(user_id, created_at desc);

-- RLS
alter table public.health_doc_pending_updates enable row level security;

create policy "health_doc_pending_updates_owner" on public.health_doc_pending_updates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Comments
comment on table public.health_doc_pending_updates is 'Proposed health.md updates awaiting user approval';
comment on column public.health_doc_pending_updates.trigger_type is 'What triggered this update (medication change, lab upload, etc.)';
comment on column public.health_doc_pending_updates.trigger_data is 'Additional context about the trigger (medication ID, lab panel ID, etc.)';
comment on column public.health_doc_pending_updates.confidence is 'AI confidence in proposed change (high/medium/low)';
comment on column public.health_doc_pending_updates.batch_id is 'Groups related updates for batch approval';
