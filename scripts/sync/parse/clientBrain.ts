/*
 * Reading the client brains: `clients/_ownership.md` and `clients/<slug>/`.
 *
 * ─── The rule this file exists to enforce ──────────────────────────────────
 *
 * `_ownership.md` is authoritative and everything else is subordinate to it.
 * Its own opening says so — "This file overrides anything inferred from the
 * mailbox" — and it was written because five separate analyses in one evening
 * read correspondence as state: an account a partner owned looked lapsed,
 * equity looked like a client relationship, finished work looked abandoned, a
 * deliberate wind-down looked like decline, and a personal relationship looked
 * like a lead.
 *
 * So `owner` and `ericRole` are read from that file and from no other. A
 * profile.md may not contribute an owner even when it names one, because
 * profile.md is written by a job reading mail and `_ownership.md` is written by
 * Eric. Where the two disagree, the disagreement is the finding.
 *
 * ─── What is deliberately not read ─────────────────────────────────────────
 *
 * The bodies. Only a status line, a date, a file list and a heading come out of
 * `clients/<slug>/`. `clients/blue-sky-day/people.md` carries a section marked
 * "never automate" — a contact's father is fighting cancer, recorded so Eric
 * remembers to pray for him, with an explicit instruction that it must never
 * appear in a briefing or any generated output. A parser that pulled prose
 * "for context" would put that on a dashboard. The files stay in git.
 */

import { plainText } from './inline.ts';

/** An account as `_ownership.md` records it. */
export type OwnershipEntry = {
  /** The account name exactly as the file writes it, parentheticals stripped. */
  account: string;
  owner: string | null;
  ericRole: string | null;
  /** Normalised for matching against a folder name. */
  key: string;
};

export type ClientBrain = {
  slug: string;
  name: string;
  status: string | null;
  owner: string | null;
  ericRole: string | null;
  ownershipGoverned: boolean;
  lastContactOn: string | null;
  files: string[];
  hasProposed: boolean;
  hasFolder: boolean;
};

const plain = plainText;

/*
 * A folder-name-shaped key for an account name.
 *
 * `+` becomes `plus` before punctuation is stripped, which is the whole reason
 * "A+ Environmental" can find the `aplus` folder — drop the plus first and it
 * normalises to `a-environmental`, which matches nothing.
 */
export function ownershipKey(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\+/g, 'plus')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/*
 * Whether an account name refers to a folder.
 *
 * Equality, or a prefix that ends on a segment boundary: `blue-sky-day-co`
 * belongs to `blue-sky-day`, and `aplus-environmental` to `aplus`. The boundary
 * matters — without it `eden` would claim an `eden-something-else` folder, and
 * attributing an owner to the wrong account is exactly the failure
 * `_ownership.md` was written to stop.
 */
function keyMatchesSlug(key: string, slug: string): boolean {
  return key === slug || key.startsWith(`${slug}-`) || slug.startsWith(`${key}-`);
}

/**
 * The ownership table.
 *
 * Only the table is read. The prose beneath it is where the corrections are
 * argued, and it is written for a person — summarising it mechanically is how
 * "deliberately winding down" turns into "declining", which is the misreading
 * the file exists to prevent. The page links to the file instead.
 */
export function parseOwnership(source: string): OwnershipEntry[] {
  const entries: OwnershipEntry[] = [];
  let inTable = false;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      // Blank lines inside a table do not occur; anything non-pipe ends it.
      if (trimmed !== '') inTable = false;
      continue;
    }

    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^\s*:?-+:?\s*$/.test(c))) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (cells.length < 3) continue;

    const account = plain(cells[0]).replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!account || /^account$/i.test(account)) continue;

    entries.push({
      account,
      owner: plain(cells[1]) || null,
      ericRole: plain(cells[2]) || null,
      key: ownershipKey(plain(cells[0])),
    });
  }

  return entries;
}

/**
 * The entry governing a folder, or null.
 *
 * Ambiguity is refused rather than guessed: two accounts matching one folder
 * yields no owner at all, which reads as "not stated" and sends you to the
 * file. A confidently wrong owner is worse than a blank.
 */
export function ownershipFor(entries: OwnershipEntry[], slug: string): OwnershipEntry | null {
  const matches = entries.filter((e) => keyMatchesSlug(e.key, slug));
  return matches.length === 1 ? matches[0] : null;
}

/*
 * The engagement status, as profile.md states it.
 *
 * The corpus writes it four ways — `**Engagement status: \`active\`.**`,
 * `**Engagement status:** \`active-delegated\``, a `## Engagement status`
 * heading followed by the value on the next line, and "\`active\`, and
 * deliberately winding down" — so the label and the value are found separately
 * and the whole remainder of the sentence is kept.
 *
 * That last one is why this returns free text. Flattening it to `active` would
 * throw away the only word about that relationship that changes what anyone
 * should do: Shilo Barker is being wound down on purpose, and an agent that
 * reads the status as plain `active` will eventually propose re-engaging.
 */
export function parseStatus(profile: string): string | null {
  const lines = profile.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/engagement status/i.test(lines[i])) continue;

    // Same line, after the colon; or the next non-empty line when the label is
    // a heading of its own.
    const after = lines[i].replace(/^.*engagement status:?\**/i, '').trim();
    const candidate = after || lines.slice(i + 1).find((l) => l.trim() !== '') || '';

    const value = plain(candidate).replace(/^[\s:—-]+/, '').trim();
    if (!value) continue;

    // Keep the qualification, drop the paragraph that follows it. The status is
    // the clause, not the essay — and the sentence break has to be found before
    // the trailing full stop is removed, or the two rules cancel out and the
    // status arrives as "active." with the period attached.
    const clause = value
      .split(/(?<=[.。])\s|\s—\s/)[0]
      .replace(/[.\s]+$/, '')
      .trim();
    if (!clause) continue;
    return clause.length > 120 ? clause.slice(0, 120) : clause;
  }
  return null;
}

/**
 * "Last meaningful exchange **2026-09-07**", where profile.md states one.
 *
 * Never falls back to a file mtime. An mtime says when a job last ran, and
 * presenting that as contact would report the agent's activity as the
 * relationship's — the same category error `_ownership.md` corrects.
 */
export function parseLastContact(profile: string): string | null {
  const m = profile.match(/last meaningful (?:exchange|contact)[^\d]{0,20}(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : null;
}

/** The document's own title, minus the "— profile" suffix convention. */
export function parseDisplayName(markdown: string): string | null {
  const m = markdown.match(/^#\s+(.+)$/m);
  if (!m) return null;
  return plain(m[1]).replace(/\s*[—-]\s*(client\s+)?(profile|people|history)\s*$/i, '').trim() || null;
}
