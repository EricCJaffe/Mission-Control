'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Plus, RefreshCw, Save, Upload } from 'lucide-react';

type UploadResult = {
  imported: number;
  duplicates: number;
  skipped: number;
  failed: number;
  outcomes: Array<{ file: string; status: string; detail: string }>;
};

/** FIT / GPX / CSV upload, with drag and drop. */
export function ActivityUploader({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    list.forEach((f) => form.append('files', f));
    try {
      const res = await fetch('/api/fitness/running/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
      setResult(json);
      if (json.imported > 0) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void send(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors ${
          compact ? 'py-4' : 'py-8'
        } ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}
      >
        <FileUp className="h-6 w-6 text-slate-400" aria-hidden />
        <p className="text-sm text-slate-600">Drop Garmin exports here: .fit, .gpx or the Activities .csv</p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {busy ? 'Uploading…' : 'Choose files'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".fit,.gpx,.csv"
          className="hidden"
          onChange={(e) => e.target.files && void send(e.target.files)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          <p className="font-medium text-slate-700">
            {result.imported} imported · {result.duplicates} already logged · {result.skipped} skipped · {result.failed} failed
          </p>
          {result.outcomes.some((o) => o.status !== 'imported') && (
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-500">
              {result.outcomes.filter((o) => o.status !== 'imported').map((o, i) => (
                <li key={i}>{o.file}: {o.detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Feel (1-10) and notes: the two things a watch cannot record. */
export function RunNoteEditor({ id, feel, notes }: { id: string; feel: number | null; notes: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState<string>(feel ? String(feel) : '');
  const [text, setText] = useState(notes ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = value !== (feel ? String(feel) : '') || text !== (notes ?? '');

  async function save() {
    setState('saving');
    const res = await fetch(`/api/fitness/running/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feel: value ? Number(value) : null, notes: text.trim() || null }),
    });
    setState(res.ok ? 'saved' : 'error');
    if (res.ok) router.refresh();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`feel-${id}`}>Feel</label>
      <select
        id={`feel-${id}`}
        value={value}
        onChange={(e) => { setValue(e.target.value); setState('idle'); }}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="">Feel</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}/10</option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`notes-${id}`}>Notes</label>
      <input
        id={`notes-${id}`}
        value={text}
        onChange={(e) => { setText(e.target.value); setState('idle'); }}
        placeholder="Notes (e.g. smart stop: HR drift)"
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty || state === 'saving'}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >
        <Save className="h-4 w-4" aria-hidden /> {state === 'saving' ? 'Saving…' : 'Save'}
      </button>
      {state === 'saved' && <span className="text-xs text-slate-500">Saved</span>}
      {state === 'error' && <span className="text-xs text-red-600">Could not save</span>}
    </div>
  );
}

/** Load a running plan from its JSON (see docs/health-data-paths.md for the shape). */
export function RunningPlanImporter() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    let plan: unknown;
    try {
      plan = JSON.parse(text);
    } catch {
      setBusy(false);
      setMessage('That is not valid JSON.');
      return;
    }
    const res = await fetch('/api/fitness/running/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage([json.error, ...(json.details ?? [])].filter(Boolean).join(' · '));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        aria-label="Running plan JSON"
        placeholder='{"version": 1, "name": "...", "start_date": "...", "race": {...}, "rules": {...}, "phases": [...]}'
        className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50">
          <FileUp className="h-4 w-4" aria-hidden /> Open .json
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Load plan
        </button>
        <span className="text-xs text-slate-500">A plan already active is archived, not deleted.</span>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}

/** Log a run with no file and no Apple Health row. */
export function ManualRunForm({ today }: { today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError(null);
    const f = new FormData(form);
    const res = await fetch('/api/fitness/running/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(f.entries())),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError([json.error, ...(json.details ?? [])].filter(Boolean).join(' · '));
      return;
    }
    form.reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> Log a run by hand
      </button>
    );
  }
  const field = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm';
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget); }}
      className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4"
    >
      <label className="text-xs text-slate-600">Date<input name="date" type="date" defaultValue={today} required className={field} /></label>
      <label className="text-xs text-slate-600">Miles<input name="distance_mi" type="number" step="0.01" min="0.01" required className={field} /></label>
      <label className="text-xs text-slate-600">Time<input name="duration" placeholder="51:02" className={field} /></label>
      <label className="text-xs text-slate-600">Longest run (min)<input name="longest_continuous_min" type="number" step="0.5" min="0" className={field} /></label>
      <label className="text-xs text-slate-600">Avg HR<input name="avg_hr" type="number" min="30" max="240" className={field} /></label>
      <label className="text-xs text-slate-600">Max HR<input name="max_hr" type="number" min="30" max="240" className={field} /></label>
      <label className="text-xs text-slate-600">Feel (1-10)<input name="feel" type="number" min="1" max="10" className={field} /></label>
      <label className="col-span-2 text-xs text-slate-600 sm:col-span-4">Notes<input name="notes" className={field} /></label>
      <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save run
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

/** Pull runs that came in through the Apple Health feed into the session log. */
export function AppleHealthPull() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function pull() {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/fitness/running/sync-apple', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? 'Could not pull runs');
      return;
    }
    setMessage(`${json.added} added from Apple Health${json.alreadyLogged ? `, ${json.alreadyLogged} already in the log` : ''}`);
    if (json.added) router.refresh();
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={pull}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden /> Pull from Apple Health
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </span>
  );
}

const REC_LABELS: Record<string, string> = {
  pending_review: 'Pending review',
  accepted: 'Accepted',
  declined: 'Declined',
  done: 'Done',
};

/** Review status for one coaching recommendation. */
export function RecStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  async function change(next: string) {
    setValue(next);
    const res = await fetch(`/api/fitness/running/recommendations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) router.refresh();
    else setValue(status);
  }
  return (
    <select
      aria-label="Review status"
      value={value}
      onChange={(e) => void change(e.target.value)}
      className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-xs"
    >
      {Object.entries(REC_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );
}
