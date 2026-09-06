/*
 * Which entity paid for what.
 *
 * Eric's receipts arrive for five paying entities: Foundation Stone Advisors,
 * For The Least Of These (4LOT), Integrity IT Solutions, Journey Church of
 * Clay County, and himself. The
 * monthly reconciliation has to split them, and getting it wrong moves money
 * between a business and a ministry, so the rules here are deliberately
 * conservative.
 *
 * THE ONE RULE THAT MATTERS: attribution is keyed on something INTRINSIC to
 * the receipt, never on which mailbox received it. That was true from
 * 2026-09-06, when 4LOT's billing was redirected into the Foundation Stone
 * mailbox — after which the recipient address says nothing about who is
 * paying. Two Anthropic subscriptions now land in the same inbox.
 *
 * An unrecognised receipt resolves to null, not to a guess. A wrong entity is
 * worse than a blank one: a blank stops at the reconciliation and gets a human
 * decision, a wrong one silently books a ministry cost against a company.
 */

export const ENTITIES = ['fsa', '4lot', 'integrity', 'journey', 'personal'] as const;
export type Entity = (typeof ENTITIES)[number];

export const ENTITY_LABEL: Record<Entity, string> = {
  fsa: 'Foundation Stone Advisors',
  '4lot': 'For The Least Of These',
  integrity: 'Integrity IT Solutions',
  journey: 'Journey Church of Clay County',
  personal: 'Personal',
};

/** How the entity was decided. Ordered strongest first. */
export type Basis =
  | 'invoice-series'   // Stripe invoice prefix — stable per customer account
  | 'account-name'     // the vendor names the org on the invoice
  | 'card'             // card last-4, when the cards are cleanly separated
  | 'vendor-default'   // this vendor only ever bills one entity
  | 'unallocated';     // nothing matched; a human decides

export type Attribution = {
  entity: Entity | null;
  basis: Basis;
  /** Shown verbatim in the reconciliation sheet so the call can be audited. */
  reason: string;
};

export type ReceiptFacts = {
  vendor: string;
  /** Stripe invoice number, e.g. "3JOCFJ20-0011". */
  invoiceNumber?: string | null;
  /** Organisation named on the invoice, when the vendor prints one. */
  accountName?: string | null;
  /** Last four of the card charged. */
  cardLast4?: string | null;
};

/*
 * Stripe invoice numbers are `<customerPrefix>-<sequence>`, and the prefix is
 * stable for the life of a customer account. That makes it the strongest
 * signal available: it survives a mailbox change, a card change, and a price
 * change, and it distinguishes two subscriptions with the same vendor.
 */
const INVOICE_SERIES: Record<string, { entity: Entity; note: string }> = {
  '3JOCFJ20': { entity: 'fsa', note: 'Anthropic Max plan, FSA account' },
  '8IOT2PFZ': { entity: 'fsa', note: 'Anthropic API credits, FSA account' },
  O85LRNWQ: { entity: 'fsa', note: 'Vercel, FSA team' },
  KFNFSG: { entity: 'fsa', note: 'Supabase, FSA org' },
  IPM6ZSGF: { entity: 'fsa', note: 'Resend, FSA account' },
  '5B76C7AA': { entity: 'fsa', note: 'Loom, FSA seats' },
  '8A28EB5A': { entity: 'personal', note: 'Bitwarden Families Plan' },
};

/*
 * Vendors that have only ever billed one entity. Weaker than an invoice
 * series: a second subscription with the same vendor would be misfiled, which
 * is exactly what happened with Anthropic. So a vendor listed here must be one
 * where a second account is implausible, or where the invoice series is
 * checked first anyway.
 */
const VENDOR_DEFAULT: Record<string, { entity: Entity; note: string }> = {
  uptimerobot: { entity: 'fsa', note: 'uptime monitoring for FSA-hosted projects' },
  github: { entity: 'fsa', note: 'Enterprise Cloud usage, everymotheradvocate org' },
  openai: { entity: 'fsa', note: 'API credits on the FSA card' },
  apple: { entity: 'personal', note: 'consumer Apple subscription' },
  'state farm': { entity: 'personal', note: 'homeowners policy, billed through escrow' },
};

function seriesOf(invoiceNumber: string | null | undefined): string | null {
  if (!invoiceNumber) return null;
  // "3JOCFJ20-0011" -> "3JOCFJ20". Some vendors use a bare prefix with no
  // sequence, so a string without a dash is treated as the prefix itself.
  const [prefix] = invoiceNumber.split('-');
  return prefix ? prefix.toUpperCase() : null;
}

export function attribute(facts: ReceiptFacts): Attribution {
  const series = seriesOf(facts.invoiceNumber);
  if (series && INVOICE_SERIES[series]) {
    const hit = INVOICE_SERIES[series];
    return {
      entity: hit.entity,
      basis: 'invoice-series',
      reason: `invoice series ${series} — ${hit.note}`,
    };
  }

  // Microsoft prints the tenant on the invoice, which is a clean org signal.
  const account = facts.accountName?.toLowerCase() ?? '';
  if (account.includes('foundationstoneadvisors')) {
    return { entity: 'fsa', basis: 'account-name', reason: `invoice names ${facts.accountName}` };
  }
  if (account.includes('4lot') || account.includes('least of these')) {
    return { entity: '4lot', basis: 'account-name', reason: `invoice names ${facts.accountName}` };
  }
  if (account.includes('integrityitsolutions')) {
    return { entity: 'integrity', basis: 'account-name', reason: `invoice names ${facts.accountName}` };
  }
  if (account.includes('journeychurch') || account.includes('journey church')) {
    return { entity: 'journey', basis: 'account-name', reason: `invoice names ${facts.accountName}` };
  }

  const vendor = facts.vendor.toLowerCase();
  for (const [key, hit] of Object.entries(VENDOR_DEFAULT)) {
    if (vendor.includes(key)) {
      return { entity: hit.entity, basis: 'vendor-default', reason: `${key}: ${hit.note}` };
    }
  }

  /*
   * A known vendor whose series is NOT known is the dangerous case — it means
   * a second account with a vendor we already file elsewhere. Say so loudly
   * rather than falling through to the generic message.
   */
  if (series && vendor.includes('anthropic')) {
    return {
      entity: null,
      basis: 'unallocated',
      reason: `Anthropic invoice series ${series} is not a known account — likely 4LOT; confirm before booking`,
    };
  }

  return {
    entity: null,
    basis: 'unallocated',
    reason: 'no rule matched — needs a human decision',
  };
}
