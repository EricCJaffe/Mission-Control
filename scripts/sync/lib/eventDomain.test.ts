/*
 * Category → domain, and the rule that a hand-set domain stays put.
 * Run with `npm run test:sync`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTLOOK_CATEGORY_DOMAINS,
  domainAssignment,
  domainFromTitle,
  resolveEventDomain,
} from './eventDomain.ts';

test('the category map is the one list, and each name lands on its domain', () => {
  const expected: Record<string, string> = {
    Spirit: 'spirit',
    'God First': 'spirit',
    God: 'spirit',
    Health: 'body',
    Body: 'body',
    Soul: 'soul',
    Family: 'family',
    Impact: 'work',
    Work: 'work',
  };
  for (const [name, domain] of Object.entries(expected)) {
    assert.equal(resolveEventDomain({ categories: [name] }), domain, name);
  }
  const listed = Object.values(OUTLOOK_CATEGORY_DOMAINS).flat();
  assert.deepEqual(listed.slice().sort(), Object.keys(expected).sort());
});

test('categories match after trim, ignoring case', () => {
  assert.equal(resolveEventDomain({ categories: ['  family  '] }), 'family');
  assert.equal(resolveEventDomain({ categories: ['GOD FIRST'] }), 'spirit');
  assert.equal(resolveEventDomain({ categories: ['  HeAlTh '] }), 'body');
});

test('the first recognised category wins, and an unknown one is skipped', () => {
  assert.equal(resolveEventDomain({ categories: ['Work', 'Family'] }), 'work');
  assert.equal(resolveEventDomain({ categories: ['Blue category', 'Family'] }), 'family');
  assert.equal(resolveEventDomain({ categories: ['', '   ', 'Soul'] }), 'soul');
});

test('an unknown category falls back to the title rules, then to work', () => {
  assert.equal(resolveEventDomain({ categories: ['Blue category'], title: 'Back and Bicep' }), 'body');
  assert.equal(resolveEventDomain({ categories: ['Blue category'], title: 'Exercise' }), 'body');
  assert.equal(resolveEventDomain({ categories: ['Blue category'], title: 'sell crypto' }), 'work');
  assert.equal(domainFromTitle('Prep the board deck'), 'work');
  assert.equal(domainFromTitle('Lunch with Mary Jo'), null);
  assert.equal(resolveEventDomain({ categories: ['Blue category'], title: 'Lunch with Mary Jo' }), 'work');
  assert.equal(resolveEventDomain({ categories: [], title: 'Focus block' }), 'work');
});

test('a recognised category beats a title that would say something else', () => {
  assert.equal(resolveEventDomain({ categories: ['Family'], title: 'Exercise' }), 'family');
});

test('a hand-set domain is not overwritten, and a sync-set one is', () => {
  const resolved = resolveEventDomain({ categories: ['Family'], title: 'RV trip' });
  assert.equal(resolved, 'family');
  assert.equal(domainAssignment(resolved, { domain: 'work', origin: 'hand' }).writeDomain, false);
  assert.deepEqual(domainAssignment(resolved, { domain: 'work', origin: 'sync' }), {
    writeDomain: true,
    domain: 'family',
    origin: 'sync',
  });
});

test('a domain with no recorded origin is left alone, and an insert is written', () => {
  assert.equal(domainAssignment('family', { domain: 'work', origin: null }).writeDomain, false);
  assert.deepEqual(domainAssignment('family', null), {
    writeDomain: true,
    domain: 'family',
    origin: 'sync',
  });
});
