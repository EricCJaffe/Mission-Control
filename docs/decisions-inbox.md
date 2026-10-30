# Decisions inbox (`/decisions`)

Eric, 2026-10-30 3:41 PM ET (via Chief of Staff): one always-live link listing
every open decision and anything stalled. Tapping an option submits his answer
right away (no copy and paste), and the bots pick it up and keep going. Bots add
decisions automatically.

## The loop

| Step | Who | What |
|---|---|---|
| Trigger | a bot | writes a channel note with `kind: decision` (or a job sits queued/running past 48 h, or is marked `waiting: eric`) |
| Ingest | `scripts/sync/decisions-inbox.ts`, every 5 min (ExecStartPost on `mission-control-activity.service`) | upserts `mission.decisions` on `(user_id, source_note)`; never touches an answered row; withdraws a row whose note closed or disappeared |
| Act | Eric on `/decisions` | one tap: an option, or "In my own words"; `POST /api/decisions/[id]/answer` writes it as him (RLS) |
| Deliver | the same script, next run | writes `channel/to-grokbot/<day>-answer-<slug>-<id8>.md` (`for: cos`, `kind: answer`, `re:` the source note, his words verbatim), appends `open/decisions.tsv`, pushes via a scratch clone, rings `erics-inbox+job-cos@mail.grokbot.com` (path-only body, subject `grokbot-job [wake:ask-eric] <slug>`), stamps `delivered_at` |
| Verify | the page | "Answered" shows *the bots have it* once `delivered_at` is set, *sending* before |
| Heal | the script | a failed push keeps the row undelivered with `delivery_error` and retries next run; a refused push parks on `brain-conflict/*`; a failed ring is logged and `doorbell-reconcile` lists the unacked note |
| Record | `mission.decisions` + `open/decisions.tsv` | one row per decision, and one TSV line per answer |

## How a note becomes a card

`scripts/sync/parse/decisions-inbox.ts` (tests beside it):

- **Title:** the note's `# ` heading. **Context:** the first paragraph after it.
- **Options:** `options:` in the frontmatter, or a numbered / bulleted /
  lettered (`A.`, `**B.**`) list under an "Options" heading or label. A label
  is the text up to the first `:`, `;`, `—` or sentence end; the rest is the
  detail. With no list, a note that has a `**Recommendation:**` offers
  "Go with the recommendation" / "No"; one without offers Yes / No.
- **Default (blue button):** an option marked `(recommended)`, or the one the
  Recommendation line names ("option 2", "option B", or its label).
- **Urgency:** red for `urgent: true`, `priority: urgent|critical`,
  `severity: red|critical`, `urgency: red`, or a past deadline; green only
  when the note says `urgency: green`; otherwise yellow. Never amber.
- **Status:** `done`/`closed`/`dropped`… → withdrawn; past its deadline or
  older than 7 days → stale (still answerable); else open.
- **Stalled jobs:** fixed options Restart / Keep waiting / Drop.

## Privacy

Honey Lake notes are never read past their frontmatter. Every text that reaches
a row is scrubbed (`src/lib/activity/scrub.ts`: no addresses, phone numbers,
ids or links), and his free text is scrubbed before it is stored. The answer
note is leak-tested before it is written. The repo is public: tests use
synthetic data only.

## Security

No service-role key and no GitHub token in Vercel. The app can read only his
rows and, through column grants plus the `decisions_owner_answer` policy, set
only `answer`, `answer_text`, `status`, `answered_at` on his own open/stale,
unanswered row, once, to `answered`. It cannot insert or delete. Check
constraints hold the answer to one of the row's own options, or `other` with
text.

## Run by hand

    node --env-file=$HOME/.config/mission-control/sync.env scripts/sync/decisions-inbox.ts --dry-run

`DECISIONS_DOORBELL=off` skips the ring; `FSA_MAIL_BIN` replaces `fsa-mail`.

## Not built yet

- The email digest with signed, expiring one-click links (scope item 5, a
  separate PR).
