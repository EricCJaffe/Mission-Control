/*
 * The rules that split one inbox across four paying entities.
 *
 * The case that drove this file: from 2026-09-06 both Anthropic
 * subscriptions — FSA's Max plan and 4LOT's — arrive at the same address, so
 * any test that relies on the recipient is testing a signal that no longer
 * exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attribute } from './entities.ts';

test('the Stripe invoice series decides, not the mailbox', () => {
  const a = attribute({ vendor: 'Anthropic, PBC', invoiceNumber: '3JOCFJ20-0011' });
  assert.equal(a.entity, 'fsa');
  assert.equal(a.basis, 'invoice-series');
});

test('two Anthropic accounts are told apart by series, not by vendor', () => {
  const max = attribute({ vendor: 'Anthropic, PBC', invoiceNumber: '3JOCFJ20-0009' });
  const other = attribute({ vendor: 'Anthropic, PBC', invoiceNumber: 'ZZTOPQ11-0003' });
  assert.equal(max.entity, 'fsa');
  // The unknown one must NOT inherit FSA just because the vendor matches.
  assert.equal(other.entity, null);
  assert.match(other.reason, /likely 4LOT/);
});

test('an unknown vendor is left blank rather than guessed', () => {
  const r = attribute({ vendor: 'Some Shop LLC' });
  assert.equal(r.entity, null);
  assert.equal(r.basis, 'unallocated');
});

test('the organisation named on a Microsoft invoice attributes it', () => {
  const r = attribute({ vendor: 'Microsoft', accountName: 'foundationstoneadvisors.com' });
  assert.equal(r.entity, 'fsa');
  assert.equal(r.basis, 'account-name');
});

test('a 4LOT-named invoice lands on 4LOT', () => {
  const r = attribute({ vendor: 'Microsoft', accountName: '4LOT / For The Least Of These' });
  assert.equal(r.entity, '4lot');
});

test('the invoice series outranks the vendor default', () => {
  // Bitwarden's series says personal even though the vendor looks like tooling.
  const r = attribute({ vendor: 'Bitwarden Inc.', invoiceNumber: '8A28EB5A-0005' });
  assert.equal(r.entity, 'personal');
  assert.equal(r.basis, 'invoice-series');
});

test('consumer subscriptions fall to personal by vendor', () => {
  assert.equal(attribute({ vendor: 'Apple (iCloud+)' }).entity, 'personal');
  assert.equal(attribute({ vendor: 'State Farm' }).entity, 'personal');
});

test('every attribution carries an auditable reason', () => {
  for (const facts of [
    { vendor: 'Anthropic, PBC', invoiceNumber: '3JOCFJ20-0011' },
    { vendor: 'Nothing Known' },
  ]) {
    const r = attribute(facts);
    assert.ok(r.reason.length > 0, 'reason must never be empty');
  }
});

test('Journey Church is attributed from the tenant on its Microsoft invoice', () => {
  // The 2026-05-02 Microsoft 365 Business Standard invoice really does name
  // Journeychurch.org, which is why the church is a paying entity at all.
  const r = attribute({ vendor: 'Microsoft 365', accountName: 'Journeychurch.org' });
  assert.equal(r.entity, 'journey');
  assert.equal(r.basis, 'account-name');
});

test('the five entities are exactly the ones reconciled monthly', async () => {
  const { ENTITIES, ENTITY_LABEL } = await import('./entities.ts');
  assert.deepEqual([...ENTITIES], ['fsa', '4lot', 'integrity', 'journey', 'personal']);
  for (const e of ENTITIES) assert.ok(ENTITY_LABEL[e], `${e} needs a label`);
});

test('a rebilled domain stays an FSA cost and carries the receivable', () => {
  // Eric pays the ahavaekklesia.com domain and bills it on. It is his expense
  // with a receivable attached — not somebody else's cost to be excluded.
  const r = attribute({
    vendor: 'GoDaddy',
    description: 'Conversations Deluxe - Renewal, ahavaekklesia.com',
  });
  assert.equal(r.entity, 'fsa');
  assert.equal(r.rebillTo, 'Ahava Ekklesia Inc');
  assert.match(r.reason, /billed on to/);
});

test('the rebill check runs before vendor defaults so it cannot be misfiled', () => {
  // Apple would otherwise fall to personal by vendor default.
  const r = attribute({ vendor: 'Apple', description: 'renewal for ahavaekklesia.com' });
  assert.equal(r.rebillTo, 'Ahava Ekklesia Inc');
  assert.equal(r.entity, 'fsa');
});

test('an ordinary receipt carries no rebill marker', () => {
  const r = attribute({ vendor: 'Vercel Inc.', invoiceNumber: 'O85LRNWQ-0009' });
  assert.equal(r.rebillTo, undefined);
});
