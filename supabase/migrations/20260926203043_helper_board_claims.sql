-- The open board: a shared, unassigned job that any helper with the skill can
-- claim. claimed_at is set when a helper takes it themselves (null when Eric
-- assigned it), so /helpers can tell "Tyler took it" from "I gave it to Steve".
-- The claim itself is a conditional update (only while unassigned), so two
-- helpers tapping at once cannot both win.
alter table mission.work_items add column if not exists claimed_at timestamptz;
notify pgrst, 'reload schema';
