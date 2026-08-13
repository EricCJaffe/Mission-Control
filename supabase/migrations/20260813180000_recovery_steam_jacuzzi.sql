-- Steam room and jacuzzi as their own recovery modalities.
--
-- Both are heat, but logging them as "sauna" would make the sauna numbers a
-- lie: a 110F steam room and a 190F dry sauna are different exposures with
-- different durations, and the trend panel compares like with like. Separate
-- values keep the record honest and let each carry its own temperature.

alter table public.recovery_sessions drop constraint if exists recovery_sessions_modality_check;
alter table public.recovery_sessions
  add constraint recovery_sessions_modality_check
  check (modality in (
    'sauna',
    'steam_room',
    'jacuzzi',
    'cold_plunge',
    'stretching',
    'mobility',
    'massage',
    'compression'
  ));

notify pgrst, 'reload schema';
