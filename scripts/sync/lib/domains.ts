/*
 * The five domains, and the priority matrix they roll up into.
 *
 * The matrix order is the point of the whole exercise: a brief that shows only
 * client work is a failed brief. Everything that ranks or groups reads
 * MATRIX_ORDER rather than sorting alphabetically or by due date alone.
 */

export const DOMAINS = ['spirit', 'body', 'soul', 'family', 'work'] as const;
export type Domain = (typeof DOMAINS)[number];

export function isDomain(value: unknown): value is Domain {
  return typeof value === 'string' && (DOMAINS as readonly string[]).includes(value);
}

/** God First → Health → Family → Impact. The order is not negotiable. */
export const MATRIX = [
  { key: 'god_first', label: 'God First', domains: ['spirit'] as Domain[] },
  { key: 'health', label: 'Health', domains: ['body', 'soul'] as Domain[] },
  { key: 'family', label: 'Family', domains: ['family'] as Domain[] },
  { key: 'impact', label: 'Impact', domains: ['work'] as Domain[] },
] as const;

export const MATRIX_ORDER: Domain[] = ['spirit', 'body', 'soul', 'family', 'work'];

/*
 * What a repo under ~/dev is for.
 *
 * Guessed once at registration and then never touched again — `sync_enabled`
 * and `domain` are yours to change in the UI, and a harvester that reasserted
 * its guess on every run would undo that silently. Anything not named here
 * defaults to `work`, which is right: a directory full of code is work until
 * you say otherwise.
 */
export const PROJECT_SEEDS: Record<string, { domain: Domain; client?: string; sync?: boolean }> = {
  BibleOS: { domain: 'spirit' },
  brain: { domain: 'work' },
  businessos: { domain: 'work' },
  EDEN: { domain: 'work', client: 'Value Driven Life' },
  financeos: { domain: 'work' },
  honeylakeos: { domain: 'work', client: 'Honey Lake Clinic' },
  linksy: { domain: 'work', client: 'Linksi — Impact Works' },
  'mac-setup': { domain: 'work', sync: false },
  'mission-control': { domain: 'work' },
  TKOS: { domain: 'work', client: 'Thermo King of the Southeast' },
  trellisv2: { domain: 'work', client: "Every Mother's Advocate" },
};

export function guessDomain(slug: string): Domain {
  return PROJECT_SEEDS[slug]?.domain ?? 'work';
}
