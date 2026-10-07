'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Minus, Plus, ShoppingCart } from 'lucide-react';
import { DataTable, StatusPill, type DataColumn, type GroupDef, type PillTone, TOUCH_TARGET } from '@/components/ui/DataTable';
import {
  COMMON_STORES,
  STARTER_SUPPLIES,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_KEYS,
  byStore,
  qtyText,
  stockOf,
  type ListLine,
  type Stock,
  type Supply,
} from '@/lib/supplies';

const card = 'min-w-0 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm';
const input = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
const label = 'block text-xs font-medium text-slate-600';
const small = `flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium disabled:opacity-40 ${TOUCH_TARGET}`;

const STOCK_WORD: Record<Stock, string> = { out: 'Out', low: 'Low', ok: 'In stock' };
const STOCK_TONE: Record<Stock, PillTone> = { out: 'red', low: 'yellow', ok: 'slate' };

export async function suppliesApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/maintenance/supplies/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `Failed (${res.status})`));
  return json;
}

/* Buttons inside a row must not also open the row. */
function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

/**
 * The supplies page: the shopping list by store on top, because that is what
 * a person opens it for in the truck; the shelf below.
 */
export default function SuppliesBoard({
  supplies,
  list,
  assets,
}: {
  supplies: Supply[];
  list: ListLine[];
  assets: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(key);
    try {
      await suppliesApi(body);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const onList = useMemo(() => new Set(list.map((l) => l.supply.id)), [list]);
  const assetName = useMemo(() => new Map(assets.map((a) => [a.id, a.name])), [assets]);

  const columns: DataColumn<Supply>[] = [
    {
      key: 'name',
      header: 'Item',
      sortable: true,
      pinLeft: true,
      render: (s) => (
        <span className="block max-w-[11rem] truncate sm:max-w-[18rem]">
          {s.name}
          {s.part_number && <span className="ml-1 text-xs text-slate-500">{s.part_number}</span>}
        </span>
      ),
    },
    {
      key: 'on_hand',
      header: 'On hand',
      sortable: true,
      render: (s) => (
        <Actions>
          <button type="button" className={small} aria-label={`One fewer ${s.name}`} disabled={busy !== null || s.on_hand <= 0} onClick={() => act(`adj-${s.id}`, { action: 'adjust', id: s.id, delta: -1 })}>
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[3.5rem] text-center text-sm tabular-nums">{qtyText(s.on_hand, s.unit)}</span>
          <button type="button" className={small} aria-label={`One more ${s.name}`} disabled={busy !== null} onClick={() => act(`adj-${s.id}`, { action: 'adjust', id: s.id, delta: 1 })}>
            <Plus className="h-3 w-3" />
          </button>
        </Actions>
      ),
    },
    { key: 'keep_min', header: 'Keep at least', sortable: true, render: (s) => (s.keep_min === null ? '—' : qtyText(s.keep_min, s.unit)) },
    { key: 'store', header: 'Buy at', sortable: true, filter: 'select', value: (s) => s.store ?? 'Anywhere' },
    {
      key: 'stock',
      header: 'Stock',
      filter: 'select',
      value: (s) => STOCK_WORD[stockOf(s)],
      render: (s) => <StatusPill tone={STOCK_TONE[stockOf(s)]}>{STOCK_WORD[stockOf(s)]}</StatusPill>,
    },
    {
      key: 'actions',
      header: 'List',
      pinRight: true,
      render: (s) => (
        <Actions>
          {onList.has(s.id) ? (
            s.need ? (
              <button type="button" className={small} disabled={busy !== null} onClick={() => act(`need-${s.id}`, { action: 'need', id: s.id, need: false })}>
                Unflag
              </button>
            ) : (
              <span className="text-xs text-slate-500">On list</span>
            )
          ) : (
            <button type="button" className={`${small} border-blue-300 text-blue-700`} disabled={busy !== null} onClick={() => act(`need-${s.id}`, { action: 'need', id: s.id, need: true })}>
              <ShoppingCart className="h-3 w-3" /> Need it
            </button>
          )}
        </Actions>
      ),
    },
  ];

  const groups: GroupDef<Supply>[] = [
    { key: 'category', label: 'Category', of: (s) => ({ id: s.category, label: SUPPLY_CATEGORIES[s.category] }), rank: (id) => SUPPLY_CATEGORY_KEYS.indexOf(id as Supply['category']) },
    { key: 'store', label: 'Store', of: (s) => (s.store ? { id: s.store.toLowerCase(), label: s.store } : null), emptyLabel: 'Anywhere' },
  ];

  return (
    <div className="mt-6 grid gap-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <ShoppingListCard list={list} busy={busy} act={act} />

      <section className={card}>
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">On the shelf ({supplies.length})</h2>
        <div className="mt-3">
          <DataTable
            rows={supplies}
            columns={columns}
            noun={['item', 'items']}
            groups={groups}
            defaultGroup="category"
            hideSearch={supplies.length < 10}
            searchText={(s) => [s.part_number, s.notes, s.asset_id ? assetName.get(s.asset_id) : ''].filter(Boolean).join(' ')}
            emptyState={
              <div className="grid gap-2 text-sm text-slate-600">
                <p>Nothing on the shelf yet.</p>
                <p>
                  <button
                    type="button"
                    disabled={busy !== null}
                    className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    onClick={() => act('starter', { action: 'starter' })}
                  >
                    Load a starter list ({STARTER_SUPPLIES.length} items)
                  </button>
                </p>
                <p className="text-xs text-slate-500">Bug spray, weed killer, cleaners, trash bags, gas, mix oil, bar oil, plugs, filters, trimmer line. All at zero: set the counts and keep-at-least levels afterward.</p>
              </div>
            }
            renderExpanded={(s) => <SupplyForm supply={s} assets={assets} busy={busy} act={act} />}
          />
        </div>
        <details className="mt-4">
          <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium text-blue-700">
            <Plus className="h-4 w-4" /> Add an item
          </summary>
          <SupplyForm assets={assets} busy={busy} act={act} />
        </details>
      </section>

      <datalist id="supply-stores">
        {[...new Set([...COMMON_STORES, ...supplies.map((s) => s.store).filter((x): x is string => Boolean(x))])].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function ShoppingListCard({
  list,
  busy,
  act,
}: {
  list: ListLine[];
  busy: string | null;
  act: (key: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const groups = byStore(list);

  /* Plain text, so it pastes into a text message to whoever is going to the store. */
  const asText = groups
    .map((g) => [`${g.store}:`, ...g.lines.map((l) => `- ${l.supply.name}, ${qtyText(l.qty, l.supply.unit)}${l.supply.part_number ? ` (${l.supply.part_number})` : ''}`)].join('\n'))
    .join('\n\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard blocked: nothing to do; the list is on screen. */
    }
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-5 w-5 text-blue-700" /> Shopping list ({list.length})
        </h2>
        {list.length > 0 && (
          <button type="button" className={small} onClick={copy}>
            <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy as text'}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nothing to buy. Everything is at or above its keep-at-least level, and no open job is short.</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.store} className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{g.store}</h3>
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {g.lines.map((l) => {
                  const id = l.supply.id;
                  const n = qty[id] ?? String(l.qty);
                  return (
                    <li key={id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {l.supply.name}
                          {l.supply.part_number && <span className="ml-1 text-xs font-normal text-slate-500">{l.supply.part_number}</span>}
                        </div>
                        <div className="truncate text-xs text-slate-500">{l.reasons.join(' · ')}</div>
                      </div>
                      <input
                        aria-label={`How many ${l.supply.name} bought`}
                        inputMode="decimal"
                        className="h-8 w-14 rounded-lg border border-slate-300 px-2 text-right text-sm tabular-nums"
                        value={n}
                        onChange={(e) => setQty((q) => ({ ...q, [id]: e.target.value }))}
                      />
                      <span className="w-10 truncate text-xs text-slate-500">{l.supply.unit ?? ''}</span>
                      <button
                        type="button"
                        className={`${small} border-blue-700 bg-blue-700 text-white`}
                        disabled={busy !== null || !(Number(n) > 0)}
                        onClick={() => act(`buy-${id}`, { action: 'bought', id, qty: Number(n) })}
                      >
                        <Check className="h-3 w-3" /> Got it
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* Add (no supply) or edit (with one). Uncontrolled, sent whole on save. */
function SupplyForm({
  supply,
  assets,
  busy,
  act,
}: {
  supply?: Supply;
  assets: Array<{ id: string; name: string }>;
  busy: string | null;
  act: (key: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const key = supply ? `edit-${supply.id}` : 'create';
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(
      ['name', 'category', 'store', 'unit', 'on_hand', 'keep_min', 'part_number', 'asset_id', 'notes'].map((k) => [k, String(f.get(k) ?? '')]),
    );
    const form = e.currentTarget;
    void act(key, supply ? { action: 'update', id: supply.id, ...body } : { action: 'create', ...body }).then(() => {
      if (!supply) form.reset();
    });
  }
  return (
    <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="sm:col-span-2">
        <span className={label}>Item</span>
        <input name="name" required defaultValue={supply?.name} placeholder="Bug spray, bar & chain oil, 33-gal trash bags" className={input} />
      </label>
      <label>
        <span className={label}>Category</span>
        <select name="category" defaultValue={supply?.category ?? 'other'} className={`${input} bg-white`}>
          {SUPPLY_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>{SUPPLY_CATEGORIES[k]}</option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>On hand</span>
        <input name="on_hand" inputMode="decimal" defaultValue={supply?.on_hand ?? 0} className={input} />
      </label>
      <label>
        <span className={label}>Keep at least</span>
        <input name="keep_min" inputMode="decimal" defaultValue={supply?.keep_min ?? ''} placeholder="Blank: only when flagged" className={input} />
      </label>
      <label>
        <span className={label}>Counted in</span>
        <input name="unit" defaultValue={supply?.unit ?? ''} placeholder="bottles, gal, bags" className={input} />
      </label>
      <label>
        <span className={label}>Buy at</span>
        <input name="store" list="supply-stores" defaultValue={supply?.store ?? ''} placeholder="Tractor Supply" className={input} />
      </label>
      <label>
        <span className={label}>Part / size</span>
        <input name="part_number" defaultValue={supply?.part_number ?? ''} placeholder="Champion RJ19LM, SAE 30" className={input} />
      </label>
      <label>
        <span className={label}>Fits</span>
        <select name="asset_id" defaultValue={supply?.asset_id ?? ''} className={`${input} bg-white`}>
          <option value="">Anything</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-3">
        <span className={label}>Notes</span>
        <input name="notes" defaultValue={supply?.notes ?? ''} className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <button type="submit" disabled={busy !== null} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {supply ? 'Save' : 'Add item'}
        </button>
        {supply && (
          <>
            {supply.last_bought_on && <span className="text-xs text-slate-500">Last bought {supply.last_bought_on}</span>}
            <button
              type="button"
              disabled={busy !== null}
              className="ml-auto text-sm text-slate-500 hover:text-red-700"
              onClick={() => {
                if (confirm(`Remove ${supply.name} from the shelf?`)) void act(`archive-${supply.id}`, { action: 'archive', id: supply.id });
              }}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </form>
  );
}
