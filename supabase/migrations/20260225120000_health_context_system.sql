-- ============================================================
-- HEALTH CONTEXT SYSTEM — Complete medical intelligence
-- AI-powered health.md, lab processing, medications, appointments
-- ============================================================

-- ============================================================
-- HEALTH DOCUMENTS (living health.md with vector embeddings)
-- ============================================================
create table if not exists public.health_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  content text not null,
  embedding vector(1536),
  is_current boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists health_documents_user_id_idx on public.health_documents(user_id);
create index if not exists health_documents_current_idx on public.health_documents(user_id, is_current) where is_current = true;

alter table public.health_documents enable row level security;

create policy "health_documents_owner" on public.health_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- HEALTH DOCUMENT CHANGES (audit trail for health.md updates)
-- ============================================================
create table if not exists public.health_document_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.health_documents(id) on delete cascade,
  change_type text not null check (change_type in ('manual_edit','ai_update','lab_import','med_change','appointment_prep')),
  change_summary text not null,
  changed_by text not null check (changed_by in ('user','ai','system')),
  created_at timestamptz default now()
);

create index if not exists health_document_changes_user_id_idx on public.health_document_changes(user_id);
create index if not exists health_document_changes_document_id_idx on public.health_document_changes(document_id);

alter table public.health_document_changes enable row level security;

create policy "health_document_changes_owner" on public.health_document_changes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- HEALTH FILE UPLOADS (PDF uploads with processing status)
-- ============================================================
create table if not exists public.health_file_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null check (file_type in ('lab_report','methylation_report','doctor_notes','imaging','other')),
  processing_status text not null default 'pending' check (processing_status in ('pending','processing','completed','needs_review','failed')),
  error_message text,
  uploaded_at timestamptz default now(),
  processed_at timestamptz
);

create index if not exists health_file_uploads_user_id_idx on public.health_file_uploads(user_id);
create index if not exists health_file_uploads_status_idx on public.health_file_uploads(user_id, processing_status);

alter table public.health_file_uploads enable row level security;

create policy "health_file_uploads_owner" on public.health_file_uploads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- LAB PANELS (bloodwork panels with metadata)
-- ============================================================
create table if not exists public.lab_panels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.health_file_uploads(id) on delete set null,
  lab_name text not null,
  panel_date date not null,
  provider_name text,
  fasting boolean default false,
  status text not null default 'needs_review' check (status in ('needs_review','confirmed','archived')),
  ai_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lab_panels_user_id_idx on public.lab_panels(user_id);
create index if not exists lab_panels_date_idx on public.lab_panels(user_id, panel_date desc);
create index if not exists lab_panels_status_idx on public.lab_panels(user_id, status);

alter table public.lab_panels enable row level security;

create policy "lab_panels_owner" on public.lab_panels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- LAB RESULTS (individual test results with flags)
-- ============================================================
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  panel_id uuid not null references public.lab_panels(id) on delete cascade,
  test_name text not null,
  normalized_test_name text not null,
  value text not null,
  unit text,
  reference_range text,
  flag text not null default 'normal' check (flag in ('normal','low','high','critical')),
  test_category text not null default 'other',
  created_at timestamptz default now()
);

create index if not exists lab_results_user_id_idx on public.lab_results(user_id);
create index if not exists lab_results_panel_id_idx on public.lab_results(panel_id);
create index if not exists lab_results_test_name_idx on public.lab_results(user_id, normalized_test_name);

alter table public.lab_results enable row level security;

create policy "lab_results_owner" on public.lab_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- LAB TEST DEFINITIONS (reference data for normalization)
-- ============================================================
create table if not exists public.lab_test_definitions (
  id uuid primary key default gen_random_uuid(),
  test_name text not null unique,
  category text not null,
  common_aliases text[],
  default_unit text,
  created_at timestamptz default now()
);

-- No RLS - this is reference data readable by all
alter table public.lab_test_definitions enable row level security;

create policy "lab_test_definitions_read_all" on public.lab_test_definitions
  for select using (true);

-- Seed common lab tests
insert into public.lab_test_definitions (test_name, category, common_aliases, default_unit) values
  ('LDL Cholesterol', 'lipid', array['LDL','LDL-C'], 'mg/dL'),
  ('HDL Cholesterol', 'lipid', array['HDL','HDL-C'], 'mg/dL'),
  ('Total Cholesterol', 'lipid', array['Cholesterol'], 'mg/dL'),
  ('Triglycerides', 'lipid', array['TG'], 'mg/dL'),
  ('Creatinine', 'kidney', array['Cr'], 'mg/dL'),
  ('eGFR', 'kidney', array['GFR'], 'mL/min'),
  ('BUN', 'kidney', array['Blood Urea Nitrogen'], 'mg/dL'),
  ('Glucose', 'metabolic', array['Blood Sugar'], 'mg/dL'),
  ('Hemoglobin A1c', 'metabolic', array['A1C','HbA1c'], '%'),
  ('Hemoglobin', 'cbc', array['Hgb','Hb'], 'g/dL'),
  ('Hematocrit', 'cbc', array['Hct'], '%'),
  ('TSH', 'thyroid', array['Thyroid Stimulating Hormone'], 'mIU/L'),
  ('Free T4', 'thyroid', array['FT4'], 'ng/dL'),
  ('hs-CRP', 'cardiac', array['High Sensitivity CRP','CRP'], 'mg/L'),
  ('Lipoprotein(a)', 'cardiac', array['Lp(a)'], 'nmol/L'),
  ('NT-proBNP', 'cardiac', array['BNP'], 'pg/mL'),
  ('Vitamin D', 'vitamins', array['25-OH Vitamin D'], 'ng/mL'),
  ('Vitamin B12', 'vitamins', array['B12'], 'pg/mL'),
  ('Potassium', 'electrolytes', array['K'], 'mEq/L'),
  ('Sodium', 'electrolytes', array['Na'], 'mEq/L')
on conflict (test_name) do nothing;

-- ============================================================
-- GENETIC MARKERS (methylation/SNP data)
-- ============================================================
create table if not exists public.genetic_markers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.health_file_uploads(id) on delete set null,
  snp_id text not null,
  gene text not null,
  genotype text not null,
  risk_level text check (risk_level in ('normal','moderate','high')),
  clinical_significance text,
  supplement_implications text,
  created_at timestamptz default now()
);

create index if not exists genetic_markers_user_id_idx on public.genetic_markers(user_id);
create index if not exists genetic_markers_gene_idx on public.genetic_markers(user_id, gene);

alter table public.genetic_markers enable row level security;

create policy "genetic_markers_owner" on public.genetic_markers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- MEDICATIONS (prescriptions and supplements)
-- ============================================================
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_name text not null,
  medication_type text not null check (medication_type in ('prescription','supplement','otc')),
  dosage text,
  frequency text,
  indication text,
  prescriber text,
  started_date date,
  ended_date date,
  active boolean default true,
  kidney_safe boolean default true,
  cardiac_safe boolean default true,
  interaction_warnings text[],
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists medications_user_id_idx on public.medications(user_id);
create index if not exists medications_active_idx on public.medications(user_id, active);

alter table public.medications enable row level security;

create policy "medications_owner" on public.medications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- MEDICATION CHANGES (audit trail for med changes)
-- ============================================================
create table if not exists public.medication_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  action text not null check (action in ('started','stopped','dose_changed','frequency_changed')),
  change_date date not null,
  previous_value text,
  new_value text,
  reason text,
  created_at timestamptz default now()
);

create index if not exists medication_changes_user_id_idx on public.medication_changes(user_id);
create index if not exists medication_changes_medication_id_idx on public.medication_changes(medication_id);

alter table public.medication_changes enable row level security;

create policy "medication_changes_owner" on public.medication_changes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- APPOINTMENTS (medical appointments with AI prep)
-- ============================================================
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_date date not null,
  doctor_name text,
  doctor_specialty text,
  user_notes text,
  suggested_questions jsonb,
  changes_summary jsonb,
  flags jsonb,
  prep_generated_at timestamptz,
  status text default 'upcoming' check (status in ('upcoming','prep_ready','completed','cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists appointments_user_id_idx on public.appointments(user_id);
create index if not exists appointments_date_idx on public.appointments(user_id, appointment_date desc);
create index if not exists appointments_status_idx on public.appointments(user_id, status);

alter table public.appointments enable row level security;

create policy "appointments_owner" on public.appointments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
