'use client';

import { Timer } from 'lucide-react';

type Props = {
  /** Seconds left, or null when this row's timer isn't running. */
  remaining: number | null;
  /** Full length of the running timer, for the progress bar. */
  duration: number;
  /** Default length shown on the idle chip. */
  defaultSeconds: number;
  /** Currently selected rest length, shown on the idle chip. */
  seconds?: number;
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
 * Normally you never touch it: with the rest timer switched on in the logger
 * toolbar, marking a set done starts the countdown automatically. The idle
 * "Start rest" chip is the manual fallback.
 *
 * An earlier version styled that chip as small grey text, which read as a
 * placeholder rather than a control — it looked broken because nothing about
 * it said "tap me". It is now an outlined button.
 */
export default function InlineRestTimer({
  remaining,
  duration,
  defaultSeconds,
  seconds,
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
          className="flex min-h-[32px] items-center gap-1.5 rounded-full border-2 border-orange-400 bg-orange-50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-100"
        >
          <Timer className="h-3.5 w-3.5" />
          Start rest {mmss(seconds ?? defaultSeconds)}
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
        className={`flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums ${
          done ? 'bg-emerald-600 text-white' : 'bg-orange-500 text-white'
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
