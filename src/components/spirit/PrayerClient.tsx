'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock, Check, CheckCircle2, ChevronRight, Clock, Flame, History,
  Loader2, MessageSquareText, Pencil, Plus, RefreshCw, Sparkles, Trash2, X,
} from 'lucide-react';
import {
  CADENCES,
  DEFAULT_CADENCE,
  PRAYER_MODES,
  activeRequests,
  buildSubjectIndex,
  buildSubjectTree,
  calendarDaysBetween,
  categoryLabels,
  flattenTree,
  recentAnswers,
  rotationHealth,
  selectTodaysList,
  type PrayerCategory,
  type PrayerRequest,
  type PrayerSubjectNode,
  type SubjectContext,
} from '@/lib/spirit/prayer';
import PrayerHistory from './PrayerHistory';
import PrayerOrganise from './PrayerOrganise';

type SubjectRow = Omit<PrayerSubjectNode, 'children' | 'requests'>;
type Tab = 'today' | 'list' | 'answered' | 'organise';

const CADENCE_LABEL: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'One time', rotation: 'Rotation',
};

const FIELD =
  'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-500';

export default function PrayerClient({
  subjects,
  requests,
  categories,
}: {
  /** Every subject, including retired ones — Organise has to show those. */
  subjects: SubjectRow[];
  requests: PrayerRequest[];
  categories: PrayerCategory[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('today');
  const [busy, setBusy] = useState<string | null>(null);
  const [prayed, setPrayed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stamped once on mount. Reading the clock during render makes "3d since
  // last" change between renders of the same list for no user-visible reason.
  const [now] = useState(() => Date.now());

  // Retired subjects are fetched so Organise can show and restore them, but
  // every praying view works from the live list — and, critically, so do the
  // requests underneath them. Archiving someone used to hide the name while
  // leaving their prayers surfacing every morning attached to nothing.
  const liveSubjects = useMemo(() => subjects.filter((s) => !s.archived), [subjects]);
  const liveRequests = useMemo(() => activeRequests(requests, subjects), [requests, subjects]);

  const labels = useMemo(() => categoryLabels(categories), [categories]);
  const subjectIndex = useMemo(() => buildSubjectIndex(liveSubjects), [liveSubjects]);

  const tree = useMemo(
    () => buildSubjectTree(liveSubjects, liveRequests),
    [liveSubjects, liveRequests]
  );
  const flatSubjects = useMemo(() => flattenTree(tree), [tree]);
  const todays = useMemo(() => selectTodaysList(liveRequests), [liveRequests]);

  /** Outstanding prayers per subject, so Organise can say what retiring one silences. */
  const requestCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of requests) {
      if (!r.subject_id) continue;
      if (r.status !== 'open' && r.status !== 'waiting') continue;
      counts.set(r.subject_id, (counts.get(r.subject_id) ?? 0) + 1);
    }
    return counts;
  }, [requests]);
  // Prayed items disappear rather than lingering in a done state. `prayed`
  // hides them optimistically so the card goes on tap instead of waiting for
  // the server round trip and refetch.
  const outstanding = useMemo(
    () => ({
      scheduled: todays.scheduled.filter((r) => !prayed.has(r.id)),
      rotation: todays.rotation.filter((r) => !prayed.has(r.id)),
    }),
    [todays, prayed]
  );
  const todaysAll = useMemo(
    () => [...outstanding.scheduled, ...outstanding.rotation],
    [outstanding]
  );
  const doneCount = todays.done.length + prayed.size;
  const health = useMemo(() => rotationHealth(liveRequests), [liveRequests]);
  const answers = useMemo(() => recentAnswers(liveRequests, 20), [liveRequests]);

  async function call(init: RequestInit & { url?: string }) {
    setError(null);
    const res = await fetch(init.url ?? '/api/spirit/prayer', init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong');
      return null;
    }
    router.refresh();
    return data;
  }

  async function mark(id: string, action: 'prayed' | 'answered' | 'reopen', answerNote?: string) {
    setBusy(id);
    try {
      const ok = await call({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, answer_note: answerNote }),
      });
      if (ok && action === 'prayed') setPrayed((p) => new Set(p).add(id));
    } finally {
      setBusy(null);
    }
  }

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'today', label: 'Due today', count: todaysAll.length },
    { key: 'list', label: 'All prayers', count: health.total },
    { key: 'answered', label: 'Answered', count: answers.length },
    { key: 'organise', label: 'Organise', count: liveSubjects.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-2xl border-2 border-slate-300 bg-white p-1 shadow-sm">
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
              <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-indigo-200' : 'text-slate-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          Add prayer
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {adding && (
        <AddPrayerForm
          subjects={flatSubjects}
          categories={categories}
          onCancel={() => setAdding(false)}
          onSave={async (payload) => {
            const ok = await call({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (ok) setAdding(false);
          }}
        />
      )}

      {tab === 'today' && (
        <>
          <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              <strong>Due today</strong> is what to pray now: anything you scheduled for today,
              plus a few from the rotation to fill out the list.{' '}
              <strong>All prayers</strong> is the whole list, always there to browse and edit.
            </p>
            <p className="mt-1.5 text-sm text-slate-600">
              {health.total} active
              {outstanding.scheduled.length > 0 &&
                ` · ${outstanding.scheduled.length} scheduled for today`}
              {doneCount > 0 && ` · ${doneCount} prayed today`}
              {health.cycleDays !== null &&
                ` · unscheduled ones come round about every ${health.cycleDays} days`}
              .
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

          {todaysAll.length === 0 ? (
            <EmptyState doneCount={doneCount} />
          ) : (
            <div className="space-y-4">
              {([
                { key: 'scheduled', title: 'Scheduled for today', items: outstanding.scheduled },
                { key: 'rotation', title: 'From the rotation', items: outstanding.rotation },
              ] as const).map((group) =>
                group.items.length === 0 ? null : (
                  <div key={group.key}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {group.key === 'scheduled' ? (
                        <CalendarClock className="h-3.5 w-3.5" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {group.title}
                      <span className="font-normal text-slate-400">{group.items.length}</span>
                    </p>
                    <div className="space-y-2">
                      {group.items.map((r) => (
                        <RequestCard
                          key={r.id}
                          request={r}
                          context={r.subject_id ? subjectIndex.get(r.subject_id) : undefined}
                          subjects={flatSubjects}
                          labels={labels}
                          busy={busy === r.id}
                          now={now}
                          onPrayed={() => mark(r.id, 'prayed')}
                          onAnswered={(note) => mark(r.id, 'answered', note)}
                          onEdit={(patch) =>
                            call({
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: r.id, ...patch }),
                            })
                          }
                          onDelete={() =>
                            call({ url: `/api/spirit/prayer?kind=request&id=${r.id}`, method: 'DELETE' })
                          }
                          onChanged={() => router.refresh()}
                        />
                      ))}
                    </div>
                  </div>
                )
              )}
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

      {tab === 'list' && (
        <SubjectTree
          nodes={tree}
          subjects={flatSubjects}
          labels={labels}
          onSubjectEdit={(id, patch) =>
            call({
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'subject', id, ...patch }),
            })
          }
          onSubjectDelete={(id) =>
            call({ url: `/api/spirit/prayer?kind=subject&id=${id}`, method: 'DELETE' })
          }
          onRequestEdit={(id, patch) =>
            call({
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, ...patch }),
            })
          }
          onRequestDelete={(id) =>
            call({ url: `/api/spirit/prayer?kind=request&id=${id}`, method: 'DELETE' })
          }
          onAddRequest={(subjectId, text) =>
            call({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subject_id: subjectId, body: text }),
            })
          }
          onAddSubject={(payload) =>
            call({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'subject', ...payload }),
            })
          }
          onChanged={() => router.refresh()}
        />
      )}

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
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {r.subject_id && subjectIndex.has(r.subject_id) && (
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                        {labels[subjectIndex.get(r.subject_id)!.category] ??
                          subjectIndex.get(r.subject_id)!.category}
                        <span className="mx-1 text-emerald-400">·</span>
                        {subjectIndex.get(r.subject_id)!.name}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-emerald-900">{r.body}</p>
                    {r.answer_note && <p className="mt-1 text-sm text-emerald-800">{r.answer_note}</p>}
                    <p className="mt-1 text-xs text-emerald-600">
                      Answered {r.answered_at ? new Date(r.answered_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => mark(r.id, 'reopen')}
                    className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                  >
                    Reopen
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'organise' && (
        <PrayerOrganise
          subjects={subjects}
          categories={categories}
          requestCounts={requestCounts}
          onCategoryCreate={(label) =>
            call({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'category', label }),
            })
          }
          onCategoryEdit={(id, patch) =>
            call({
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'category', id, ...patch }),
            })
          }
          onCategoryDelete={(id, reassignTo) =>
            call({
              url: `/api/spirit/prayer?kind=category&id=${id}${
                reassignTo ? `&reassign_to=${encodeURIComponent(reassignTo)}` : ''
              }`,
              method: 'DELETE',
            })
          }
          onSubjectEdit={(id, patch) =>
            call({
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'subject', id, ...patch }),
            })
          }
          onSubjectReorder={(moves) =>
            call({
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'subject-order', moves }),
            })
          }
          onSubjectCreate={(payload) =>
            call({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'subject', ...payload }),
            })
          }
        />
      )}
    </div>
  );
}

function EmptyState({ doneCount }: { doneCount: number }) {
  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-8 text-center">
      <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
      <p className="mt-2 text-sm font-semibold text-emerald-900">
        {doneCount > 0 ? `Done for today — ${doneCount} prayed.` : 'Nothing due today.'}
      </p>
      <p className="mt-1 text-xs text-emerald-700">
        {doneCount > 0
          ? 'The list is finished. Anything scheduled will be back tomorrow.'
          : 'Nothing is scheduled and the rotation is current.'}
      </p>
    </div>
  );
}

/**
 * Capture form.
 *
 * Only the prayer text is required. Everything else — who it is about, which
 * mode, urgency — is optional, because a form that demands categorisation
 * before it will save is one you skip when the thought actually arrives.
 */
function AddPrayerForm({
  subjects,
  categories,
  onCancel,
  onSave,
}: {
  subjects: Array<PrayerSubjectNode & { depth: number }>;
  categories: PrayerCategory[];
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  // Retired headings are not offered for new subjects — that is what retiring
  // one means — but the fallback keeps the form usable if every one is retired.
  const openCategories = categories.filter((c) => !c.archived);
  const [category, setCategory] = useState(
    () => openCategories.find((c) => c.key === 'other')?.key ?? openCategories[0]?.key ?? 'other'
  );
  const [mode, setMode] = useState('');
  const [cadence, setCadence] = useState<string>(DEFAULT_CADENCE);
  const [dueDate, setDueDate] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);

  const creatingSubject = subjectId === '__new__';

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave({
        body: text,
        subject_id: creatingSubject || !subjectId ? null : subjectId,
        new_subject_name: creatingSubject ? newSubject : null,
        category,
        mode: mode || null,
        cadence,
        due_date: cadence === 'once' ? dueDate || null : null,
        urgent,
      });
      setText('');
      setNewSubject('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50/40 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">New prayer</p>
        <button type="button" onClick={onCancel} aria-label="Close">
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      <label className={LABEL} htmlFor="prayer-text">
        What are you praying? *
      </label>
      <textarea
        id="prayer-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        autoFocus
        placeholder="Salvation. Peace in the midst of their circumstances. Freedom from…"
        className={`${FIELD} mt-1`}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="prayer-subject">Who or what is it about?</label>
          <select
            id="prayer-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className={`${FIELD} mt-1`}
          >
            <option value="">— unattached —</option>
            <option value="__new__">+ New subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {' '.repeat(s.depth * 3)}
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {creatingSubject ? (
          <div>
            <label className={LABEL} htmlFor="new-subject">New subject name *</label>
            <input
              id="new-subject"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Dave Whitmore"
              className={`${FIELD} mt-1`}
            />
          </div>
        ) : (
          <div>
            <label className={LABEL} htmlFor="prayer-mode">Mode (optional)</label>
            <select
              id="prayer-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className={`${FIELD} mt-1`}
            >
              <option value="">—</option>
              {PRAYER_MODES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        )}

        {creatingSubject && (
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="prayer-category">Category</label>
            <select
              id="prayer-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${FIELD} mt-1`}
            >
              {openCategories.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-3">
        <span className={LABEL}>How often?</span>
        <div className="mt-1">
          <CadencePicker cadence={cadence} dueDate={dueDate} onCadence={setCadence} onDueDate={setDueDate} />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Urgent — put this at the front of the rotation
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={saving || !text.trim() || (creatingSubject && !newSubject.trim())}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={3} />}
        Add prayer
      </button>
    </div>
  );
}

/**
 * Cadence picker, sharing the calendar's daily / weekly / monthly vocabulary.
 *
 * Rotation is offered as an equal option rather than buried, because for most
 * of a list this size it is the right answer — you want to reach the school
 * board eventually, not on a particular Tuesday, and a list where everything
 * is scheduled produces a backlog of overdue guilt rather than a prayer life.
 */
function CadencePicker({
  cadence,
  dueDate,
  onCadence,
  onDueDate,
}: {
  cadence: string;
  dueDate: string;
  onCadence: (v: string) => void;
  onDueDate: (v: string) => void;
}) {
  const active = CADENCES.find((c) => c.key === cadence);
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {CADENCES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onCadence(c.key)}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              cadence === c.key
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {active && <p className="mt-1 text-[11px] text-slate-500">{active.hint}</p>}
      {cadence === 'once' && (
        <input
          type="date"
          value={dueDate}
          onChange={(e) => onDueDate(e.target.value)}
          aria-label="Date for this one-time prayer"
          className="mt-1.5 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )}
    </div>
  );
}

function RequestCard({
  request,
  context,
  subjects,
  labels,
  busy,
  now,
  onPrayed,
  onAnswered,
  onEdit,
  onDelete,
  onChanged,
}: {
  request: PrayerRequest;
  context?: SubjectContext;
  subjects: Array<PrayerSubjectNode & { depth: number }>;
  labels: Record<string, string>;
  busy: boolean;
  now: number;
  onPrayed: () => void;
  onAnswered: (note: string) => void;
  onEdit: (patch: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onChanged: () => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(request.body);
  const [draftSubject, setDraftSubject] = useState(request.subject_id ?? '');
  const [draftMode, setDraftMode] = useState<string>(request.mode ?? '');
  const [draftCadence, setDraftCadence] = useState<string>(request.cadence ?? 'rotation');
  const [draftDue, setDraftDue] = useState<string>(request.due_date ?? '');
  const [showLog, setShowLog] = useState(false);

  // Calendar days, matching the filter that decides whether this is still
  // outstanding. Elapsed hours said "prayed today" for something prayed at
  // 9pm yesterday, while the filter correctly counted it as a different day.
  const since = request.last_prayed_at
    ? calendarDaysBetween(request.last_prayed_at, new Date(now))
    : null;

  if (editing) {
    return (
      <div className="rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-sm">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className={FIELD}
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <select value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className={FIELD}>
            <option value="">— unattached —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {' '.repeat(s.depth * 3)}{s.name}
              </option>
            ))}
          </select>
          <select value={draftMode} onChange={(e) => setDraftMode(e.target.value)} className={FIELD}>
            <option value="">No mode</option>
            {PRAYER_MODES.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-2">
          <CadencePicker
            cadence={draftCadence}
            dueDate={draftDue}
            onCadence={setDraftCadence}
            onDueDate={setDraftDue}
          />
        </div>

        <button
          type="button"
          onClick={() => { setEditing(false); setAnswering(true); }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
        >
          <CheckCircle2 className="h-4 w-4" />
          Mark as answered — moves it to Answered
        </button>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              await onEdit({
                body: draft,
                subject_id: draftSubject || null,
                mode: draftMode || null,
                cadence: draftCadence,
                due_date: draftCadence === 'once' ? draftDue || null : null,
              });
              setEditing(false);
            }}
            disabled={!draft.trim()}
            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => onEdit({ urgent: !request.urgent })}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              request.urgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {request.urgent ? 'Urgent ✓' : 'Mark urgent'}
          </button>
          <button
            type="button"
            onClick={() => onEdit({ status: request.status === 'waiting' ? 'open' : 'waiting' })}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              request.status === 'waiting' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {request.status === 'waiting' ? 'Waiting ✓' : 'Mark waiting'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(request.body); }}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
        {confirmDelete && (
          <div className="mt-2 rounded-xl bg-rose-50 p-3">
            <p className="text-xs text-rose-800">
              Delete this permanently? If it has been answered, mark it answered instead — that
              keeps the record.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500"
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {context && (
            <p className="flex flex-wrap items-center gap-x-1 text-xs font-semibold text-indigo-600">
              <span className="uppercase tracking-wider text-indigo-500">
                {labels[context.category] ?? context.category}
              </span>
              {context.ancestors.map((a) => (
                <span key={a} className="font-normal text-slate-400">
                  <span className="mr-1 text-slate-300">›</span>
                  {a}
                </span>
              ))}
              <span className="text-slate-300">›</span>
              <span>{context.name}</span>
            </p>
          )}
          <p className="mt-0.5 text-sm text-slate-900">{request.body}</p>
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
            {request.cadence && request.cadence !== 'rotation' && (
              <span className="flex items-center gap-0.5 font-semibold text-indigo-600">
                <CalendarClock className="h-3 w-3" /> {CADENCE_LABEL[request.cadence]}
              </span>
            )}
            <span>
              {since === null ? 'not yet prayed here' : since === 0 ? 'prayed today' : `${since}d since last`}
            </span>
            {request.prayed_count > 0 && (
              <span className="flex items-center gap-0.5">
                <History className="h-3 w-3" />
                prayed {request.prayed_count}x
              </span>
            )}
            {/* Always reachable, not just once something has been prayed. The
                first reflection is usually the one worth writing, and it used
                to be the one there was no way to reach. */}
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              aria-expanded={showLog}
              className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold transition-colors ${
                showLog
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <MessageSquareText className="h-3 w-3" />
              {showLog ? 'Hide history' : 'Reflect'}
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit prayer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onPrayed}
            disabled={busy}
            aria-label="Mark as prayed"
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-300 text-slate-400 transition-colors hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={3} />}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Repeat
        </span>
        {CADENCES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onEdit({ cadence: c.key })}
            title={c.hint}
            className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-colors ${
              (request.cadence ?? 'once') === c.key
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {showLog && <PrayerHistory requestId={request.id} onChanged={onChanged} />}

      {answering ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What happened?"
            className={FIELD}
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
          className="mt-2 flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Mark as answered
        </button>
      )}
    </div>
  );
}

function SubjectTree({
  nodes,
  subjects,
  labels,
  onSubjectEdit,
  onSubjectDelete,
  onRequestEdit,
  onRequestDelete,
  onAddRequest,
  onAddSubject,
  onChanged,
}: {
  nodes: PrayerSubjectNode[];
  subjects: Array<PrayerSubjectNode & { depth: number }>;
  labels: Record<string, string>;
  onSubjectEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onSubjectDelete: (id: string) => Promise<unknown>;
  onRequestEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onRequestDelete: (id: string) => Promise<unknown>;
  onAddRequest: (subjectId: string, text: string) => Promise<unknown>;
  onAddSubject: (payload: Record<string, unknown>) => Promise<unknown>;
  onChanged: () => void;
}) {
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newSubjectIn, setNewSubjectIn] = useState<string | null>(null);

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
            {labels[category] ?? category}
            <span className="text-xs font-normal text-slate-400">{flattenTree(roots).length}</span>
          </summary>
          <div className="border-t border-slate-100 p-3">
            {flattenTree(roots).map((n) => (
              <SubjectRowView
                key={n.id}
                node={n}
                subjects={subjects}
                addingTo={addingTo}
                setAddingTo={setAddingTo}
                newSubjectIn={newSubjectIn}
                setNewSubjectIn={setNewSubjectIn}
                onSubjectEdit={onSubjectEdit}
                onSubjectDelete={onSubjectDelete}
                onRequestEdit={onRequestEdit}
                onRequestDelete={onRequestDelete}
                onAddRequest={onAddRequest}
                onAddSubject={onAddSubject}
                onChanged={onChanged}
              />
            ))}
            <button
              type="button"
              onClick={() => setNewSubjectIn(newSubjectIn === `root:${category}` ? null : `root:${category}`)}
              className="mt-2 flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <Plus className="h-3.5 w-3.5" /> Add to {labels[category] ?? category}
            </button>
            {newSubjectIn === `root:${category}` && (
              <InlineInput
                placeholder="New subject name"
                onCancel={() => setNewSubjectIn(null)}
                onSave={async (value) => {
                  await onAddSubject({ name: value, category, parent_id: null });
                  setNewSubjectIn(null);
                }}
              />
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function SubjectRowView({
  node,
  subjects,
  addingTo,
  setAddingTo,
  newSubjectIn,
  setNewSubjectIn,
  onSubjectEdit,
  onSubjectDelete,
  onRequestEdit,
  onRequestDelete,
  onAddRequest,
  onAddSubject,
  onChanged,
}: {
  node: PrayerSubjectNode & { depth: number };
  subjects: Array<PrayerSubjectNode & { depth: number }>;
  addingTo: string | null;
  setAddingTo: (v: string | null) => void;
  newSubjectIn: string | null;
  setNewSubjectIn: (v: string | null) => void;
  onSubjectEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onSubjectDelete: (id: string) => Promise<unknown>;
  onRequestEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onRequestDelete: (id: string) => Promise<unknown>;
  onAddRequest: (subjectId: string, text: string) => Promise<unknown>;
  onAddSubject: (payload: Record<string, unknown>) => Promise<unknown>;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [impact, setImpact] = useState<{ subjects: number; requests: number } | null>(null);

  // The subtree count is fetched only when delete is pressed, so the list does
  // not fire 121 requests on mount to answer a question nobody asked.
  async function askToDelete() {
    setConfirming(true);
    const res = await fetch(`/api/spirit/prayer?subtree_of=${node.id}`);
    if (res.ok) setImpact(await res.json());
  }

  return (
    <div style={{ paddingLeft: `${node.depth * 14}px` }} className="group py-1">
      <div className="flex items-start gap-2">
        {renaming ? (
          <InlineInput
            defaultValue={node.name}
            placeholder="Subject name"
            onCancel={() => setRenaming(false)}
            onSave={async (value) => {
              await onSubjectEdit(node.id, { name: value });
              setRenaming(false);
            }}
          />
        ) : (
          <>
            <p className={`flex-1 text-sm ${node.depth === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
              {node.name}
            </p>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <IconBtn label="Add prayer here" onClick={() => setAddingTo(addingTo === node.id ? null : node.id)}>
                <Plus className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Add child subject" onClick={() => setNewSubjectIn(newSubjectIn === node.id ? null : node.id)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Rename" onClick={() => setRenaming(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Delete" danger onClick={askToDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </>
        )}
      </div>

      {node.notes && <p className="text-xs italic text-slate-500">{node.notes}</p>}

      {confirming && (
        <div className="my-1 rounded-xl bg-rose-50 p-3">
          <p className="text-xs text-rose-800">
            {impact === null
              ? 'Checking what this would remove…'
              : impact.subjects > 1 || impact.requests > 0
                ? `Deleting "${node.name}" also removes ${impact.subjects - 1} subject${impact.subjects - 1 === 1 ? '' : 's'} beneath it and ${impact.requests} request${impact.requests === 1 ? '' : 's'}. This cannot be undone.`
                : `Delete "${node.name}"? This cannot be undone.`}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={impact === null}
              onClick={() => onSubjectDelete(node.id)}
              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => onSubjectEdit(node.id, { archived: true })}
              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-slate-600"
            >
              Archive instead
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setImpact(null); }}
              className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {node.requests.map((r) => (
        <RequestLine
          key={r.id}
          request={r}
          subjects={subjects}
          onEdit={(patch) => onRequestEdit(r.id, patch)}
          onDelete={() => onRequestDelete(r.id)}
          onChanged={onChanged}
        />
      ))}

      {addingTo === node.id && (
        <InlineInput
          placeholder="What are you praying for them?"
          onCancel={() => setAddingTo(null)}
          onSave={async (value) => {
            await onAddRequest(node.id, value);
            setAddingTo(null);
          }}
        />
      )}

      {newSubjectIn === node.id && (
        <InlineInput
          placeholder={`New subject under ${node.name}`}
          onCancel={() => setNewSubjectIn(null)}
          onSave={async (value) => {
            await onAddSubject({ name: value, category: node.category, parent_id: node.id });
            setNewSubjectIn(null);
          }}
        />
      )}
    </div>
  );
}

function RequestLine({
  request,
  subjects,
  onEdit,
  onDelete,
  onChanged,
}: {
  request: PrayerRequest;
  subjects: Array<PrayerSubjectNode & { depth: number }>;
  onEdit: (patch: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  if (editing) {
    return (
      <div className="my-1">
        <InlineInput
          defaultValue={request.body}
          placeholder="Prayer text"
          onCancel={() => setEditing(false)}
          onSave={async (value) => {
            await onEdit({ body: value });
            setEditing(false);
          }}
        />
        <div className="mt-1 flex flex-wrap gap-1">
          <select
            defaultValue={request.subject_id ?? ''}
            onChange={(e) => onEdit({ subject_id: e.target.value || null })}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="">— unattached —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{' '.repeat(s.depth * 2)}{s.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onEdit({ urgent: !request.urgent })}
            className={`rounded-lg px-2 py-1 text-xs font-semibold ${
              request.urgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Urgent
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600"
          >
            Delete
          </button>
        </div>
        {confirming && (
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-rose-50 px-2 py-1">
            <span className="text-xs text-rose-800">Delete permanently?</span>
            <button type="button" onClick={onDelete} className="text-xs font-bold text-rose-700">Yes</button>
            <button type="button" onClick={() => setConfirming(false)} className="text-xs text-slate-500">No</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="group/req flex items-start gap-1">
        <Plus className="mt-1 h-3 w-3 shrink-0 text-indigo-400" />
        <p className="flex-1 text-xs text-slate-600">
          {request.urgent && <span className="mr-1 font-bold text-rose-600">!</span>}
          {request.body}
        </p>
        {/* Reflections belong here as much as on Due today. Browsing the whole
            list is exactly when you notice something worth writing down about
            a prayer that is not due for another fortnight. */}
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-label={showHistory ? 'Hide history' : 'Reflect on this prayer'}
          aria-expanded={showHistory}
          title="Reflections and history"
          className={`flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold transition-colors ${
            showHistory ? 'bg-amber-100 text-amber-800' : 'text-amber-700 hover:bg-amber-50'
          }`}
        >
          <MessageSquareText className="h-3 w-3" />
          {request.prayed_count > 0 ? request.prayed_count : ''}
        </button>
        <select
          value={request.cadence ?? 'once'}
          onChange={(e) => onEdit({ cadence: e.target.value })}
          aria-label="How often to pray this"
          className="shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-500"
        >
          {CADENCES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit request"
          className="shrink-0 opacity-0 transition-opacity group-hover/req:opacity-100 focus:opacity-100"
        >
          <Pencil className="h-3 w-3 text-slate-400 hover:text-slate-600" />
        </button>
      </div>
      {showHistory && (
        <div className="ml-4">
          <PrayerHistory requestId={request.id} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
        danger ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function InlineInput({
  defaultValue = '',
  placeholder,
  onSave,
  onCancel,
}: {
  defaultValue?: string;
  placeholder: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="my-1 flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        className="flex-1 rounded-lg border-2 border-indigo-300 px-2 py-1 text-xs focus:outline-none"
      />
      <button
        type="button"
        onClick={commit}
        disabled={saving || !value.trim()}
        aria-label="Save"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
