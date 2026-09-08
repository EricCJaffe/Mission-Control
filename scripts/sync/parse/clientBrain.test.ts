/*
 * Parsing the client brains.
 *
 * Most of these are regression tests for a specific wrong answer. The brain
 * repo records five misreadings that all happened in one evening, each caused
 * by treating correspondence as state, and the fixtures below are the shapes
 * that caused them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownershipFor,
  ownershipKey,
  parseDisplayName,
  parseLastContact,
  parseOwnership,
  parseStatus,
} from './clientBrain.ts';

const OWNERSHIP = `# Who owns which relationship

Recorded 2026-09-07 from Eric directly. **This file overrides anything inferred
from the mailbox.**

| Account | Day-to-day owner | Eric's role |
|---|---|---|
| **Blue Sky Day Co** (Daniel Barousse) | **Tyler** — primary contact | Relationship, not delivery |
| **VakPak** | **Tyler and Joey** run point | Oversight |
| **JW Supply** | **Tyler and Joey** | Client **and** part-owner |
| **A+ Environmental** | Joey, Tyler | Oversight |
| **Shilo Barker** | **Eric** personally | Finances and direction — **winding down** |

## Blue Sky Day is active, not a lapsed lead

The sweep ranked it the **best re-engagement prospect**. That reading is wrong.
`;

const entries = parseOwnership(OWNERSHIP);

test('reads the ownership table and stops at the prose', () => {
  assert.deepEqual(entries.map((e) => e.account), [
    'Blue Sky Day Co',
    'VakPak',
    'JW Supply',
    'A+ Environmental',
    'Shilo Barker',
  ]);
});

test('keeps the owner and the role as the file words them', () => {
  const shilo = entries.find((e) => e.account === 'Shilo Barker');
  assert.equal(shilo?.owner, 'Eric personally');
  assert.equal(shilo?.ericRole, 'Finances and direction — winding down');
});

test('a parenthetical contact is not part of the account name', () => {
  const bsd = entries.find((e) => e.account === 'Blue Sky Day Co');
  assert.ok(bsd, 'Blue Sky Day Co should not be named "Blue Sky Day Co (Daniel Barousse)"');
});

test('a plus sign survives normalisation as "plus"', () => {
  // "A+ Environmental" lives in clients/aplus/. Strip the plus as punctuation
  // and it normalises to `a-environmental`, which matches no folder at all.
  assert.equal(ownershipKey('A+ Environmental'), 'aplus-environmental');
  assert.equal(ownershipFor(entries, 'aplus')?.account, 'A+ Environmental');
});

test('a suffixed account name still finds its folder', () => {
  assert.equal(ownershipFor(entries, 'blue-sky-day')?.account, 'Blue Sky Day Co');
  assert.equal(ownershipFor(entries, 'vakpak')?.account, 'VakPak');
});

test('an account with no folder matches nothing rather than the nearest thing', () => {
  assert.equal(ownershipFor(entries, 'honey-lake'), null);
  assert.equal(ownershipFor(entries, 'eden'), null);
});

test('an ambiguous match yields no owner at all', () => {
  // Two accounts claiming one folder is not a reason to pick one. A confidently
  // wrong owner is the exact failure _ownership.md exists to prevent, and a
  // blank sends you to the file.
  const ambiguous = parseOwnership(`| Account | Owner | Role |
|---|---|---|
| Acme | Tyler | Oversight |
| Acme Holdings | Joey | Oversight |
`);
  assert.equal(ownershipFor(ambiguous, 'acme'), null);
});

test('reads the inline status form', () => {
  assert.equal(
    parseStatus('# Honey Lake Clinic — profile\n\n**Engagement status: `active`.** Last meaningful exchange **2026-09-07** — Chad\n'),
    'active',
  );
});

test('reads the colon-outside-bold form', () => {
  assert.equal(
    parseStatus('# Vak Pak — client profile\n\n**Engagement status:** `active-delegated`\n\nTyler runs it.\n'),
    'active-delegated',
  );
});

test('reads the heading form, where the value is on a later line', () => {
  const ema = `# Every Mother's Advocate (ĒMA) — client profile

## Engagement status

**\`active\`.** Last meaningful exchange **2026-09-07** — Eric sent RD an agenda.
`;
  assert.equal(parseStatus(ema), 'active');
});

test('keeps the qualification that changes what anyone should do', () => {
  // Flattening this to `active` deletes the only word that matters: the
  // relationship is being wound down on purpose, and an agent reading a plain
  // `active` will eventually propose re-engaging.
  const shilo = '# Shilo Barker — profile\n\n**Engagement status: `active`, and deliberately winding down** (Eric, 2026-09-07).\n';
  assert.match(parseStatus(shilo) ?? '', /winding down/);
});

test('a profile with no status line yields null, not a guess', () => {
  assert.equal(parseStatus('# Blue Sky Day Co — people\n\nDaniel Barousse — Principal\n'), null);
  assert.equal(parseStatus(''), null);
});

test('last contact comes from the stated date or not at all', () => {
  assert.equal(
    parseLastContact('**Engagement status: `sporadic`** — last meaningful exchange **2026-08-03**.'),
    '2026-08-03',
  );
  // No date stated is null. It is never back-filled from a file mtime, which
  // would report when a job last ran rather than when Eric last spoke to anyone.
  assert.equal(parseLastContact('**Engagement status: `active`**\n\nEric is personally in this one.'), null);
});

test('the display name drops the document-type suffix', () => {
  assert.equal(parseDisplayName('# A+ Environmental — client profile\n'), 'A+ Environmental');
  assert.equal(parseDisplayName('# Blue Sky Day Co — people\n'), 'Blue Sky Day Co');
  assert.equal(parseDisplayName('# Honey Lake Clinic — history\n'), 'Honey Lake Clinic');
  assert.equal(parseDisplayName('# Church Search\n'), 'Church Search');
  assert.equal(parseDisplayName('no heading here'), null);
});
