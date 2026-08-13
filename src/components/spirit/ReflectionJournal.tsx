'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, NotebookPen } from 'lucide-react';

export type JournalEntry = {
  id: string;
  subscriptionId: string;
  /** Plan name plus start date — a plan read twice has two runs. */
  planLabel: string;
  day: number;
  passageLabel: string | null;
  content: string;
  writtenOn: string;
};

/**
 * The reflection archive.
 *
 * Search is over the text AND the passage label, because both are how you go
 * looking: "what did I write about Proverbs 6" and "what have I written about
 * pride" are the same question asked from different ends.
 */
export default function ReflectionJournal({ entries }: { entries: JournalEntry[] }) {
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState('all');

  const planOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) seen.set(e.subscriptionId, e.planLabel);
    return [...seen.entries()];
  }, [entries]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (plan !== 'all' && e.subscriptionId !== plan) return false;
      if (!q) return true;
      return (
        e.content.toLowerCase().includes(q) ||
        (e.passageLabel ?? '').toLowerCase().includes(q) ||
        e.planLabel.toLowerCase().includes(q)
      );
    });
  }, [entries, query, plan]);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
        <NotebookPen className="mx-auto h-6 w-6 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">
          Open a reading day and write what stood out. It will show up here, with its passage and
          date.
        </p>
        <Link
          href="/spirit/reading"
          className="mt-3 inline-block rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Go to today’s reading
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reflections or passages"
            className="w-full rounded-xl border-2 border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        {planOptions.length > 1 && (
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="all">All plans</option>
            {planOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border-2 border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nothing matches “{query}”.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Day {e.day}
                  {e.passageLabel && (
                    <span className="text-amber-700"> · {e.passageLabel}</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{e.writtenOn}</p>
              </div>
              <p className="text-xs text-slate-400">{e.planLabel}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {e.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
