/**
 * Supplies: what is on the shelf, and what to buy. Pure functions, so the
 * list reads the same on /maintenance/supplies, on a helper's phone and in a
 * test.
 *
 * The shopping list is DERIVED, never stored. Something is on it when:
 *   1. it is below its "keep at least" level,
 *   2. someone flagged it (`need`), or
 *   3. open jobs need more of it than is on the shelf.
 * See supabase/migrations/20260928133000_supplies.sql for why.
 */

export const SUPPLY_CATEGORIES = {
  cleaning: 'Cleaning',
  pest_lawn: 'Bug & weed',
  fuel_oil: 'Fuel & oil',
  engine_parts: 'Small-engine parts',
  hardware: 'Hardware',
  household: 'Household',
  other: 'Other',
} as const;

export type SupplyCategory = keyof typeof SUPPLY_CATEGORIES;
export const SUPPLY_CATEGORY_KEYS = Object.keys(SUPPLY_CATEGORIES) as SupplyCategory[];

export function isSupplyCategory(v: unknown): v is SupplyCategory {
  return typeof v === 'string' && v in SUPPLY_CATEGORIES;
}

/** Stores offered in the picker. Free text is still allowed; these are the usual ones. */
export const COMMON_STORES = ['Tractor Supply', 'Home Depot', "Lowe's", 'Walmart', 'Ace Hardware', 'Amazon', 'Costco'];

/*
 * The starter shelf, from Eric's own list (2026-09-28): bug spray, weed
 * killer, cleaning products, garbage bags, small-engine parts, oil, gas.
 * Loaded at zero with no keep-at-least: counts are his to set, and a guessed
 * level would put fourteen things on the list on day one.
 */
export const STARTER_SUPPLIES: Array<{ name: string; category: SupplyCategory; unit: string | null; store: string | null }> = [
  { name: 'Bug spray', category: 'pest_lawn', unit: 'cans', store: null },
  { name: 'Wasp spray', category: 'pest_lawn', unit: 'cans', store: null },
  { name: 'Weed killer', category: 'pest_lawn', unit: 'gal', store: 'Tractor Supply' },
  { name: 'All-purpose cleaner', category: 'cleaning', unit: 'bottles', store: 'Walmart' },
  { name: 'Bleach', category: 'cleaning', unit: 'bottles', store: 'Walmart' },
  { name: 'Paper towels', category: 'household', unit: 'rolls', store: 'Walmart' },
  { name: 'Trash bags', category: 'household', unit: 'boxes', store: 'Walmart' },
  { name: 'Gas', category: 'fuel_oil', unit: 'gal', store: null },
  { name: '2-cycle mix oil', category: 'fuel_oil', unit: 'bottles', store: 'Tractor Supply' },
  { name: 'Bar & chain oil', category: 'fuel_oil', unit: 'qt', store: 'Tractor Supply' },
  { name: 'Small-engine oil (SAE 30)', category: 'fuel_oil', unit: 'qt', store: 'Tractor Supply' },
  { name: 'Spark plugs', category: 'engine_parts', unit: null, store: 'Tractor Supply' },
  { name: 'Air filters', category: 'engine_parts', unit: null, store: 'Tractor Supply' },
  { name: 'Trimmer line', category: 'engine_parts', unit: 'spools', store: 'Home Depot' },
];

export const SUPPLY_COLUMNS =
  'id,name,category,store,unit,on_hand,keep_min,need,need_note,part_number,asset_id,notes,last_bought_on';

export type Supply = {
  id: string;
  name: string;
  category: SupplyCategory;
  store: string | null;
  unit: string | null;
  on_hand: number;
  keep_min: number | null;
  need: boolean;
  need_note: string | null;
  part_number: string | null;
  asset_id: string | null;
  notes: string | null;
  last_bought_on: string | null;
};

/** One open job's claim on the shelf. */
export type OpenNeed = { supply_id: string; qty: number; task_title: string };

export type Stock = 'out' | 'low' | 'ok';

export function stockOf(s: Pick<Supply, 'on_hand' | 'keep_min'>): Stock {
  if (s.on_hand <= 0) return 'out';
  if (s.keep_min !== null && s.on_hand < s.keep_min) return 'low';
  return 'ok';
}

export type ListLine = {
  supply: Supply;
  /** How many to buy: enough to reach the higher of keep-at-least and what open jobs need. */
  qty: number;
  /** Why it is on the list, in words: "below 2", "flagged", "for Mow front field". */
  reasons: string[];
};

/** The shopping list, one line per supply. Nothing on it that does not need buying. */
export function shoppingList(supplies: Supply[], needs: OpenNeed[]): ListLine[] {
  const byId = new Map<string, OpenNeed[]>();
  for (const n of needs) byId.set(n.supply_id, [...(byId.get(n.supply_id) ?? []), n]);

  const lines: ListLine[] = [];
  for (const s of supplies) {
    const own = byId.get(s.id) ?? [];
    const reserved = own.reduce((sum, n) => sum + n.qty, 0);
    const target = Math.max(s.keep_min ?? 0, reserved);
    const short = Math.max(target - s.on_hand, 0);
    const reasons: string[] = [];
    if (s.need) reasons.push(s.need_note ? `flagged: ${s.need_note}` : 'flagged');
    if (s.keep_min !== null && s.on_hand < s.keep_min) reasons.push(s.on_hand <= 0 ? 'out' : `below ${fmt(s.keep_min)}`);
    if (reserved > s.on_hand) reasons.push(`for ${[...new Set(own.map((n) => n.task_title))].join(', ')}`);
    if (!reasons.length) continue;
    // Flagged with the shelf already at target: buy one, the flag says so.
    lines.push({ supply: s, qty: short > 0 ? roundUp(short) : 1, reasons });
  }
  return lines;
}

/** Store groups for the list: named stores A–Z, then "Anywhere" for items with none. */
export function byStore(lines: ListLine[]): Array<{ store: string; lines: ListLine[] }> {
  const groups = new Map<string, { store: string; lines: ListLine[] }>();
  for (const l of lines) {
    const name = l.supply.store?.trim() || '';
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { store: name || 'Anywhere', lines: [] });
    const g = groups.get(key)!;
    // "tractor supply" typed once should not name the group over "Tractor Supply".
    if (name && g.store === g.store.toLowerCase() && name !== name.toLowerCase()) g.store = name;
    g.lines.push(l);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([, g]) => ({ ...g, lines: g.lines.sort((x, y) => x.supply.name.localeCompare(y.supply.name)) }));
}

/** "2 gallons", "1", "0.5 qt". */
export function qtyText(qty: number, unit: string | null): string {
  return unit ? `${fmt(qty)} ${unit}` : fmt(qty);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/* Buy whole units when the shortfall is fractional past two places: 1.333 → 1.34, not a float tail. */
function roundUp(n: number): number {
  return Math.ceil(n * 100) / 100;
}
