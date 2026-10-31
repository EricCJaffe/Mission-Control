'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import { NUDGE_DISMISS_KEY, nudgeSummary, practiceNudge } from '@/lib/spirit/nudge';
import type { Practice, PracticeLog } from '@/lib/spirit/practices';

type Props = {
  practices: Practice[];
  logs: PracticeLog[];
  today: string;
  /** Link to /spirit. Off on /spirit itself, where the tracker is right below. */
  showLink?: boolean;
};

/** '' when nothing is stored; null is reserved for "not in the browser yet". */
function readDismissed(): string {
  try {
    return window.localStorage.getItem(NUDGE_DISMISS_KEY) ?? '';
  } catch {
    return '';
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * Dismissible "practices still to log today" card. Hidden until mounted so a
 * dismissal stored in this browser never flashes the card on load.
 */
export default function PracticeNudge({ practices, logs, today, showLink = true }: Props) {
  const stored = useSyncExternalStore(subscribe, readDismissed, () => null);
  const [dismissedHere, setDismissedOn] = useState<string | null>(null);

  if (stored === null) return null;
  const dismissedOn = dismissedHere ?? (stored || null);
  const nudge = practiceNudge(practices, logs, today, dismissedOn);
  if (!nudge.show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(NUDGE_DISMISS_KEY, today);
    } catch {
      /* private window: dismiss for this view only */
    }
    setDismissedOn(today);
  };

  const n = nudge.remaining.length;
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 shadow-sm">
      <Bell className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">
          {n === 1 ? '1 practice' : `${n} practices`} still to log today
        </p>
        <p className="mt-0.5 text-sm text-slate-600">{nudgeSummary(nudge.remaining)}</p>
        {showLink && (
          <Link
            href="/spirit"
            className="mt-2 inline-block rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log practices
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss for today"
        className="rounded-lg p-1 text-slate-500 hover:bg-blue-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
