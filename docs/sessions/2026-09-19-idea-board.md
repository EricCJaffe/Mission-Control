# Handoff — the idea board

Written 2026-09-20 so a session restarting cold can pick this up in one read.
**The first thing to know is that the feature is in two places at once:** the
core board is live in production, and two substantial extensions are finished
but sitting unmerged on a branch another session was working in.

## What Eric asked for, 2026-09-19

> *"i always seem to have ideas and dont want to forget them and think we need
> to add an idea board to mission-control. simple functionality like a mini to
> do- no due date but maybe you can have a time stamp so you can add to the
> weekly brief an idea section to keep it before me periodically and note how
> long its been since i've touched it. It would be cool if it also had the
> ability to convert an idea to a project with tasks. maybe make it a small
> skill or shortcut where i can write /idea and it would jot it down there."*

Every clause of that shipped the same morning. Two later asks — promote to
fsaos, and attachments — are the branch below.

## 🔴 Where everything stands

| | Commit | State |
|---|---|---|
| **The board** | `33b620d` The idea board | **on `main`, deployed, live** |
| **Promote to fsaos** | `4efc02f` The board can send an idea to fsaos | **unmerged**, `origin/feat/promote-idea-to-fsaos` |
| **Links and attachments** | `e8e1389` The idea board shows the picture | **unmerged**, same branch |

Live at <https://missioncontrol.bibleos.app/ideas> since 2026-09-19 ~11:03 ET.

⚠️ **All three migrations are already applied to the shared database**, but
only the first one's code is on `main`:

    20260919145301  ideas_board                   applied · merged
    20260919175001  ideas_promote_to_fsaos        applied · NOT merged
    20260919213715  ideas_links_and_attachments   applied · NOT merged

That is the "applied but not merged" half of the rule in `~/CLAUDE.md` §0a.
It is not currently hurting anything — extra tables and columns that no
deployed code reads — but the branch should merge rather than linger, and
until it does a fresh checkout of `main` sees schema it has no files for.
**Do not "repair" the ledger to resolve it.** Merge the branch.

⚠️ **The shared checkout was on `feat/promote-idea-to-fsaos` when this was
written.** Sessions share one `.git` per repo here. Run
`git rev-parse --abbrev-ref HEAD` before you commit anything, and take your
own worktree for work longer than a few edits — this file was written in one.

## The pieces, and where they live

### 1. Database — `mission.ideas`, shared project `uivawtdmxqutqelwibra`

`supabase/migrations/20260919145301_ideas_board.sql`. Columns that matter:
`title`, `body`, `domain` (the same five as tasks), `status`
(`open | promoted | parked | killed`), `captured_at`, `touched_at`,
`touch_count`, `promoted_project_id`, `source`, `source_ref`.

`mission.promote_idea(uuid, text[])` creates the project, inserts the first
tasks and marks the idea promoted **in one transaction**, SECURITY INVOKER so
RLS still applies. Verified with the `DO $$ … RAISE EXCEPTION $$` dry-run: 2
tasks from 3 lines (the blank one skipped), status `promoted`, all rolled back.

### 2. The app — `/ideas`

- `src/app/ideas/page.tsx` — capture box, open list oldest-attention-first,
  parked, and a "became projects" list kept deliberately.
- `src/app/ideas/new`, `[id]/touch`, `[id]/status`, `[id]/edit`,
  `[id]/promote` — plain form posts, no client component, matching `/projects`.
- `src/lib/ideas.ts` — `idleDays`, `idleLabel`, `idleTone`, thresholds 30 and
  90 days. **The email imports this same module**, so the board and the brief
  can never disagree about when an idea is old.
- Sidebar entry sits between Notes and Calendar.

### 3. The weekly brief

- `src/lib/brief/types.ts` — `BriefIdea`, `payload.ideas`, `IDEAS_IN_BRIEF`
  (12), `stats.ideasOpen` / `ideasIdle`, `narrative.ideasCommentary`.
- `collect.ts` — `buildIdeas`; `status = 'open'` and the `touched_at` ordering
  are **in the query, not in memory**, and a test pins that.
- `render.ts` — `ideasSection`, weekly **section 6**; outcomes and next steps
  moved to 7 and 8.
- `prompt.ts` — an `IDEAS ARE NOT TASKS` block forbidding the model from
  calling the board a backlog or telling him to clear it.
- **`~/dev/brain/jobs/eric-weekly.md` §8b** — the Sunday email he actually
  reads is that brain job, not this app's renderer. Both carry the section;
  that is the one that reaches him. Brain commit `0af7e7a`, pushed.

### 4. Capture — `mc-idea` and `/idea`

- `~/.local/bin/mc-idea`, mirrored to `~/dev/brain/docs/mc-idea` by
  `bin-mirror`. `mc-idea "text" [--domain …] [--body …]`, `--list`, `--touch`.
- `~/.claude/skills/idea/SKILL.md` — the `/idea` slash command. Its first rule
  is **capture in one turn and do not interview him**.
- The weekly brief is granted `Bash(mc-idea --list)` only, never
  `Bash(mc-idea:*)`: a bare call writes a row, and a brief able to run it
  could file its own ideas and report them back to him as his.

### 5. On the branch, not on main

- **Promote to fsaos** — an outbox row rather than a direct write, because
  fsaos is a different Supabase project and carrying its service-role key into
  this app would expose the whole business to a personal deployment. The box
  already holds the credential and the logic (`mc-idea --promote --to fsaos`).
- **Links and attachments** — `links text[]` for pointers that keep changing,
  `mission.idea_attachments` for a copy of something as it was when the idea
  was caught. Images render as the image. Private bucket, signed URLs issued
  server-side in one pass over the board. **Known slow leak, written into the
  migration:** deleting an idea drops the attachment rows and leaves the
  objects in storage, because Postgres cannot reach the storage API from a
  trigger.

## 🔴 Four decisions that must not be quietly undone

1. **An idea is not a task, and they share no table.** No `due_date` column,
   and nothing in `mission.ideas` reaches the overdue arithmetic, the
   stale-task verdicts or the alignment check. Filing ideas as tasks makes the
   brief nag about a thought, and the rational response to that is to stop
   capturing — at which point the feature costs him the ideas it was built to
   save. If something genuinely has a deadline it was never an idea; that is
   `brief-task`.

2. **`touched_at` and `updated_at` are two clocks.** The board's only number —
   "untouched 6 weeks" — reads `touched_at`, which moves **only on a
   deliberate human action**: catching, editing, "still alive", promoting.
   `updated_at` moves on any write. Anything scheduled that starts bumping
   `touched_at` makes every idle count a lie. Parking or killing does *not*
   touch it either: deciding to stop thinking about something is not thinking
   about it.

3. **The tone of the brief section is the feature.** Nothing is owed, nothing
   is late, and the word "backlog" must not appear. Red only at 90 days. The
   spec says this in three places because it is the thing that will drift.

4. **The daily brief carries no ideas at all**, pinned by tests in both
   `collect.ts` and `render.ts`. An idea is precisely the thing that does not
   have to happen today.

## One side change, and why it was necessary

`scripts/db/lib/ledger.ts` counted `references auth.users(id)` and `auth.uid()`
inside an RLS policy as **writes into the `auth` schema**, so `npm run
db:ledger` reported the first migration as CROSS-SCHEMA. Every table in
`mission` has both — they are the owner convention the whole schema is built
on — so the check was firing on correctly written code, and a check that cries
wolf gets switched off. Two strippers added (`stripForeignKeyTargets`,
`stripAuthHelpers`), with tests proving a genuine `update auth.users` is still
caught.

## Still open, and it is NOT this feature's

`npm run db:ledger` exited 1 on a pre-existing mismatch — the same migration
filed under two version numbers:

    UNFILED     20260908022326  brain_dashboard
    LOCAL-ONLY  20260907200000  20260907200000_brain_dashboard.sql

Same for `brain_jobs_on_demand_mechanism` (`20260908022505`). The fix is
renaming each file to the version the ledger recorded. Left alone: it belongs
to earlier work, and Eric was asked and has not answered. Note the other
session hit and fixed exactly this class of thing on its own branch
(`c08ac0c`), so re-check before assuming it is still outstanding.

## If you are extending it

Likely next, in the order it would probably come:
- Merge `feat/promote-idea-to-fsaos`. That is the real next action.
- An idea past 90 days offering the kill from inside the email.
- `/idea` capturing from a text or a mail thread — `source_ref` and
  `source_url` exist and are deduplicated by a partial unique index.
- Ideas on the dashboard. Resist putting them anywhere near a date.
