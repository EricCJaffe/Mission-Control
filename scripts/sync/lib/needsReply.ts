/*
 * "Who is waiting on me?"
 *
 * That is the only question mission.inbox_items exists to answer, so this is
 * the only judgement the mail sync makes. It is kept pure and in its own file
 * because it is the part that will be wrong at first: every heuristic here is
 * a guess about a real mailbox, and tuning a guess is only pleasant when it
 * can be tuned against tests rather than against a live Inbox.
 *
 * The bias is deliberate. A false positive costs one glance at a list; a false
 * negative is a client who has been waiting three days and does not appear
 * anywhere. So each signal below has to be *positively* true before it
 * suppresses a message — an absent header, an unparseable address and an
 * unknown conversation all leave the message flagged.
 *
 * Every signal is an exported constant. When a newsletter slips through, the
 * fix should be adding a word to a list at the top of a file, not reading
 * seventy lines of branching to work out where the word would go.
 */

/*
 * Ours. Anything from these is a colleague, and a colleague chasing something
 * does it in Teams — mirroring internal mail into a personal task list mostly
 * reproduces the company's own threads.
 *
 * `ema.org` is Every Mother's Advocate, which sends from its own domain but is
 * inside the working relationship rather than outside it.
 */
/*
 * Eric's own company. Mail from a colleague here is usually context rather
 * than a request, and suppressing it is what keeps "who is waiting on you"
 * short enough to read.
 *
 * `ema.org` USED TO BE ON THIS LIST and should not be. It is Every Mother's
 * Advocate — a client, not an employer — and Eric merely holds an account
 * there. The first run against real mail proved the cost: michelle@ema.org
 * asking "I do not see an invoice attached, can you please forward it again?"
 * was classified internal and would never have surfaced. A partner domain is
 * exactly where an unanswered ask does the most damage.
 *
 * Colleagues, not collaborators. If a domain pays Eric or is paid by him, it
 * belongs on the other side of this line.
 */
export const INTERNAL_DOMAINS: readonly string[] = ['foundationstoneadvisors.com'];

/*
 * Headers that only ever appear on machine-generated mail.
 *
 * `List-Unsubscribe` is the strongest single signal in a mailbox — bulk
 * senders are required to set it and humans never do. The others catch the
 * autoresponders and vacation replies that carry no unsubscribe link.
 */
export const AUTOMATED_HEADERS: readonly string[] = [
  'list-unsubscribe',
  'list-id',
  'auto-submitted',
  'x-auto-response-suppress',
  'x-autoreply',
  'precedence',
];

/*
 * `Precedence` is the exception: it is a real header on real mail, and only
 * these three values mean "do not reply to this".
 */
export const AUTOMATED_PRECEDENCE_VALUES: readonly string[] = ['bulk', 'list', 'junk', 'auto_reply'];

/*
 * Sender local-parts that announce a robot.
 *
 * Matched against the local-part with `.`, `-`, `_` and any `+tag` stripped,
 * so `no-reply`, `no_reply`, `noreply+7f3a` and `bounces-4501` all collapse
 * onto the same token. Substring rather than equality, because bounce and
 * notification addresses habitually append a per-message id.
 */
export const AUTOMATED_LOCALPART_TOKENS: readonly string[] = [
  'noreply',
  'donotreply',
  'mailerdaemon',
  'postmaster',
  'notification',
  'notifications',
  'bounce',
  'bounces',
  'automailer',
  'autoreply',
];

/*
 * Meeting responses. Graph types these on the resource itself, which is exact;
 * the subject prefixes are the fallback for a forwarded or re-sent response
 * that has lost its type. Note `eventMessageRequest` is *not* here — an
 * invitation from outside genuinely is waiting on an answer.
 */
export const CALENDAR_ODATA_TYPES: readonly string[] = [
  '#microsoft.graph.eventMessageResponse',
];

export const CALENDAR_SUBJECT_RE = /^\s*(accepted|declined|tentative|cancell?ed|updated):\s/i;

export type MailMessage = {
  id: string;
  /** Graph's thread key. Null means we cannot tell, and that never suppresses. */
  conversationId: string | null;
  /** Sender address, e.g. `jane@client.com`. */
  from: string | null;
  receivedAt: string;
  subject: string | null;
  /** Graph's `@odata.type` when it was selected; absent is fine. */
  odataType?: string | null;
  /** Only present when `internetMessageHeaders` was requested and returned. */
  headers?: readonly { name: string; value: string }[] | null;
};

export type ReplyContext = {
  /** MS_MAILBOX, the account being read. */
  mailbox: string;
  /**
   * Latest moment the owner sent anything into each conversation, ISO. Built
   * from Sent Items over the same window by `ownerRepliesByConversation`.
   */
  ownerLastSentAt: ReadonlyMap<string, string>;
};

/** Lower-cased domain of an address, or null when there is nothing parseable. */
export function domainOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const at = address.lastIndexOf('@');
  if (at < 0 || at === address.length - 1) return null;
  return address.slice(at + 1).trim().toLowerCase() || null;
}

export function isInternalDomain(domain: string | null): boolean {
  if (!domain) return false;
  // Subdomains count: mail.foundationstoneadvisors.com is still us.
  return INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function localPartOf(address: string): string {
  const at = address.lastIndexOf('@');
  const local = at < 0 ? address : address.slice(0, at);
  return local.split('+')[0].replace(/[.\-_]/g, '').toLowerCase();
}

export function isAutomatedSender(address: string | null): boolean {
  if (!address) return false;
  const local = localPartOf(address);
  if (!local) return false;
  return AUTOMATED_LOCALPART_TOKENS.some((token) => local.includes(token));
}

export function hasAutomatedHeader(headers: MailMessage['headers']): boolean {
  if (!headers) return false;
  for (const header of headers) {
    const name = header.name?.toLowerCase() ?? '';
    if (name === 'precedence') {
      if (AUTOMATED_PRECEDENCE_VALUES.includes((header.value ?? '').trim().toLowerCase())) return true;
      continue;
    }
    if (AUTOMATED_HEADERS.includes(name)) return true;
  }
  return false;
}

export function isCalendarResponse(message: MailMessage): boolean {
  if (message.odataType && CALENDAR_ODATA_TYPES.includes(message.odataType)) return true;
  return CALENDAR_SUBJECT_RE.test(message.subject ?? '');
}

export function isAutomated(message: MailMessage): boolean {
  return (
    hasAutomatedHeader(message.headers) ||
    isAutomatedSender(message.from) ||
    isCalendarResponse(message)
  );
}

/*
 * Whether this message is still waiting on Eric.
 *
 * The last clause is the one that does the real work: a thread where he has
 * already written back after the message arrived is finished, whatever the
 * message itself looks like. Comparing against the *whole conversation* rather
 * than against the single newest message is what stops a five-mail thread
 * generating five obligations for one reply.
 */
export function needsReply(message: MailMessage, ctx: ReplyContext): boolean {
  const mailbox = ctx.mailbox.trim().toLowerCase();
  const from = message.from ? message.from.trim().toLowerCase() : null;

  // Notes to self, calendar confirmations he BCC'd himself on, forwards from
  // his phone. They arrive in the Inbox and nobody is waiting on them.
  if (from && from === mailbox) return false;

  if (!isExternalSender(from)) return false;
  if (isAutomated(message)) return false;

  if (message.conversationId) {
    const repliedAt = ctx.ownerLastSentAt.get(message.conversationId);
    // Strictly later: a reply and the message it answers can share a second,
    // and in that order the reply is still the reply.
    if (repliedAt && Date.parse(repliedAt) >= Date.parse(message.receivedAt)) return false;
  }

  return true;
}

/*
 * Unparseable senders count as external.
 *
 * Graph occasionally hands back a message with no `from` at all — a draft
 * synced up from a phone, or a report from a gateway. Treating that as
 * internal would hide it; treating it as external puts it in a list a person
 * reads, which is the recoverable direction.
 */
export function isExternalSender(address: string | null): boolean {
  return !isInternalDomain(domainOf(address));
}

/*
 * Fold Sent Items into "the last time I wrote into this thread".
 *
 * Only the newest per conversation is kept, because that is the only one the
 * comparison above asks about.
 */
export function ownerRepliesByConversation(
  sent: readonly { conversationId: string | null; sentAt: string | null }[],
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const item of sent) {
    if (!item.conversationId || !item.sentAt) continue;
    const prior = latest.get(item.conversationId);
    if (!prior || Date.parse(item.sentAt) > Date.parse(prior)) {
      latest.set(item.conversationId, item.sentAt);
    }
  }
  return latest;
}
