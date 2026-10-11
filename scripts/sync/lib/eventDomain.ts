/*
 * Which life domain an Outlook event belongs to.
 *
 * The mailbox used to stamp every event `work`. A family week that Eric had
 * already tagged Family in Outlook then counted as Impact, and a later sync
 * would not correct it. Categories are the label he actually applies. Titles
 * are the fallback for a block he typed in and never categorised — the same
 * phrases the triage migration and the prep check already trust.
 *
 * A domain somebody set by hand is not a guess the sync may revise. `origin`
 * is how a row says which of the two wrote it. See domainAssignment.
 */

export const EVENT_DOMAINS = ['spirit', 'body', 'soul', 'family', 'work'] as const;
export type EventDomain = (typeof EVENT_DOMAINS)[number];

/**
 * Outlook category → domain. First recognised category on the event wins.
 * Match is trimmed and case-insensitive. Add a name here to teach the sync
 * a new label; do not scatter the list.
 */
export const OUTLOOK_CATEGORY_DOMAINS: Record<EventDomain, readonly string[]> = {
  spirit: ['Spirit', 'God First', 'God'],
  body: ['Health', 'Body'],
  soul: ['Soul'],
  family: ['Family'],
  work: ['Impact', 'Work'],
};

/** What a categorised-as-nothing event from this mailbox has always been. */
export const DEFAULT_EVENT_DOMAIN: EventDomain = 'work';

/**
 * Preparation blocks, by title. The same test `m365.ts` uses to decide
 * whether a meeting has prep — a block named this way is work time set
 * aside, not a second domain.
 */
export const PREP_TITLE_RE = /\b(prep|prepping|prepare|block|blocked|review|focus)\b/i;

export type DomainOrigin = 'sync' | 'hand';

export function isEventDomain(value: unknown): value is EventDomain {
  return typeof value === 'string' && (EVENT_DOMAINS as readonly string[]).includes(value);
}

/** The first category that names a domain, or null when none of them do. */
export function domainFromCategories(categories: readonly string[] | null | undefined): EventDomain | null {
  for (const raw of categories ?? []) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    for (const domain of EVENT_DOMAINS) {
      if (OUTLOOK_CATEGORY_DOMAINS[domain].some((name) => name.trim().toLowerCase() === key)) {
        return domain;
      }
    }
  }
  return null;
}

/**
 * Title triage, used only when no category was recognised.
 *
 * The two calendar rules in
 * `supabase/migrations/20260906120000_triage_domains_and_daily_anchors.sql`
 * (exercise / bicep → body, crypto → work), then the prep-title regex.
 * Anything else is not a title the sync is willing to guess from.
 */
export function domainFromTitle(title: string | null | undefined): EventDomain | null {
  const text = title ?? '';
  if (/^exercise$/i.test(text.trim()) || /bicep/i.test(text)) return 'body';
  if (/crypto/i.test(text)) return 'work';
  if (PREP_TITLE_RE.test(text)) return 'work';
  return null;
}

/** Category, then title, then the mailbox default. */
export function resolveEventDomain(input: {
  categories?: readonly string[] | null;
  title?: string | null;
}): EventDomain {
  return domainFromCategories(input.categories) ?? domainFromTitle(input.title) ?? DEFAULT_EVENT_DOMAIN;
}

/**
 * Whether this sync may write `resolved` onto a row.
 *
 * Inserts always may. A later sync may replace a domain it wrote itself.
 * `hand` is a person's decision and is left untouched, whatever Outlook
 * says now. `null` is a row from before this distinction existed — a hand
 * edit and the old hard-coded `work` are indistinguishable — so it is left
 * untouched too. The migration that backfills `sync` on the old default is
 * what lets the next run correct those.
 */
export function domainAssignment(
  resolved: EventDomain,
  stored: { domain: string | null; origin: DomainOrigin | null } | null,
): { writeDomain: boolean; domain: EventDomain; origin: 'sync' } {
  if (stored === null) return { writeDomain: true, domain: resolved, origin: 'sync' };
  if (stored.origin === 'sync') return { writeDomain: true, domain: resolved, origin: 'sync' };
  return { writeDomain: false, domain: resolved, origin: 'sync' };
}
