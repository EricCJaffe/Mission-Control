'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Clock, Flame, Loader2, Plus, Sparkles } from 'lucide-react';
import {
  CATEGORY_LABELS,
  PRAYER_MODES,
  buildSubjectTree,
  flattenTree,
  recentAnswers,
  rotationHealth,
  selectDailyRotation,
  type PrayerRequest,
  type PrayerSubjectNode,
} from '@/lib/spirit/prayer';

type SubjectRow = Omit<PrayerSubjectNode, 'children' | 'requests'>;

type Tab = 'today' | 'list' | 'answered';

export default function PrayerClient({
  subjects,
  requests,
}: {
  subjects: SubjectRow[];
  requests: PrayerRequest[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('today');
  const [busy, setBusy] = useState<string | null>(null);
  const [prayed, setPrayed] = useState<Set<string>>(new Set());

  const subjectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of subjects) map.set(s.id, s.name);
    return map;
  }, [subjects]);

  const tree = useMemo(() => buildSubjectTree(subjects, requests), [subjects, requests]);
  const rotation = useMemo(() => selectDailyRotation(requests), [requests]);
  const health = useMemo(() => rotationHealth(requests), [requests]);
  const answers = useMemo(() => recentAnswers(requests, 8), [requests]);

  async function mark(id: string, action: 'prayed' | 'answered', answerNote?: string) {
    setBusy(id);
    try {
      const res = await fetch('/api/spirit/prayer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, answer_note: answerNote }),
      });
      if (res.ok && action === 'prayed') setPrayed((p) => new Set(p).add(id));
      if (res.ok && action === 'answered') router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'today', label: 'Today', count: rotation.length },
    { key: 'list', label: 'Full list', count: health.total },
    { key: 'answered', label: 'Answered', count: answers.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl border-2 border-slate-300 bg-white p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-indigo-200' : 'text-slate-400'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <>
          <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              {health.total} active requests. At {rotation.length} a day you come back round to
              everything about every {health.cycleDays} days — nothing waits indefinitely just
              because it sits far down the page.
            </p>
            {(health.neverPrayed > 0 || health.stale > 0) && (
              <p className="mt-1.5 text-xs text-slate-500">
                {health.neverPrayed > 0 && `${health.neverPrayed} never prayed through here`}
                {health.neverPrayed > 0 && health.stale > 0 && ' · '}
                {health.stale > 0 && `${health.stale} untouched for over a month`}
                {' — these are first in the queue.'}
              </p>
            )}
          </div>

          {rotation.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {rotation.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  subject={r.subject_id ? subjectName.get(r.subject_id) : undefined}
                  done={prayed.has(r.id)}
                  busy={busy === r.id}
                  onPrayed={() => mark(r.id, 'prayed')}
                  onAnswered={(note) => mark(r.id, 'answered', note)}
                />
              ))}
            </div>
          )}

          <details className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
            <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-600">
              Pray the framework — the Lord&apos;s Prayer as a path
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4">
              <p className="text-xs italic text-slate-500">
                A framework and set of principles rather than a set of rules that must be
                perfectly followed.
              </p>
              {PRAYER_MODES.map((m) => (
                <div key={m.key}>
                  <p className="text-sm font-semibold text-slate-900">{m.label}</p>
                  <p className="text-xs italic text-slate-400">&ldquo;{m.anchor}&rdquo;</p>
                  <p className="mt-0.5 text-xs text-slate-600">{m.prompt}</p>
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {tab === 'list' && <SubjectTree nodes={tree} />}

      {tab === 'answered' && (
        <div className="space-y-2">
          {answers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                Nothing marked answered yet. When something is, it stays here rather than being
                deleted — looking back over answers is the part that sustains the rest.
              </p>
            </div>
          ) : (
            answers.map((r) => (
              <div key={r.id} className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">{r.body}</p>
                {r.answer_note && <p className="mt-1 text-sm text-emerald-800">{r.answer_note}</p>}
                <p className="mt-1 text-xs text-emerald-600">
                  Answered {r.answered_at ? new Date(r.answered_at).toLocaleDateString() : ''}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center">
      <Check className="mx-auto h-6 w-6 text-emerald-500" />
      <p className="mt-2 text-sm text-slate-600">Nothing in the queue. Everything is current.</p>
    </div>
  );
}

function RequestCard({
  request,
  subject,
  done,
  busy,
  onPrayed,
  onAnswered,
}: {
  request: PrayerRequest;
  subject?: string;
  done: boolean;
  busy: boolean;
  onPrayed: () => void;
  onAnswered: (note: string) => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [note, setNote] = useState('');

  const since = request.last_prayed_at
    ? Math.floor((Date.now() - new Date(request.last_prayed_at).getTime()) / 86_400_000)
    : null;

  return (
    <div
      className={`rounded-2xl border-2 p-4 shadow-sm transition-colors ${
        done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-300 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subject && (
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{subject}</p>
          )}
          <p className={`mt-0.5 text-sm ${done ? 'text-emerald-900' : 'text-slate-900'}`}>
            {request.body}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            {request.urgent && (
              <span className="flex items-center gap-0.5 font-semibold text-rose-600">
                <Flame className="h-3 w-3" /> urgent
              </span>
            )}
            {request.status === 'waiting' && (
              <span className="flex items-center gap-0.5 text-amber-600">
                <Clock className="h-3 w-3" /> waiting
              </span>
            )}
            <span>
              {since === null
                ? 'not yet prayed here'
                : since === 0
                  ? 'prayed today'
                  : `${since}d since last`}
            </span>
            {request.prayed_count > 0 && <span>· {request.prayed_count}x</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onPrayed}
          disabled={busy || done}
          aria-label="Mark as prayed"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 text-slate-400 hover:border-indigo-500 hover:text-indigo-600'
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={3} />}
        </button>
      </div>

      {answering ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What happened?"
            className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAnswered(note)}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Mark answered
            </button>
            <button
              type="button"
              onClick={() => setAnswering(false)}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAnswering(true)}
          className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          This was answered
        </button>
      )}
    </div>
  );
}

function SubjectTree({ nodes }: { nodes: PrayerSubjectNode[] }) {
  const byCategory = useMemo(() => {
    const map = new Map<string, PrayerSubjectNode[]>();
    for (const n of nodes) {
      const list = map.get(n.category);
      if (list) list.push(n);
      else map.set(n.category, [n]);
    }
    return map;
  }, [nodes]);

  return (
    <div className="space-y-3">
      {[...byCategory.entries()].map(([category, roots]) => (
        <details key={category} className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-slate-900">
            <ChevronRight className="h-4 w-4 text-slate-400" />
            {CATEGORY_LABELS[category] ?? category}
            <span className="text-xs font-normal text-slate-400">
              {flattenTree(roots).length}
            </span>
          </summary>
          <div className="border-t border-slate-100 p-3">
            {flattenTree(roots).map((n) => (
              <div key={n.id} style={{ paddingLeft: `${n.depth * 14}px` }} className="py-1">
                <p className={`text-sm ${n.depth === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                  {n.name}
                </p>
                {n.notes && <p className="text-xs italic text-slate-500">{n.notes}</p>}
                {n.requests.map((r) => (
                  <p key={r.id} className="mt-0.5 flex items-start gap-1 text-xs text-slate-600">
                    <Plus className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
                    <span className={r.status === 'answered' ? 'text-emerald-700 line-through' : ''}>
                      {r.body}
                    </span>
                  </p>
                ))}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
