'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Check, Loader2 } from 'lucide-react';
import type { Person } from '@/lib/health/people';

/**
 * Whose health records are on screen.
 *
 * Deliberately loud rather than a subtle dropdown: when you are looking at
 * someone else's labs, mistaking them for your own is the whole risk. Viewing
 * anyone but yourself paints the bar amber and names them.
 */
export default function PersonSwitcher({
  people,
  activeId,
}: {
  people: Person[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  // Nothing to switch between — don't take up space.
  if (people.length < 2) return null;

  const active = people.find((p) => p.id === activeId);
  const viewingOther = Boolean(active && !active.is_self);

  async function select(id: string) {
    if (id === activeId) return;
    setBusy(id);
    try {
      await fetch('/api/health/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: id }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-2 rounded-2xl border-2 p-3 ${
        viewingOther ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Users className="h-3.5 w-3.5" />
        Viewing
      </span>
      {people.map((p) => {
        const isActive = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => select(p.id)}
            disabled={busy !== null}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-60 ${
              isActive
                ? p.is_self
                  ? 'bg-blue-700 text-white'
                  : 'bg-amber-600 text-white'
                : 'border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {busy === p.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isActive ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ) : null}
            {p.is_self ? 'Me' : p.full_name}
          </button>
        );
      })}
      {viewingOther && (
        <span className="ml-auto text-xs font-medium text-amber-800">
          {active?.full_name}&rsquo;s records — your briefings and health.md are unaffected
        </span>
      )}
    </div>
  );
}
