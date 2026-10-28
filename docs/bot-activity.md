# Bot activity (/activity)

What every bot did, what is running, and what waits on Eric, on one page.
Eric, 2026-10-27. Mobile first: one column with a Waiting / Timeline / Work
switch under 768px, three columns above.

## v3: interactive Waiting (Eric, 2026-10-27 7:53 PM ET)

*"if there is a task waiting on me I can update its status or something to get it moving forward"*

- **Bots waiting on you:** Approve (Yes on a yes/no ask), No, Not now (date,
  default +3 days), Drop, or a short Reply. **Your to-dos** (Mission Control
  tasks due today or overdue): Done, Snooze (date), Drop.
- A tap posts to `/api/activity/decide` as the signed-in user and writes a row
  in `mission.bot_activity_decisions` (RLS: insert and read own rows only;
  no update or delete, so the audit log cannot be edited). No service-role key
  and no GitHub token in Vercel.
- To-dos act at once, like `/tasks/update`: Done goes through `completionPatch`
  (a recurring task rolls forward), Snooze moves `due_date`, both stamp
  `edited_at`. Drop leaves the task and takes it off Waiting for good.
- Bot answers show "answered" until `scripts/sync/activity-deliver.ts` (run
  after every 5-minute harvest, `ExecStartPost`) writes a channel note back to
  the asker with `re:` its note, his choice and reply quoted. The next harvest
  sees the item answered and it leaves Waiting. Delivery goes only through a
  brain scratch clone (`jobs/lib/brain-scratch-clone.sh`): commit,
  `pull --rebase --no-autostash`, push, or a `brain-conflict/*` branch; it never
  stashes, resets or cleans `~/dev/brain`.
- **Drop is final (R-163):** hidden on the page for good, a row in
  `open/decisions.tsv`, and a line appended to the asking note, the same day.
- "Your decisions" under Waiting is the audit log, newest first.
- Decision text goes through the same scrub and leak test as everything else
  (`src/lib/activity/decisions.ts`, `scripts/sync/parse/decision-note.ts`).

## v2: tables and a 5-minute timer

- `scripts/sync/activity.ts` (`npm`-free: `node scripts/sync/activity.ts`,
  `--dry-run`, `--json`) reads `~/dev/brain` one way, never writing it:
  channel note frontmatter + H1, `jobs/lib/loops-report.py --json`, and the
  allowlisted `runs/*.jsonl` fields `at/ok/action/label/note`. It scrubs, then
  upserts `mission.bot_activity_items` on `(user_id, source_key)`, deletes
  what this run no longer produced (the 7-day window), and writes one
  `mission.bot_activity_runs` row (`ok` or `error`, counts only).
- `deploy/systemd/mission-control-activity.{service,timer}`: every 5 minutes,
  `WorkingDirectory=~/dev/mission-control`, `EnvironmentFile=
  ~/.config/mission-control/sync.env`, the same hardening as
  `mission-control-sync.service`. Installed by Dispatch through a harness note,
  not by this repo.
- `/activity` reads the tables with the signed-in client (select-only RLS);
  "as of" is the newest ok run (`src/lib/activity/source.ts`). Before the first
  ok run with rows, or if the read fails, it falls back to the v1 snapshot
  (`data/activity-snapshot.json`, gitignored, real) and then to the committed
  synthetic sample under a "Sample data" banner.
- Watched by an R1 invariant in the brain's `jobs/_data-invariants.tsv`: no ok
  `bot_activity_runs` row in 20 minutes is a violation. It connects as the
  existing `financeos_invariants_ro` role (`url-file:~/.config/financeos/
  invariants-ro.url`), which may read `mission.bot_activity_runs` and nothing
  else in `mission` (migration `20261027233020_bot_activity_invariant_ro`).
- **The repo is public.** Real rows live only in the database and the
  gitignored snapshot; never under `public/`, never committed.
- The scrub and tag rules are in `scripts/sync/parse/activity.ts` and tested in
  `parse/activity.test.ts`, including a run over a fixture brain asserting no
  UUID, email, `bc-` id, phone or URL reaches the output. Bot display names
  only; Honey Lake is "Honey Lake session: <status>" and its notes are not
  read past the frontmatter; dropped topics never appear.
- Mission Control's own tasks due today are read live from `mission.tasks`.

## v1 (2026-10-27, #72): a scrubbed snapshot

`scripts/sync/activity-snapshot.ts` (`npm run activity:snapshot`) writes the
same rows to `data/activity-snapshot.json`. Kept as the fallback above.

## Waiting on Eric: only what is still open (Eric, 2026-10-27 6:57 PM)

- A note waits only while its status is not done / acked / superseded /
  cancelled / closed, and nothing answers it: no note with `re:` pointing at
  it (an answer, a reply, a -done) and no `<slug>-done|-reply|-answer.md`
  beside it.
- A loop waits only if it is not also in `open/triage-closed.tsv` (matched on
  a hash of first_seen, source, client and ref; the ref is never kept).
- Dropped topics never appear.
- An email subject is shown only if it passes the leak test as written;
  otherwise "<Client>: an email waits on your reply".
- Every generic Honey Lake row collapses into one "Honey Lake: N items
  waiting" line.
- Items older than 14 days sit behind "Show older" (due-today items never do).
