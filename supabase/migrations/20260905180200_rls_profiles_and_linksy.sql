-- Mission Control as the single pane of glass, part 3 of 3: close the two
-- tables in this schema that had row level security switched off.
--
-- Both were found with `relrowsecurity = false` and zero policies. They came
-- across in the copy from the old project and nothing has referenced them
-- since — `grep` finds no read of either anywhere in src/. That is exactly why
-- they stayed open: nothing failed, so nothing complained.
--
-- SCHEMA IS `mission`. A table named `profiles` also exists in other schemas
-- of this database; this migration must never reach them.

-- ---------------------------------------------------------------------------
-- profiles — id is the auth user id, so the owner rule is on `id`, not on a
-- `user_id` column. One row today.
-- ---------------------------------------------------------------------------
alter table mission.profiles enable row level security;

drop policy if exists profiles_owner on mission.profiles;
create policy profiles_owner on mission.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- linksy_email_templates — app-wide email templates. Empty, unreferenced, and
-- with no user column at all, so there is no ownership to express.
--
-- RLS ON WITH NO POLICY IS THE POLICY. Under RLS a table with no permissive
-- policy is readable and writable only by roles that bypass it — service_role
-- and the postgres superuser — which is the correct blast radius for global
-- configuration that no signed-in user should be editing from a browser.
-- Inventing an `authenticated can read` policy here would be granting access
-- that nothing has asked for.
--
-- If a feature later needs to read these from the client, add a select policy
-- in its own migration and say which feature needed it.
-- ---------------------------------------------------------------------------
alter table mission.linksy_email_templates enable row level security;

notify pgrst, 'reload schema';
