'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

const DISCIPLINES = ['Jiu-Jitsu', 'Boxing', 'Muay Thai', 'Wrestling', 'Yoga', 'Other'];
const SESSION_TYPES = ['Gi', 'No-Gi', 'Open mat', 'Competition class', 'Fundamentals', 'Private'];

/**
 * Quick log for a coached class.
 *
 * Only duration is required — the value of a class log is that it gets
 * recorded at all, and a form demanding professor, school and focus before it
 * will save is one you skip after training.
 */
export default function ClassSessionForm({ defaultDiscipline = 'Jiu-Jitsu' }: { defaultDiscipline?: string }) {
  const router = useRouter();
  const [discipline, setDiscipline] = useState(defaultDiscipline);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState('60');
  const [rpe, setRpe] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState('');
  const [instructor, setInstructor] = useState('');
  const [school, setSchool] = useState('');
  const [rounds, setRounds] = useState('');
  const [focus, setFocus] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/class-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discipline,
          workout_date: date,
          duration_minutes: Number(duration),
          rpe,
          session_type: sessionType || null,
          instructor,
          school,
          rounds: rounds ? Number(rounds) : null,
          focus,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push('/fitness'), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base focus:border-blue-600 focus:outline-none';
  const label = 'block text-xs font-semibold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="discipline">Discipline</label>
            <select id="discipline" className={`${field} mt-1`} value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
              {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="date">Date</label>
            <input id="date" type="date" className={`${field} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="duration">Duration (minutes) *</label>
            <input id="duration" type="number" inputMode="numeric" min={1} className={`${field} mt-1`} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="type">Session type</label>
            <select id="type" className={`${field} mt-1`} value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
              <option value="">—</option>
              {SESSION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <span className={label}>Effort (RPE 1–10)</span>
          <div className="mt-1.5 flex gap-1">
            {[...Array(10)].map((_, i) => (
              <button
                key={i + 1}
                type="button"
                onClick={() => setRpe(rpe === i + 1 ? null : i + 1)}
                className={`min-h-[40px] flex-1 rounded-md text-sm font-semibold tabular-nums transition-colors ${
                  rpe === i + 1 ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Optional</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="instructor">Professor / coach</label>
            <input id="instructor" className={`${field} mt-1`} value={instructor} onChange={(e) => setInstructor(e.target.value)} placeholder="Who taught it" />
          </div>
          <div>
            <label className={label} htmlFor="school">School / gym</label>
            <input id="school" className={`${field} mt-1`} value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Where" />
          </div>
          <div>
            <label className={label} htmlFor="rounds">Rounds rolled</label>
            <input id="rounds" type="number" inputMode="numeric" min={0} className={`${field} mt-1`} value={rounds} onChange={(e) => setRounds(e.target.value)} placeholder="e.g. 5" />
          </div>
          <div>
            <label className={label} htmlFor="focus">Focus</label>
            <input id="focus" className={`${field} mt-1`} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Guard retention, armbar from mount…" />
          </div>
        </div>
        <div className="mt-3">
          <label className={label} htmlFor="notes">Notes</label>
          <textarea id="notes" rows={4} className={`${field} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What worked, what didn't, what to drill next time" />
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving || saved || !duration}
        className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white transition-colors ${
          saved ? 'bg-emerald-600' : 'bg-blue-700 hover:bg-blue-800 disabled:opacity-60'
        }`}
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={3} />}
        {saved ? 'Logged' : saving ? 'Saving…' : `Log ${discipline}`}
      </button>
    </div>
  );
}
