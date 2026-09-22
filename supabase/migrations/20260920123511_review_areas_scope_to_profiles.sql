-- Scope the seeded review areas to real Mission Control users.
--
-- `20260920122731_reviews_module.sql` seeded its six areas by cross joining
-- `auth.users`, which holds three rows — Eric plus two accounts that have never
-- had a Mission Control profile. Eighteen area rows were created where six were
-- wanted. Nothing was exposed (RLS scopes every one of them to its owner), but
-- two phantom users now own a review board apiece, and an orphan row that
-- nothing can ever read is the kind of thing that is still there in a year
-- confusing whoever next counts something.
--
-- `mission.profiles` is the right list and it is inside this repo's own schema.
-- `npm run db:ledger` flagged the original as CROSS-SCHEMA for exactly this
-- reason: a migration in a repo that owns `mission` had reached into `auth`.
-- The guard was right. The foreign key on `user_id` still references
-- `auth.users`, which is the convention every table in this schema follows —
-- it is the SELECT that did not belong, not the reference.

delete from mission.review_areas a
where not exists (select 1 from mission.profiles p where p.id = a.user_id);

-- Backfill anyone who has a profile but no areas, so this is also the seed for
-- a user added later. Same six definitions and the same starting lines as the
-- original migration; see its header for why each line is drawn where it is.
insert into mission.review_areas
  (user_id, key, label, description, matrix_key, kind, source, target, warn_at, direction, unit, cadence, sort_order)
select p.id, a.key, a.label, a.description, a.matrix_key, 'matrix', a.source,
       a.target, a.warn_at, a.direction, a.unit, a.cadence, a.sort_order
from mission.profiles p
cross join (values
  ('god_first', 'God First', 'Adherence across the spirit practices — Bible reading, prayer, faith reading, church, giving.',
   'god_first', 'practices', 8, 6, 'higher_better', 'score', 'weekly', 10),
  ('health_body', 'Health — Body', 'Training sessions logged in the period.',
   'health', 'training', 3, 2, 'higher_better', 'count', 'weekly', 20),
  ('family', 'Family', 'Hours of deliberate, undistracted family time. Entered by hand — the calendar has never carried a family tag.',
   'family', 'manual', 6, 3, 'higher_better', 'hours', 'weekly', 30),
  ('impact', 'Impact', 'Overdue open tasks across every project. The line is how much lateness is tolerable, not how much work there is.',
   'impact', 'tasks', 0, 10, 'lower_better', 'count', 'weekly', 40),
  ('health_soul', 'Health — Soul', 'The Flourishing assessment’s soul score. Monthly, because a survey retaken weekly stops being answered.',
   'health', 'flourishing', 8, 6, 'higher_better', 'score', 'monthly', 50),
  ('project_health', 'Projects', 'Every active project scored on its own task board: overdue work, or no movement at all. The number is how many are red.',
   'impact', 'projects', 0, 3, 'lower_better', 'count', 'weekly', 60)
) as a(key, label, description, matrix_key, source, target, warn_at, direction, unit, cadence, sort_order)
on conflict (user_id, key) do nothing;

notify pgrst, 'reload schema';
