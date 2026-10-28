/*
 * Eric's /activity decision as a brain channel note: pure, so it is tested.
 *
 * The note goes back to whoever asked:
 *   asked in to-grokbot/   (a session asking grokbot / Eric)  -> from-grokbot/, for: that session
 *   asked in from-grokbot/ (a grokbot bot asking via a session) -> to-grokbot/,  for: that bot
 *   an open loop (an email he owes)                          -> to-grokbot/,  for: cos
 * with `re:` the asking note, so the harvester sees it answered and the item
 * leaves Waiting. His choice and reply are quoted as he gave them (after the
 * one scrub), so his own words count for hard-gate items.
 */
import { scrub, textLeaks } from '../../../src/lib/activity/scrub.ts';

export type DecisionRow = {
  id: string;
  item_key: string;
  item_source: 'channel' | 'loops' | 'task';
  item_title: string;
  item_bot: string;
  choice: 'approve' | 'no' | 'not_now' | 'drop' | 'reply' | 'done' | 'snooze';
  reply: string | null;
  until_date: string | null;
  created_at: string;
};

export type Asker = {
  /** The asking note, relative to channel/: `to-grokbot/x.md` or `from-grokbot/x.md`. */
  path: string;
  from: string | null;
  project: string | null;
};

const LABEL: Record<DecisionRow['choice'], string> = {
  approve: 'Approve',
  no: 'No',
  not_now: 'Not now',
  drop: 'Drop',
  reply: 'Reply',
  done: 'Done',
  snooze: 'Snooze',
};

const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function slug(v: string | null | undefined, fallback: string): string {
  const s = (v ?? '').trim().toLowerCase();
  return SLUG.test(s) ? s : fallback;
}

function etStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function etDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
}

/**
 * The note for one decision, or null if it cannot be routed (an unknown
 * channel item) or if any text would fail the leak test. Paths are relative
 * to the brain root.
 */
export function renderDecisionNote(d: DecisionRow, asker: Asker | null): { path: string; text: string } | null {
  if (d.item_source === 'task') return null;
  if (d.item_source === 'channel' && !asker) return null;

  const day = etDate(d.created_at);
  const id8 = d.id.replace(/-/g, '').slice(0, 8);
  const label = LABEL[d.choice];
  const title = scrub(d.item_title, 120) || 'Item';
  const reply = d.reply ? scrub(d.reply, 1000) : '';

  let dir: 'from-grokbot' | 'to-grokbot';
  let forWho: string;
  let re: string | null = null;
  let project: string;
  if (d.item_source === 'loops') {
    dir = 'to-grokbot';
    forWho = 'cos';
    project = 'loops';
  } else {
    const a = asker as Asker;
    dir = a.path.startsWith('to-grokbot/') ? 'from-grokbot' : 'to-grokbot';
    forWho = slug(a.from, dir === 'to-grokbot' ? 'cos' : 'coding');
    re = `channel/${a.path}`;
    project = slug(a.project, forWho);
  }

  const what =
    d.choice === 'not_now'
      ? `Not now. Come back to it on ${d.until_date}.`
      : d.choice === 'drop'
        ? 'Drop it. Dropped stays dropped (R-163): do not bring it back unless Eric does.'
        : d.choice === 'reply'
          ? 'Reply (below).'
          : `${label}.`;

  const lines = [
    '---',
    'status: open',
    `for: ${forWho}`,
    'from: eric',
    'kind: answer',
    `project: ${project}`,
    ...(re ? [`re: ${re}`] : []),
    `decision: ${d.choice}`,
    ...(d.until_date ? [`until: ${d.until_date}`] : []),
    `via: mission-control /activity, decision ${id8}`,
    '---',
    `# Eric: ${label}: ${title}`,
    '',
    `**Eric's answer** (tapped on Mission Control /activity, ${etStamp(d.created_at)} ET; his own choice, not a relay): ${what}`,
    '',
    `Asked by: ${scrub(d.item_bot, 60) || 'Bot'}. Item: ${title}`,
    ...(reply ? ['', '> ' + reply.replace(/\n+/g, '\n> ')] : []),
    '',
  ];
  const text = lines.join('\n');
  // The body must pass the same leak test as the page. The re: path is a
  // brain filename, outside the test, and is checked by the caller's routing.
  const body = lines.filter((l) => !l.startsWith('re: ')).join('\n');
  if (textLeaks(body).length) return null;

  return { path: `channel/${dir}/${day}-eric-activity-${d.choice.replace('_', '-')}-${id8}.md`, text };
}

/** The open/decisions.tsv row for a drop (R-163). Tabs and newlines can never appear inside a field. */
export function decisionsTsvRow(d: DecisionRow, notePath: string | null): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();
  const id8 = d.id.replace(/-/g, '').slice(0, 8);
  return [
    etDate(d.created_at),
    `activity:${id8}`,
    clean(scrub(d.item_title, 120) || 'Item'),
    'Drop',
    clean('Dropped by Eric on Mission Control /activity. Stays dropped (R-163) unless Eric brings it back.'),
    notePath ?? '-',
  ].join('\t');
}
