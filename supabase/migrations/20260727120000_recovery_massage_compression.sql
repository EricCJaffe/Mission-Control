-- Add the recovery modalities Eric actually uses beyond sauna/cold plunge:
-- massage (with a sub-type: percussion gun / professional / self) and pneumatic
-- leg compression. Widen the modality CHECK and add an optional sub_type.

alter table public.recovery_sessions drop constraint if exists recovery_sessions_modality_check;
alter table public.recovery_sessions
  add constraint recovery_sessions_modality_check
  check (modality in ('sauna', 'cold_plunge', 'stretching', 'mobility', 'massage', 'compression'));

-- Optional detail for massage (gun / professional / self); null for others.
alter table public.recovery_sessions add column if not exists sub_type text;

notify pgrst, 'reload schema';
