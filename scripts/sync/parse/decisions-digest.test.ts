import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDigest, type DigestRow } from './decisions-digest.ts';
import { verifyLinkToken } from '../../../src/lib/decisions/link-token.ts';

const SECRET = 'k'.repeat(48);
const NOW = new Date('2026-10-30T21:00:00Z');
const row = (over: Partial<DigestRow>): DigestRow => ({
  id: '0f8e2c1a-7b3d-4e5f-9a6b-1c2d3e4f5a6b',
  kind: 'decision',
  title: 'Ship the thing?',
  context: 'Context line.',
  options: [{ id: 'o1', label: 'Yes' }, { id: 'o2', label: 'No' }],
  default_option: 'o1',
  urgency: 'yellow',
  deadline: null,
  status: 'open',
  created_at: '2026-10-29T12:00:00Z',
  ...over,
});
const opts = { appUrl: 'https://mc.example.test/', secret: SECRET, now: NOW };

test('nothing open, no digest', () => {
  assert.equal(renderDigest([], opts), null);
  assert.equal(renderDigest([row({ status: 'answered' }), row({ status: 'withdrawn' })], opts), null);
});

test('every option is a signed link to its own decision and option', () => {
  const d = renderDigest([row({}), row({ id: '1f8e2c1a-7b3d-4e5f-9a6b-1c2d3e4f5a6b', urgency: 'red', options: [{ id: 'o3', label: 'Close' }] })], opts)!;
  assert.equal(d.links, 3);
  assert.equal(d.subject, 'Decisions waiting: 2, 1 red');
  const tokens = [...d.html.matchAll(/https:\/\/mc\.example\.test\/decisions\/a\/([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  assert.equal(tokens.length, 3);
  const claims = tokens.map((t) => {
    const v = verifyLinkToken(t, SECRET, NOW);
    assert.ok(v.ok);
    return v.ok ? `${v.claims.id.slice(0, 2)}:${v.claims.answer}` : '';
  });
  // Red sorts first.
  assert.deepEqual(claims, ['1f:o3', '0f:o1', '0f:o2']);
});

test('text is escaped, and the colors say red/yellow/green on both attribute and style', () => {
  const d = renderDigest([row({ title: '<script>x</script> & "q"', urgency: 'green' })], opts)!;
  assert.ok(!d.html.includes('<script>x'));
  assert.ok(d.html.includes('&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;'));
  assert.ok(d.html.includes('bgcolor="#dcfce7" style="background-color:#dcfce7'));
  assert.ok(!/amber/i.test(d.html));
});

test('no secret, no digest: it refuses rather than send dead links', () => {
  assert.throws(() => renderDigest([row({})], { ...opts, secret: undefined }));
});

test('leads with a prominent Open Decisions button and deep-links each item', () => {
  const r = row({});
  const out = renderDigest([r], opts)!;
  const first = out.html.indexOf('Open Decisions (1 waiting)');
  assert.ok(first > 0 && first < out.html.indexOf(r.title), 'button comes before the first item');
  assert.ok(out.html.includes('href="https://mc.example.test/decisions"'));
  assert.ok(out.html.includes(`https://mc.example.test/decisions#d-${r.id}`));
});
