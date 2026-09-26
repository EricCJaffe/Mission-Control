'use client';

import { useState } from 'react';
import { HONEYPOT } from '@/lib/jobs/validate';

/* Short enough to finish standing in a parking lot. No resume upload. */
export default function ApplyForm({ slug }: { slug: string }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const input = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    const res = await fetch(`/jobs/${slug}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    if (res.ok) setState('sent');
    else {
      setState('idle');
      setError((await res.json().catch(() => ({}))).error ?? 'Something went wrong. Please try again.');
    }
  }

  if (state === 'sent')
    return (
      <div className="mt-4 rounded-2xl border-2 border-green-300 bg-green-50 p-5 text-green-900">
        <p className="font-semibold">Thanks, we got it.</p>
        <p className="mt-1 text-sm">We’ll reach out by phone or text if it looks like a fit.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border-2 border-blue-600 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Apply now</h2>
      <p className="text-sm text-slate-500">Takes about two minutes.</p>
      <label className="mt-4 block text-sm font-medium">Your name
        <input className={input} autoComplete="name" required onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="mt-3 block text-sm font-medium">Phone
        <input className={input} type="tel" autoComplete="tel" required onChange={(e) => set('phone', e.target.value)} />
      </label>
      <label className="mt-3 block text-sm font-medium">Email <span className="font-normal text-slate-500">(optional)</span>
        <input className={input} type="email" autoComplete="email" onChange={(e) => set('email', e.target.value)} />
      </label>
      <fieldset className="mt-3">
        <legend className="text-sm font-medium">Do you have a valid driver’s license?</legend>
        <div className="mt-1 flex gap-3">
          {['yes', 'no'].map((v) => (
            <label key={v} className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl border text-base ${f.drivers_license === v ? 'border-blue-700 bg-blue-50 font-medium' : 'border-slate-300'}`}>
              <input type="radio" name="dl" value={v} className="sr-only" onChange={() => set('drivers_license', v)} required />
              {v === 'yes' ? 'Yes' : 'No'}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block text-sm font-medium">What kind of work have you done before?
        <textarea className={input} rows={3} placeholder="In your own words: fencing, landscaping, construction, farm work…" onChange={(e) => set('experience', e.target.value)} />
      </label>
      <label className="mt-3 block text-sm font-medium">When can you work?
        <input className={input} placeholder="e.g. weekday mornings, Saturdays" onChange={(e) => set('availability', e.target.value)} />
      </label>
      <label className="mt-3 block text-sm font-medium">How did you hear about this?
        <input className={input} placeholder="Facebook, a friend…" onChange={(e) => set('heard_from', e.target.value)} />
      </label>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" name={HONEYPOT} onChange={(e) => set(HONEYPOT, e.target.value)} /></label>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="mt-4 min-h-[48px] w-full rounded-xl bg-blue-700 text-base font-medium text-white disabled:opacity-60">
        {state === 'sending' ? 'Sending…' : 'Send application'}
      </button>
    </form>
  );
}
