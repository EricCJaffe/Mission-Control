# AI usage meter (`/ai-usage`)

Eric, 2026-10-18 (12:21, 12:22, 12:24 PM ET): one page that says, per AI plan,
how much is used, how fast it is burning, whether it runs out before it resets,
which projects/clients use it (as a **percent of the plan**, not dollars), what
to pause or move, and a monthly per-client CSV for billing.

## Data path

```
box ─┐  deploy/ai-usage/box-collect.sh: collect-logs.mjs on the box + piped over
mac ─┘  ssh to the Mac mini → JSON → ubuntu-dev:~/.local/share/ai-usage/inbox/
ubuntu-dev  mission-control-ai-usage.timer (02:15 + 13:15 ET)
            upload.mjs: its own logs + inbox + manual.jsonl → mission.ai_usage_snapshots
            report.mjs --write: brain open/ai-usage.txt (brief) + run-out alert note
app         /ai-usage reads mission.ai_plans / ai_usage_snapshots / ai_usage_daily (RLS)
```

- **Read only.** The collector reads `~/.claude/projects/**/*.jsonl` and
  `~/.codex/sessions/**/rollout-*.jsonl`, nothing else (never
  `~/.codex/auth.json`, never anything under `~/.claude` but the session logs),
  and emits counts and metadata only, never prompt or response text. No
  cookies, tokens or private APIs; Codex rate limits are the CLI's own log lines.
- **Window:** 28 days per run (Claude Code prunes its logs at 30). Each run
  REPLACES one host's log rows from the window start, in one transaction
  (`mission.ai_usage_replace_log_window`, service role only), so re-runs and
  re-attribution never double count. Only the newest inbox file per host is
  used. Manual rows are upserted and never touched by the replace.
- **Attribution:** `scripts/usage/attribution.mjs` maps each session's `cwd`
  with `config/ai-usage-projects.json` (repo dir → project + client). Anything
  it cannot map is stored as `unattributed`, never guessed. Edit the config and
  the next run re-attributes the last 28 days.
- **Plans:** `config/ai-usage-plans.json`, upserted into `mission.ai_plans` on
  every run. Claude Max has no published token cap, so its weekly budget is an
  **estimate** (labeled so); a manual percent reading overrides it.

## Claude accounts: two plans (2026-10-18)

Claude Code keeps each login in its own config dir (`CLAUDE_CONFIG_DIR`), and
its logs sit under that dir's `projects/`. So the folder a log is in says which
account (and plan) it bills. The logs carry no account field, so the mapping is
by config dir. It was verified with `claude auth status` per dir, which shows
only account names and no secrets:

| Config dir (on ubuntu-dev) | Account | Plan slug | Who uses it |
|---|---|---|---|
| `~/.claude` | ejaffejax@gmail.com (Max) | `claude-max` (Claude Max (main)) | the herdr fleet (fsaos, honeylakeos, ...), every tmux session (e.g. `mc-ai-usage-p2`, `4lot-rebuild`, where 4lot is the project, not the account) |
| `~/.claude-4lot` | ejaffe@4lot.org (Team) | `claude-4lot` (Claude Team (4lot)) | the `claude-4lot` wrapper; herdr pane `w8P:p5` |
| `~/.claude-reserve` | ejaffe@4lot.org (Team) | `claude-4lot` | `herdr-fleet --reserve` (the whole fleet ran here 9/28 to 10/7) |

- **box:** the box's `claude` CLI signs in with an OAuth token env (`authMethod: oauth_token`), which reports no account. Its logs (`~/.claude` on the box) bill `claude-max` by default. This is **unverified**, and the volume is small. If it is the 4lot account, set `AI_USAGE_CLAUDE_DIRS="~/.claude=claude-4lot"` in `box-collect.sh`.
- **mac-mini:** Claude Code is logged out there now (`authMethod: none`). Old logs bill `claude-max`.
- Override per host: `AI_USAGE_CLAUDE_DIRS="DIR=PLAN,DIR=PLAN"`, or `--claude-dir DIR=PLAN` (repeatable). Only `projects/` is walked; credential files in those dirs are never opened.
- Manual readings stay per plan: use `"plan": "claude-4lot"` for a reading from the 4lot account's usage page.
- **Capacity (Eric, 2:09 PM ET 10/18):** 4lot and Codex are basic Team-tier plans, so routing and suggestions weight every plan by `config/ai-usage-capacity.json`: main 1.0, 4lot 0.0625 (a Team Standard seat is 1.25x Pro; Max 20x is 20x Pro), Codex 0.1 (strategic only, never an overflow target), Grok Bot 1.0. 4lot has an estimated weekly cap of 325M logged tokens (0.0625 x main's ~5.2B), so it is never treated as unlimited. Only small jobs move to 4lot; big builds wait for main.

## Routing file for dispatch (2026-10-18)

`report.mjs --write` also writes `$BRAIN_ROOT/open/ai-usage.json`, the machine-readable twin of the brief lines. It has one record per plan: `used_pct`, `projected_at_reset_pct`, `runout_before_reset`, `reset_at`, `reading_at`, `reading_age_h`, `status`, `no_cap`, `early`, `idle`. For a token-budget plan (4lot), `used_pct` comes from the logs against its estimated cap; `reading_at` is the newest log activity, and `idle: true` means nothing logged in 48h (the window's earlier usage still counts; 0% only when nothing was logged this window, which dispatch treats as available at lower priority). The file is written atomically (temp file + rename). It also carries `limit_tokens`, `capacity_weight`, `overflow_target` and `small_jobs_only` per plan, plus `max_weekly_tokens_baseline` and `job_size_tokens` (S/M/L). `dispatch-autostart` (dev-harness) reads it to route queued notes between Claude main and Claude 4lot. Eric turned meter-driven routing on at 2:06 PM ET on 10/18. A file that is missing, or older than 24h, means dispatch behaves as before. The brief gets one `routing (24h): ...` line built from `runs/dispatch-routing.jsonl`, the decision log dispatch writes. A second line, `routes (7d, first-try): ...`, scores each route (plan/model tier) from the `outcome` records dispatch appends when a job finishes (first-try success, review findings, rework, tokens); an economy route under 80% first-try (5+ jobs) is moved up a tier by dispatch, and escalations and needs-Eric flags are counted.

## Grok Bot Ultra (manual, Chief of Staff daily)

There is no sanctioned usage API, so Chief of Staff appends one line a day to
`~/dev/brain/ai-usage/manual.jsonl` (commit + `brain-sync push`), read from
the Grok Bot **Usage** settings page:

```json
{"date":"2026-10-18","plan":"grok-ultra","used_pct":42,"resets_at":"2026-10-25T00:00:00-04:00","window":"weekly","note":"","by":"cos"}
```

| field | required | meaning |
|---|---|---|
| `date` | yes | ET day of the reading, `YYYY-MM-DD` |
| `plan` | yes | `grok-ultra` (any plan slug works, e.g. a `claude-max` % from Claude's usage page) |
| `used_pct` | yes* | percent used as shown on the page |
| `resets_at` | no | when that meter resets (ISO date/time) |
| `window` | no | `5h` · `daily` · `weekly` · `monthly` |
| `used`, `limit`, `unit` | yes* | when the page shows a count instead of a % (*one of `used_pct`/`used`) |
| `secondary_used_pct`, `secondary_resets_at` | no | a second meter, if the page shows one |
| `at` | no | when the reading was taken (ISO); default midday ET of `date` |
| `note`, `by` | no | free text; who entered it (default `cos`) |

A later line for the same plan, day and `by` replaces the earlier one. Bad
lines are skipped and logged by the uploader. Eric can also type a reading on
the page itself (manual entry form).

## Commands

| | |
|---|---|
| `npm run usage:logs -- --host NAME` | print this host's aggregated rows (read only, no DB) |
| `npm run usage:collect [-- --dry-run]` | ubuntu-dev: collect + inbox + manual, upload |
| `npm run usage:report` | print the brief lines (`-- --write` writes the brain files) |
| `deploy/ai-usage/box-collect.sh [--upload]` | box: push box + Mac mini rows, optionally run the upload now |
| `npm run test:usage` | parser, attribution, manual and forecast tests (synthetic fixtures) |

## Status rules (brief and alert)

grey: no reading in 48h · red: projected to run out before reset, or ≥ 90% ·
yellow: ≥ 70%, or run-out within 24h after reset · green otherwise.
Alerts: `channel/to-grokbot/<date>-ai-usage-alert-<plan>.md` (`for: cos`,
`kind: fyi`), at most one per plan per ET day.

## Schedules

- ubuntu-dev: `deploy/systemd/mission-control-ai-usage.{service,timer}`, installed
  as user units like the task sync (`systemctl --user list-timers | grep ai-usage`).
- box + Mac mini: `deploy/ai-usage/box-collect.sh`. The box has no cron or
  systemd, so it runs from a Grok Bot routine or by hand; the Mac mini is
  collected over ssh from the box (nothing installed on the Mac).

Rollback: `supabase/rollbacks/20261018172543_ai_usage.down.sql`, then disable
the timer.
