'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarPlus2, Loader2 } from 'lucide-react';

export default function TrainingPlanActionsClient({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scheduleFramework() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/fitness/plans/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to schedule framework days');
      }
      setMessage(
        data.scheduled_count > 0
          ? `Scheduled ${data.scheduled_count} workout${data.scheduled_count === 1 ? '' : 's'}.`
          : 'Framework was already scheduled.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule framework');
    } finally {
      setLoading(false);
    }
  }

  async function scheduleRecoveryBlocks() {
    setRecoveryLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/fitness/plans/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, include_recovery_blocks: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to schedule recovery blocks');
      }
      setMessage(
        data.recovery_count > 0
          ? `Scheduled ${data.recovery_count} optional recovery block${data.recovery_count === 1 ? '' : 's'}.`
          : 'Recovery blocks were already scheduled.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule recovery blocks');
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={scheduleFramework}
          disabled={loading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus2 className="h-4 w-4" />}
          Schedule Framework Days
        </button>
        <button
          type="button"
          onClick={scheduleRecoveryBlocks}
          disabled={recoveryLoading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {recoveryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus2 className="h-4 w-4" />}
          Schedule Recovery Blocks
        </button>
        <Link
          href="/fitness/calendar"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Open Calendar
        </Link>
      </div>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
