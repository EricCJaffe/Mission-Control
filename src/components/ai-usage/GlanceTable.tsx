import type { PlanStatus } from '@/lib/ai-usage/forecast';
import { glanceAnchor, glanceNote, glanceReset } from '@/lib/ai-usage/glance';
import { RAG_BAR, RAG_LABEL, pct } from './format';

const DOT: Record<PlanStatus['rag'], string> = {
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
  none: 'bg-slate-300',
};

/** One tappable line per plan; renders whatever plans exist. Tapping jumps to the card. */
export default function GlanceTable({ statuses, now }: { statuses: PlanStatus[]; now: Date }) {
  if (statuses.length === 0) return null;
  return (
    <section aria-label="Quick glance" className="mb-6 overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
      <ul className="divide-y divide-slate-200">
        {statuses.map((s) => {
          const width = s.usedPct === null ? 0 : Math.min(Math.max(s.usedPct, 0), 100);
          return (
            <li key={s.slug}>
              <a href={`#${glanceAnchor(s.slug)}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 hover:bg-slate-50">
                <span className={`h-3 w-3 shrink-0 rounded-full ${DOT[s.rag]}`} role="img" aria-label={RAG_LABEL[s.rag]} title={RAG_LABEL[s.rag]} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{s.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{pct(s.usedPct)}</span>
                  </span>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full ${RAG_BAR[s.rag]}`} style={{ width: `${width}%` }} />
                  </span>
                  <span className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">{glanceNote(s)}</span>
                    <span className="shrink-0">resets {glanceReset(s.window.resetAt, now)} ET</span>
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
