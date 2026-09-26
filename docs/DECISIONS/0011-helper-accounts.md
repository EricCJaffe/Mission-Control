# 0011 Helper Accounts Are Not Supabase Users

## Date
2026-09-26

## Status
Accepted and built (`/helpers`, `/h`; migration `20260926184606_helper_work_list.sql`).

## Context

Eric wants a work list that people who help him (his son, a handyman, a future
assistant) open on a phone, sign in to with an email and password, and tick
off: maintenance coming due, plus one-off jobs, with skill levels, assignees,
clock in/out for the ones paid hourly, locations, and what to buy.

It is Mission Control's first non-Eric identity. Mission Control holds his
whole personal life (spirit, health, finances through FinanceOS, work about
clients), in a Supabase project shared with FinanceOS and BibleOS under one
`auth.users`.

## Decision

**Helpers get their own credential tables, not Supabase Auth accounts.**

- `mission.helper_accounts`: email + scrypt password hash, lockout after 5
  failures, disable/enable. `mission.helper_sessions`: a random token in an
  httpOnly cookie scoped to `/h`, stored only as sha256. Both tables have RLS
  on, **no policies**, and `anon`/`authenticated` revoked: only server code
  with the service role touches them.
- Every helper read and write lives in `src/lib/helpers/server.ts` and is
  filtered twice: to the helper's owner, and to shared jobs they may see.
  `src/lib/helpers/list.ts` (`helperView`) decides which fields leave the
  server; it is tested for exactly that key set.
- Helper pages are `/h/*`, outside the middleware matcher. Eric's side is
  `/helpers/*`, inside it.

### Why not Supabase Auth with a role

A helper with a Supabase JWT would be a signed-in user of the whole shared
project. RLS keeps Eric's rows away from them, but that makes the boundary
"every policy and every service-role route in three apps is correct":

- Mission Control has service-role routes (fitness/health) that would each need
  auditing, and the audit would have to be repeated for every future route.
- The same credentials would sign in to FinanceOS and BibleOS.
- Several SECURITY DEFINER functions in the shared project are executable by
  `authenticated` (Supabase advisor, 2026-09-26).

With no JWT, none of that is reachable **by construction**: no policy can
match a helper, and every existing page redirects them to Eric's login.

### What this does not decide

Mary Jo is not a helper. She is a person with partial access to Eric's data,
as she already is in FinanceOS through `core` households and grants; when
Mission Control shares with her, it comes through that door (Supabase Auth +
grants), not this one. `~/dev/brain/docs/ROADMAP-mission-control-saas.md`
draws the same line: "Mary Jo is not a tenant, she is a person with partial
access." Helpers are a third shape: outside people who get one list.

## Consequences

- Password reset is Eric's action ("New password" on `/helpers`), which also
  signs the helper out everywhere. There is no self-service reset email.
- `work_items` is a side table keyed by task: nothing is shared by being
  created, and the project sync's ownership of `tasks` (the `edited_at`
  contract) is untouched. Completing a job as a helper uses the same
  `completionPatch` as Eric, so maintenance rolls forward and its log trigger
  fires.
- Locations are FinanceOS real-estate assets read as Eric; the job stores a
  label snapshot so helpers never read the assets table.
- Hours (`work_time`) are owner-only under RLS; a helper sees only their own,
  through server code.
