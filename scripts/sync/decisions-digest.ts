/*
 * Decisions email digest: Eric's open decisions in one email, each option a
 * signed, expiring one-click link. Item 5 of the decisions inbox.
 *
 *   node --env-file-if-exists=.env.local scripts/sync/decisions-digest.ts [--out <file>]
 *
 * SENDING IS OFF BY DEFAULT. Without DECISIONS_DIGEST_SEND=on it builds the
 * digest and reports it (and writes the HTML to --out if given), and sends
 * nothing. On, it sends through `fsa-mail send` to DECISIONS_DIGEST_TO
 * (default eric@foundationstoneadvisors.com; fsa-mail refuses anyone outside
 * the firm). Nothing waiting, nothing sent.
 *
 * DECISIONS_LINK_SECRET signs the links here and verifies them in the app,
 * so the same value must be in Vercel's env and in this box's sync.env;
 * DECISIONS_APP_URL defaults to production. A tap opens /decisions/a/<token>,
 * which needs his session and posts to /api/decisions/[id]/answer, so an
 * answer from the email takes exactly the path a tap on /decisions does: the
 * box script delivers the `kind: answer` note and rings the doorbell.
 * docs/decisions-inbox.md, "Email digest".
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnv } from './lib/env.ts';
import { createSyncClient } from './lib/db.ts';
import { renderDigest, type DigestRow } from './parse/decisions-digest.ts';

const APP_URL = process.env.DECISIONS_APP_URL || 'https://missioncontrol.bibleos.app';
const TO = process.env.DECISIONS_DIGEST_TO || 'eric@foundationstoneadvisors.com';
const send = process.env.DECISIONS_DIGEST_SEND === 'on';
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? process.argv[outIdx + 1] : undefined;

async function main() {
  const env = loadEnv();
  const db = createSyncClient(env);
  const { data, error } = await db
    .from('decisions')
    .select('id,kind,title,context,options,default_option,urgency,deadline,status,created_at')
    .eq('user_id', env.userId)
    .in('status', ['open', 'stale'])
    .limit(200);
  if (error) throw new Error(`read decisions: ${error.message}`);

  const digest = renderDigest((data ?? []) as DigestRow[], { appUrl: APP_URL, secret: process.env.DECISIONS_LINK_SECRET, now: new Date() });
  if (!digest) {
    console.log('decisions-digest: nothing open, nothing to send');
    return;
  }
  console.log(`decisions-digest: "${digest.subject}", ${digest.links} links`);
  if (out) writeFileSync(out, digest.html);
  if (!send) {
    console.log('decisions-digest: DECISIONS_DIGEST_SEND is not "on"; not sent');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'mc-digest-'));
  try {
    const file = join(dir, 'digest.html');
    writeFileSync(file, digest.html);
    execFileSync(
      process.env.FSA_MAIL_BIN || 'fsa-mail',
      ['send', '--intent', 'eric-said', '--claim-ok', 'a list of open questions, not a claim about code', '--to', TO, '--subject', digest.subject, '--html-file', file],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60_000 },
    );
    console.log(`decisions-digest: sent to ${TO}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`decisions-digest: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
