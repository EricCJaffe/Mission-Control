'use client';

import { Timer } from 'lucide-react';

type Props = {
  /** Seconds left, or null when this row's timer isn't running. */
  remaining: number | null;
  /** Full length of the running timer, for the progress bar. */
  duration: number;
  /** Default length shown on the idle chip. */
  defaultSeconds: number;
  onStart: () => void;
  onCancel: () => void;
  onExtend: () => void;
};

function mmss(total: number) {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * One-line rest timer that sits between sets.
 *
 * Idle it's a small "Rest 1:00" chip; tapping starts the countdown in place.
 * Deliberately ~24px tall so it never competes with the set rows — the old
 * full-card timer lived at the bottom of the page and had to be scrolled to.
 */
export default function InlineRestTimer({
  remaining,
  duration,
  defaultSeconds,
  onStart,
  onCancel,
  onExtend,
}: Props) {
  if (remaining === null) {
    return (
      <div className="flex justify-end px-3 pb-1.5">
        <button
          type="button"
          onClick={onStart}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Timer className="h-3 w-3" />
          Rest {mmss(defaultSeconds)}
        </button>
      </div>
    );
  }

  const done = remaining <= 0;
  const pct = duration > 0 ? Math.max(0, Math.min(100, (remaining / duration) * 100)) : 0;

  return (
    <div className="flex items-center gap-2 px-3 pb-1.5">
      <button
        type="button"
        onClick={onCancel}
        title="Tap to clear"
        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
          done ? 'bg-lime-500 text-white' : 'bg-orange-100 text-orange-700'
        }`}
      >
        <Timer className="h-3 w-3" />
        {done ? 'Rest done' : mmss(remaining)}
      </button>
      {!done && (
        <>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-orange-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onExtend}
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            +30s
          </button>
        </>
      )}
    </div>
  );
}
