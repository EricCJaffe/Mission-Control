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

## Email digest

`scripts/sync/decisions-digest.ts` emails every open decision, with each option
as a one-click link. **Sending is off by default** (`DECISIONS_DIGEST_SEND=on`
switches it on). Without that it builds the digest, reports it, and writes the
HTML to `--out <file>` if asked. Nothing open, nothing sent.

| Piece | What it does |
|---|---|
| Link | `/decisions/a/<token>`. The token is `v1.<decision>.<option>.<expiry>.<HMAC-SHA256>` under `DECISIONS_LINK_SECRET` (at least 32 characters), good for 72 h (`src/lib/decisions/link-token.ts`) |
| Who can use it | only Eric's session: `/decisions/:path*` is in the middleware matcher, so a mail scanner that opens a link gets the login page and answers nothing |
| What it can answer | only the decision and option it was signed for. The answer endpoint re-checks the token against the id and option in the request |
| Once | the row, not a spent-token ledger: the endpoint updates only an unanswered open/stale row, so any second tap is "Already answered" |
| After the tap | the same path as `/decisions`: the box script writes the `kind: answer` note and rings the doorbell |

To switch it on: set the same `DECISIONS_LINK_SECRET` in Vercel (production)
and in `~/.config/mission-control/sync.env`, deploy, run it once by hand with
`--out` and open the result, then add `DECISIONS_DIGEST_SEND=on` and a timer.
`DECISIONS_DIGEST_TO` and `DECISIONS_APP_URL` override the recipient and host.

## 2026-10-31: the one place to act

Eric: *"An email that I can't take action on though is kind of useless."*

- **Page.** A colored summary banner (red / yellow / green and stalled counts), then **Decisions**, then **Stalled on you** with each job's owner and next step, then **Answered today**. Answered items drop off after 24 hours. Each card has `id="d-<id>"`, so `/decisions#d-<id>` deep-links to it and rings it.
- **Ask Chief of Staff.** A question box on every card (`POST /api/decisions/[id]/question` → `mission.decision_questions`). The box script delivers each one as a `kind: question` note `for: cos`, `re:` the source, and rings the doorbell. Asking does not close the card.
- **Write-back.** On delivery, the source note gets a line naming Eric's choice and the answer note. A `kind: decision` note is also set to `status: answered`; a stalled job's status is left to its owner.
- **One row per item, auto-closed.** `dedupe_key` is `pr:<owner/repo#n>` when the note names a PR (`pr:` or the first PR URL), otherwise the note path. Open rows that share a key keep the newest note. A row closes, with `closed_reason`, when any of these happens:
  - its note is closed;
  - a `kind: answer` or `reply` note `re:` it appears (an answer given in a chat card or an email reply);
  - its PR is merged or closed (`gh pr view`, which fails open).
- **Emails.** The digest opens with an **Open Decisions (N waiting)** button, and every item links to its card. `openDecisionsButton()` in `scripts/sync/parse/decisions-digest.ts` is the shared block for any brief.
- Migration `decisions_actionable` (additive; rollback in `supabase/rollbacks/`).
