#!/usr/bin/env node
/*
 * Monthly expense sweep.
 *
 * Fires from a systemd timer on the 1st and reconciles the month that just
 * ended: find every vendor receipt, attribute it to one of the five paying
 * entities, and write a CSV that can be read straight into the monthly
 * reconciliation.
 *
 *   npm run sync:expenses                 # the previous month
 *   npm run sync:expenses -- --month=2026-08
 *   npm run sync:expenses -- --dry-run    # print, write nothing
 *
 * WHAT THIS DOES NOT DO YET. Eric's receipts arrive in two mailboxes and only
 * one of them has a headless credential path:
 *
 *   Outlook  — works, via the same MS_* app registration the m365 sync uses.
 *   Gmail    — NOT IMPLEMENTED. The Gmail receipts are reachable today only
 *              through an interactive Claude connector, which a timer cannot
 *              use. It needs its own service credential (a Google Cloud
 *              service account with domain-wide delegation, or a stored OAuth
 *              refresh token) and that has not been set up.
 *
 * So a run today covers Outlook only, and says so in its output rather than
 * quietly reporting a total that is missing two thirds of the spend. That
 * matters more than usual here: a reconciliation that looks complete and is
 * not will be signed off, and the gap becomes invisible.
 */

import { writeFileSync } from 'node:fs';
import { loadGraphEnv, graphGet, mailboxPath, type GraphEnv } from './lib/graph.ts';
import { attribute, ENTITY_LABEL, type Entity } from './lib/expenses/entities.ts';
import { monthFromKey, previousMonth, type Month } from './lib/expenses/month.ts';

type Args = { month: Month; dryRun: boolean; out: string | null };

function parseArgs(argv: string[]): Args {
  let month: Month | null = null;
  let dryRun = false;
  let out: string | null = null;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--month=')) month = monthFromKey(arg.slice('--month='.length));
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
    else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}`);
  }
  return { month: month ?? previousMonth(), dryRun, out };
}

type GraphMessage = {
  id: string;
  subject: string | null;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  bodyPreview?: string | null;
  webLink?: string | null;
};

/*
 * Senders that bill. Kept as substrings of the from-address because vendors
 * move between subdomains (invoice+statements@mail.anthropic.com and
 * @invoicing.resend.com are the same relationship) and a full-address list
 * goes stale silently — the failure mode being a receipt that is simply never
 * seen again.
 */
const BILLING_SENDERS = [
  'anthropic.com', 'vercel.com', 'supabase.com', 'resend.com', 'loom.com',
  'bitwarden.com', 'github.com', 'uptimerobot.com', 'openai.com',
  'microsoft.com', 'canva.com', 'godaddy.com', 'lovable', 'opusclip',
  'starlink', 'spacex.com', 'apple.com', 'paypal.com', 'logos.com',
];

function looksLikeBilling(msg: GraphMessage): boolean {
  const from = msg.from?.emailAddress?.address?.toLowerCase() ?? '';
  if (BILLING_SENDERS.some((s) => from.includes(s))) return true;
  const subject = (msg.subject ?? '').toLowerCase();
  return /receipt|invoice|payment|renewed|subscription/.test(subject);
}

/** Stripe prints "Invoice number 3JOCFJ20-0011"; the prefix is the entity key. */
function invoiceNumberOf(text: string): string | null {
  const m = /invoice\s+(?:number|no\.?)[:\s]+([A-Z0-9]{4,}-\d+)/i.exec(text);
  return m ? m[1] : null;
}

function amountOf(text: string): number | null {
  const m = /\$\s?([0-9][0-9,]*\.[0-9]{2})/.exec(text);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

async function sweepOutlook(env: GraphEnv, month: Month) {
  // Graph wants an unquoted datetime literal in the filter.
  const filter =
    `receivedDateTime ge ${month.startIso} and receivedDateTime lt ${month.endIso}`;
  const messages = await graphGet<GraphMessage>(env, mailboxPath(env, '/messages'), {
    $filter: filter,
    $select: 'id,subject,receivedDateTime,from,bodyPreview,webLink',
    $top: '100',
  });
  return messages.filter(looksLikeBilling);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { month } = args;
  console.log(`[expenses] reconciling ${month.label} (${month.startIso} .. ${month.endIso})`);

  const sources: string[] = [];
  const gaps: string[] = [];

  let outlook: GraphMessage[] = [];
  try {
    const env = loadGraphEnv();
    outlook = await sweepOutlook(env, month);
    sources.push(`Outlook (${env.mailbox}): ${outlook.length} billing messages`);
  } catch (err) {
    gaps.push(`Outlook — ${(err as Error).message.split('\n')[0]}`);
  }

  // Named explicitly so the gap is in the output, not just in this comment.
  gaps.push(
    'Gmail — no headless credential exists. Receipts in ejaffejax@gmail.com are ' +
      'NOT included in this run. See the header of scripts/sync/expenses.ts.',
  );

  const rows = outlook.map((m) => {
    const text = `${m.subject ?? ''}\n${m.bodyPreview ?? ''}`;
    const vendor = m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? 'unknown';
    const invoiceNumber = invoiceNumberOf(text);
    const a = attribute({ vendor, invoiceNumber });
    return {
      date: m.receivedDateTime.slice(0, 10),
      vendor,
      amount: amountOf(text),
      invoiceNumber,
      entity: a.entity ? ENTITY_LABEL[a.entity as Entity] : '',
      basis: a.basis,
      reason: a.reason,
      subject: m.subject ?? '',
      link: m.webLink ?? '',
    };
  });

  const header = [
    'Date', 'Vendor', 'Amount', 'Invoice number',
    'Entity', 'Attribution basis', 'Attribution reason', 'Subject', 'Link',
  ];
  const csv = [
    header.join(','),
    ...rows.map((r) =>
      [r.date, r.vendor, r.amount, r.invoiceNumber, r.entity, r.basis, r.reason, r.subject, r.link]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');

  console.log(`\n[expenses] sources:`);
  for (const s of sources) console.log(`  ok    ${s}`);
  for (const g of gaps) console.log(`  GAP   ${g}`);

  const byEntity = new Map<string, { n: number; total: number }>();
  for (const r of rows) {
    const key = r.entity || 'UNALLOCATED';
    const cur = byEntity.get(key) ?? { n: 0, total: 0 };
    cur.n += 1;
    cur.total += r.amount ?? 0;
    byEntity.set(key, cur);
  }
  console.log(`\n[expenses] ${rows.length} receipts, by entity:`);
  for (const [k, v] of [...byEntity].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${k.padEnd(28)} ${String(v.n).padStart(3)}   $${v.total.toFixed(2)}`);
  }

  const path = args.out ?? `expenses-${month.key}.csv`;
  if (args.dryRun) {
    console.log(`\n[expenses] --dry-run: would write ${path}`);
  } else {
    writeFileSync(path, csv + '\n');
    console.log(`\n[expenses] wrote ${path}`);
  }

  if (gaps.length) {
    console.log(
      '\n[expenses] THIS RUN IS INCOMPLETE — see the GAP lines above before reconciling.',
    );
  }
}

main().catch((err) => {
  console.error(`[expenses] ${(err as Error).message}`);
  process.exit(1);
});
