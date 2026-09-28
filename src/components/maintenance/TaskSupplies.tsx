'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, X } from 'lucide-react';
import { qtyText } from '@/lib/supplies';

export type SupplyOption = { id: string; name: string; unit: string | null; on_hand: number };
export type NeedView = { id: string; task_id: string; supply_id: string; qty: number };

const NEW = '__new__';

/**
 * What a job needs from the shelf, on the job itself: a maintenance schedule
 * or a helper job. Adding one reserves it (it goes on the shopping list when
 * the shelf is short), and finishing the job takes it off the shelf.
 */
export default function TaskSupplies({ taskId, needs, supplies }: { taskId: string; needs: NeedView[]; supplies: SupplyOption[] }) {
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [newName, setNewName] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byId = new Map(supplies.map((s) => [s.id, s]));
  const mine = needs.filter((n) => n.task_id === taskId);

  async function send(body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/maintenance/supplies/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setPick('');
      setNewName('');
      setQty('1');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ctl = 'h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm';
  return (
    <div className="grid gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
        <Package className="h-3.5 w-3.5" /> Supplies for this job
      </div>
      {mine.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {mine.map((n) => {
            const s = byId.get(n.supply_id);
            const short = s ? s.on_hand < n.qty : false;
            return (
              <li key={n.id} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${short ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-slate-300 text-slate-700'}`}>
                {s?.name ?? 'Removed item'} × {qtyText(n.qty, s?.unit ?? null)}
                {short && <span>· have {qtyText(s!.on_hand, s!.unit)}</span>}
                <button type="button" aria-label="Remove" disabled={busy} onClick={() => send({ action: 'detach', id: n.id })} className="ml-0.5 text-slate-400 hover:text-red-700">
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Supply" className={ctl} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add a supply…</option>
          {supplies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value={NEW}>New item…</option>
        </select>
        {pick === NEW && <input aria-label="New item name" className={ctl} placeholder="e.g. 2-cycle oil" value={newName} onChange={(e) => setNewName(e.target.value)} />}
        {pick && (
          <>
            <input aria-label="How many" inputMode="decimal" className={`${ctl} w-16`} value={qty} onChange={(e) => setQty(e.target.value)} />
            <button
              type="button"
              disabled={busy || !(Number(qty) > 0) || (pick === NEW && !newName.trim())}
              className="h-9 rounded-lg bg-blue-700 px-3 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => send({ action: 'attach', task_id: taskId, qty: Number(qty), ...(pick === NEW ? { new_name: newName } : { supply_id: pick }) })}
            >
              Add
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
