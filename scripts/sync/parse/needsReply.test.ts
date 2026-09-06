/*
 * Tests for the needs_reply heuristic. Run with `npm run test:sync`.
 *
 * The cases are shaped around the two ways this can be wrong, which are not
 * equally bad. A newsletter that slips into the list is a nuisance; a real
 * client message that gets suppressed is invisible, and nothing downstream
 * will ever surface it again. So every suppressing signal is tested for the
 * thing it must *not* catch as well as for the thing it must.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  needsReply,
  isAutomated,
  isExternalSender,
  domainOf,
  ownerRepliesByConversation,
  type MailMessage,
  type ReplyContext,
} from '../lib/needsReply.ts';

const MAILBOX = 'eric@foundationstoneadvisors.com';

function ctx(ownerSent: Record<string, string> = {}): ReplyContext {
  return { mailbox: MAILBOX, ownerLastSentAt: new Map(Object.entries(ownerSent)) };
}

function message(over: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'AAMk-1',
    conversationId: 'conv-1',
    from: 'jane@clientco.com',
    receivedAt: '2026-09-04T14:00:00Z',
    subject: 'Can you look at the draft engagement letter?',
    ...over,
  };
}

test('an external human asking a question needs a reply', () => {
  assert.equal(needsReply(message(), ctx()), true);
});

test('colleagues do not, including from a subdomain', () => {
  assert.equal(needsReply(message({ from: 'katie@foundationstoneadvisors.com' }), ctx()), false);
  assert.equal(needsReply(message({ from: 'alerts@mail.foundationstoneadvisors.com' }), ctx()), false);
});

test('a client is not a colleague', () => {
  // ema.org was on the internal list until the first run against real mail,
  // where michelle@ema.org asking for an invoice to be re-sent was classified
  // internal and silently dropped. Eric holds an account there; it is still a
  // client, and a partner domain is where an unanswered ask costs most.
  assert.equal(needsReply(message({ from: 'michelle@ema.org' }), ctx()), true);
  assert.equal(needsReply(message({ from: 'rd@ema.org' }), ctx()), true);
});

test('a lookalike domain is still external', () => {
  // The suffix check must not match on a bare substring: notfoundationstone-
  // advisors.com ends with the same letters and is somebody else entirely.
  assert.equal(isExternalSender('someone@notfoundationstoneadvisors.com'), true);
  assert.equal(isExternalSender('someone@ema.org.example.net'), true);
});

test('mail the owner sent to himself is not an obligation', () => {
  // Forwards from his phone and BCC'd confirmations land in the Inbox.
  assert.equal(needsReply(message({ from: MAILBOX }), ctx()), false);
});

test('a List-Unsubscribe header settles it, whoever sent it', () => {
  const newsletter = message({
    from: 'editor@substack.example',
    headers: [{ name: 'List-Unsubscribe', value: '<https://example/u/1>' }],
  });
  assert.equal(needsReply(newsletter, ctx()), false);
});

test('Precedence only suppresses on the values that mean bulk', () => {
  const bulk = message({ headers: [{ name: 'Precedence', value: 'bulk' }] });
  assert.equal(isAutomated(bulk), true);
  // `Precedence: normal` appears on ordinary mail from several clients.
  const normal = message({ headers: [{ name: 'Precedence', value: 'normal' }] });
  assert.equal(isAutomated(normal), false);
});

test('robot local-parts are caught through their punctuation and tags', () => {
  const forms = [
    'noreply@bank.example',
    'no-reply@bank.example',
    'no_reply@bank.example',
    'DoNotReply@bank.example',
    'MAILER-DAEMON@bank.example',
    'notifications@github.example',
    'bounces-4501-x@sendgrid.example',
    'noreply+7f3a@bank.example',
  ];
  for (const from of forms) {
    assert.equal(needsReply(message({ from }), ctx()), false, from);
  }
});

test('a person whose name contains no robot word survives', () => {
  for (const from of ['reply.chen@clientco.com', 'noel@clientco.com', 'bonnie@clientco.com']) {
    assert.equal(needsReply(message({ from }), ctx()), true, from);
  }
});

test('meeting responses are noise; an invitation is not', () => {
  const accepted = message({ odataType: '#microsoft.graph.eventMessageResponse' });
  assert.equal(needsReply(accepted, ctx()), false);

  // Same thing after a forward has lost the type.
  const forwarded = message({ subject: 'Declined: Quarterly review' });
  assert.equal(needsReply(forwarded, ctx()), false);

  // An invitation from outside genuinely wants an answer.
  const invite = message({
    odataType: '#microsoft.graph.eventMessageRequest',
    subject: 'Board sync — Thursday',
  });
  assert.equal(needsReply(invite, ctx()), true);
});

test('a reply already sent into the thread closes it', () => {
  const answered = ctx({ 'conv-1': '2026-09-04T16:30:00Z' });
  assert.equal(needsReply(message(), answered), false);
});

test('a reply older than the message does not close it', () => {
  // He answered on Tuesday; she came back on Thursday. Still his move.
  const stale = ctx({ 'conv-1': '2026-09-02T09:00:00Z' });
  assert.equal(needsReply(message(), stale), true);
});

test('a reply in a different thread closes nothing', () => {
  assert.equal(needsReply(message(), ctx({ 'conv-other': '2026-09-05T09:00:00Z' })), true);
});

test('an unknown conversation leaves the message flagged', () => {
  // Sent Items only covers the same fortnight, so an older thread has no entry.
  // Silence there must not be read as "already answered".
  assert.equal(needsReply(message({ conversationId: null }), ctx()), true);
});

test('an unparseable sender stays visible rather than being hidden', () => {
  assert.equal(domainOf('not-an-address'), null);
  assert.equal(domainOf(null), null);
  assert.equal(needsReply(message({ from: null }), ctx()), true);
});

test('ownerRepliesByConversation keeps only the newest per thread', () => {
  const map = ownerRepliesByConversation([
    { conversationId: 'a', sentAt: '2026-09-01T10:00:00Z' },
    { conversationId: 'a', sentAt: '2026-09-03T10:00:00Z' },
    { conversationId: 'a', sentAt: '2026-09-02T10:00:00Z' },
    { conversationId: 'b', sentAt: '2026-09-01T10:00:00Z' },
    { conversationId: null, sentAt: '2026-09-09T10:00:00Z' },
    { conversationId: 'c', sentAt: null },
  ]);
  assert.equal(map.get('a'), '2026-09-03T10:00:00Z');
  assert.equal(map.get('b'), '2026-09-01T10:00:00Z');
  assert.equal(map.size, 2);
});
