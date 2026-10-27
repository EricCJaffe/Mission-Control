# Bot activity (/activity)

What every bot did, what is running, and what waits on Eric, on one page.
Eric, 2026-10-27. Mobile first: one column with a Waiting / Timeline / Work
switch under 768px, three columns above.

## v1 (this release): a scrubbed snapshot

- `scripts/sync/activity-snapshot.ts` reads `~/dev/brain` (channel note
  frontmatter + H1, `jobs/lib/loops-report.py --json`, allowlisted
  `runs/*.jsonl` fields `at/ok/action/label/note`) and writes
  `data/activity-snapshot.json`. `npm run activity:snapshot`.
- **The repo is public.** The snapshot is real data: it is gitignored, never
  under `public/`, and read server-side by the signed-in page only
  (`src/lib/activity/snapshot.ts`). Without it the page shows the committed
  synthetic sample (`src/lib/activity/sample-snapshot.ts`) under a
  "Sample data" banner, which is what every git-built deployment shows.
- The scrub and tag rules are in `scripts/sync/parse/activity.ts` and tested in
  `parse/activity.test.ts`, including a run over a fixture brain asserting no
  UUID, email, `bc-` id, phone or URL reaches the output. Bot display names
  only; Honey Lake is "Honey Lake session: <status>" and its notes are not
  read past the frontmatter; dropped topics never appear.
- Mission Control's own tasks due today are read live from `mission.tasks`.

## v2 (next): tables and a 5-minute timer

`mission.bot_activity_items` / `bot_activity_runs`, a harvester writing them
every 5 minutes from a user timer on ubuntu-dev, and an R1 data invariant on
the newest run. Not in v1.
