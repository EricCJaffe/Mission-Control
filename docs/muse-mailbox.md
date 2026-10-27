# Muse mailbox

A mailbox in Mission Control for **Muse Code**, the terminal agent on Eric's Mac.
The bots post asks; Muse reads, takes and answers them over plain HTTPS with a
bearer header; the brain on ubuntu-dev pulls the answers back. Eric approved it
on 2026-10-26 at 7:50 PM ET (relayed by Chief of Staff), in place of an
`/api/mcp` server.

Prod: `https://missioncontrol.bibleos.app`. Table: `mission.muse_mail`.

## Lifecycle

```
bot POST ask  ->  new  --Muse take-->  taken  --Muse reply-->  done  --brain ack-->  handed_off_at set
                    \_____________ Muse reply (skip take) ______/
```

A `done` row with `handed_off_at` null is an answer nobody has seen yet. It is
never deleted to tidy up.

## Muse side: Bearer `MUSE_MAILBOX_TOKEN`

The token lives in Bitwarden ("Mission Control - Muse mailbox") and in Muse
Code's environment on the Mac. Vercel holds only its sha256
(`MUSE_MAILBOX_TOKEN_SHA256`, hex), so the deployment can check the token but
never holds it.

| Call | Does | Errors |
|---|---|---|
| `GET /api/muse/inbox` | open asks (`new`, `taken`), oldest first: `{id, from, ask, status, created_at}` | |
| `POST /api/muse/inbox/{id}/take` | `new` -> `taken` | 409 if not `new`, 404 unknown id |
| `POST /api/muse/inbox/{id}/reply` | body `{reply}` (1 to 20,000 chars) -> `done` | 409 if already `done`, 400 bad body |

All three: 401 with `WWW-Authenticate: Bearer` on a missing or wrong token, 503
if the hash is not set on the deployment, 429 past about 120 requests an hour.
The rate limit is per serverless instance: a guard against a runaway loop, not
an accounting system.

```bash
MC=https://missioncontrol.bibleos.app
curl -s -H "Authorization: Bearer $MUSE_MAILBOX_TOKEN" $MC/api/muse/inbox
curl -s -X POST -H "Authorization: Bearer $MUSE_MAILBOX_TOKEN" $MC/api/muse/inbox/<id>/take
curl -s -X POST -H "Authorization: Bearer $MUSE_MAILBOX_TOKEN" -H 'Content-Type: application/json' \
  -d '{"reply":"Done: ..."}' $MC/api/muse/inbox/<id>/reply
```

**What the Muse token can reach: `mission.muse_mail`, and nothing else.** Every
query is in `src/lib/muse/mail.ts` with the table name as a constant; no route
takes a table, column or filter from the caller. Tasks, notes, mail, briefs and
every health, fitness and medical table are unreachable because no code path
names them. A test (`src/lib/muse/handlers.test.ts`) drives every handler and
fails if any query touches another table.

## Bot side: Bearer `CRON_SECRET`

| Call | Does |
|---|---|
| `POST /api/cron/muse-outbox/ask` | body `{from, ask}`; `from` like `cos` or `coding` (`[a-z0-9_-]`, 1-40), `ask` 1 to 20,000 chars. 201 `{id}` |
| `GET /api/cron/muse-outbox` | answered rows not yet delivered: `{pending: [{id, from, ask, reply, created_at, done_at}], count, oldest_pending_hours}` |
| `POST /api/cron/muse-outbox` | body `{id, ref}`: sets `handed_off_at` and `handoff_ref`. 404 if unknown or already acked |

The brain-side pull acks only after its `channel/to-grokbot/<date>-muse-reply-<id8>.md`
note is committed, so a crash between the two re-delivers rather than drops,
the same shape as `/api/cron/brief-outbox`. A second ack of the same id is a
404, which the puller treats as "already handled".

```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' \
  -d '{"from":"cos","ask":"Check the Mac backup and say if it ran today."}' $MC/api/cron/muse-outbox/ask
curl -s -H "Authorization: Bearer $CRON_SECRET" $MC/api/cron/muse-outbox
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' \
  -d '{"id":"<id>","ref":"channel/to-grokbot/2026-10-27-muse-reply-1234abcd.md"}' $MC/api/cron/muse-outbox
```

## Setting the token

1. Eric creates it in Bitwarden: generator, 40+ characters, item
   "Mission Control - Muse mailbox".
2. Its sha256 goes into Vercel `MUSE_MAILBOX_TOKEN_SHA256` (Production), then a
   redeploy. On the Mac, without the token touching chat or a file:
   `printf %s "$MUSE_MAILBOX_TOKEN" | shasum -a 256 | cut -d' ' -f1`
3. `MUSE_MAILBOX_TOKEN` goes in Muse Code's environment on the Mac.

Rotating: replace the Bitwarden item, update the hash in Vercel, redeploy,
update the Mac. The old token stops working on the redeploy.

## Rollback

`supabase/rollbacks/20261027000249_muse_mail.down.sql`. Check for undelivered
answers first; the file says how.
