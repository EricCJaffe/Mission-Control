# Runbook — the cross-project sync

How to operate the harvester that pulls every project's task list into Mission
Control. For the Microsoft Graph side, read `docs/m365-setup.md` first; this
document covers running it once it exists.

## What runs, and where

| | |
| --- | --- |
| Where | **ubuntu-dev**, as a systemd **user** timer. Not on Vercel. |
| Why not Vercel | It reads `~/dev` off the local disk. Vercel has no access to your repos, and the app itself never needs it — the brief reads Supabase only. |
| Unit files | `deploy/systemd/mission-control-sync.{service,timer}`, installed to `~/.config/systemd/user/` |
| Secrets | `~/.config/mission-control/sync.env`, mode 600, never committed |
| Schedule | Every two hours, 06:00–22:00 America/New_York, with a 5-minute jitter |
| Logs | journald. `journalctl --user -u mission-control-sync` |
| Where to look | `/sync` in the app — last run per source, red when stale |

Task files are edited by people during the day, so an overnight gap is expected
and is not a fault. `/sync` only calls the project sync stale after **36 hours**,
which is two working days of silence.

## Running one by hand

```bash
cd ~/dev/mission-control

# Read and report. Writes nothing. Always start here.
npm run sync:projects -- --dry-run

# The real thing.
npm run sync:projects

# One project only, useful when a parse looks wrong.
npm run sync:projects -- --project trellisv2 --dry-run

# Widen the net. Default is P1 and yours; P2 is roughly 500 items.
npm run sync:projects -- --max-priority 2 --dry-run
npm run sync:projects -- --all --dry-run
```

`npm run sync:projects` loads `.env.local` via `--env-file-if-exists`, but
**`MC_USER_ID` is not in `.env.local`** — pass it inline, or run the unit:

```bash
MC_USER_ID=<uuid> npm run sync:projects -- --dry-run
systemctl --user start mission-control-sync.service   # uses sync.env
```

## Operating the timer

```bash
systemctl --user list-timers mission-control-sync.timer   # when it next runs
systemctl --user start mission-control-sync.service       # run now
journalctl --user -u mission-control-sync -n 50           # what happened
systemctl --user disable --now mission-control-sync.timer # stop it
```

After editing a unit file in `deploy/systemd/`, copy it and reload — systemd
reads its own copy, not the repo's:

```bash
cp deploy/systemd/mission-control-sync.* ~/.config/systemd/user/
systemctl --user daemon-reload
```

**`loginctl enable-linger admxn` is load-bearing.** Without it the user manager
stops when nobody is logged in and the timer never fires. It is on; check with
`loginctl show-user admxn -p Linger`.

## Reading a run

Each run writes a `mission.sync_runs` row. `/sync` renders the last 25.

```sql
select started_at, source, status, items_seen, items_created,
       items_updated, items_closed, error
from mission.sync_runs order by started_at desc limit 10;

-- Per-project detail, including repos whose tasks were counted but not imported
select started_at, jsonb_pretty(log) from mission.sync_runs
where source = 'projects' order by started_at desc limit 1;
```

`items_seen` is what matched the filter, not what exists. The `log` column
carries `open` and `mine` per repo, so the rollups stay honest even for the
~1,100 items the default filter does not import.

A healthy steady-state run reports **0 created, 0 closed** and updates
everything it sees. Created and closed counts should track real edits to the
project files.

## Adding a project

Nothing to do. Any directory under `~/dev` with a `.git` is discovered on the
next run and registered in `mission.projects` with its directory name as slug.

Only the first registration guesses `domain` and `client`, from
`scripts/sync/lib/domains.ts`. After that they are yours — change them in the
app or in SQL and the sync will not overwrite them.

To stop syncing a project without deleting it:

```sql
update mission.projects set sync_enabled = false where slug = 'mac-setup';
```

## Changing what gets imported

- **Which tasks** — `--max-priority` and `--all` on the command line; edit
  `ExecStart` in the unit to change the default for the timer.
- **What counts as urgent** — `URGENT_SECTION_RE` / `URGENT_LINE_RE` in
  `scripts/sync/parse/markdown.ts`. Run `npm run test:sync` after; the tests
  are real lines from real files and will catch an over-broad pattern.
- **What counts as yours** — `isMine()` in `scripts/sync/projects.ts`. A repo
  that names nobody is treated as all yours; a repo that uses handles surfaces
  only your items plus unowned urgent ones.
- **Which files are read** — `TASK_FILES` in `scripts/sync/lib/repos.ts`.
  `CLAUDE.md` and `.claude/` are deliberately not scanned: a survey of all
  eleven repos found not one checkbox in either.

## The rule that keeps hand edits safe

Editing a task in Mission Control stamps `edited_at`. From then on the sync may
refresh only its title and description; **status, priority, due date and domain
are yours**. Before that stamp the source file wins.

So: to correct a synced task's wording, fix it in the project's file. To change
what you are going to do about it, change it here.

To hand a task back to the source:

```sql
update mission.tasks set edited_at = null where id = '<uuid>';
```

## When something is wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/sync` shows a source red | Timer not running, or the run failed | `systemctl --user list-timers`; then `journalctl --user -u mission-control-sync -n 50` |
| `status=203/EXEC` in the journal | `node` not found | A user unit does not source `~/.profile`, so fnm's shims are absent. `ExecStart` must be an absolute path — `/home/admxn/.local/share/fnm/aliases/default/bin/node`. Re-check it after an fnm upgrade. |
| `MC_USER_ID is not set` | Running by hand without it | It is not in `.env.local`. Pass it inline or start the unit. |
| `duplicate key … tasks_source_ref_idx` | Two tasks with the same heading trail and title | Handled — the nth duplicate gets `~n`. If it recurs, a new collision shape has appeared; add a test. |
| Tasks reappear after being closed in the project | The heading above them was reworded | Identity is the heading trail plus the title, so moving a task between sections re-creates it. The old row is closed with `why = 'closed by sync — no longer in source'`, not deleted. |
| A whole project shows 0 | It has no checkbox-style task file | Expected for TKOS, which writes tasks as prose, and for BibleOS, brain and businessos, which have no task file. Check the `files` column in the run output. |
| Everything looks current but is not | The box was off | The timer is `Persistent=true`, so it runs once on resume. Check `LAST` in `list-timers`. |

## Rotating the service-role key

`sync.env` holds a Supabase **service-role** key, which bypasses RLS entirely.
It is the most dangerous credential in this system: it can read and write every
row in the shared database, including FinanceOS's.

```bash
chmod 600 ~/.config/mission-control/sync.env   # verify after any edit
$EDITOR ~/.config/mission-control/sync.env
systemctl --user start mission-control-sync.service   # confirm it still runs
```

The CLI warns on stderr if `SUPABASE_URL` is not the shared project, because a
service-role key pointed at the wrong database writes successfully and silently.

## Related

- `docs/m365-setup.md` — the Graph app registration, and the Exchange access
  policy that stops one mailbox's credentials reading the whole tenant.
- `supabase/README.md` — why `supabase db push` must not be run from this repo.
