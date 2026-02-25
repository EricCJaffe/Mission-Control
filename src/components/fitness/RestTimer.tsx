'use client';

import { useState, useEffect, useRef } from 'react';

type Props = {
  defaultSeconds?: number;
};

export default function RestTimer({ defaultSeconds = 90 }: Props) {
  const [seconds, setSeconds] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            clearInterval(intervalRef.current!);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, remaining]);

  const start = (secs = seconds) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemaining(secs);
    setRunning(true);
  };

  const stop = () => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemaining(0);
  };

  const pct = remaining > 0 ? (remaining / seconds) * 100 : 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Rest Timer</h3>
        {running && (
          <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-medium animate-pulse">
            Resting
          </span>
        )}
        {!running && remaining === 0 && seconds > 0 && (
          <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
            Ready
          </span>
        )}
      </div>

      {/* Progress ring */}
      <div className="flex items-center justify-center mb-4">
        <div className="relative h-20 w-20">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke={remaining === 0 ? '#22c55e' : '#f97316'}
              strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-slate-700 tabular-nums">
              {running || remaining > 0 ? display : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
            </span>
          </div>
        </div>
      </div>

      {/* Duration presets */}
      <div className="flex gap-2 justify-center mb-3">
        {[30, 60, 90, 120, 180].map((s) => (
          <button
            key={s}
            onClick={() => { setSeconds(s); if (!running) setRemaining(0); }}
            className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
              seconds === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s >= 60 ? `${s / 60}m` : `${s}s`}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 justify-center">
        {!running ? (
          <button
            onClick={() => start()}
            className="rounded-xl bg-orange-500 text-white text-sm font-medium px-5 py-2.5 hover:bg-orange-600 min-w-[44px] min-h-[44px]"
          >
            Start
          </button>
        ) : (
          <button
            onClick={stop}
            className="rounded-xl bg-slate-600 text-white text-sm font-medium px-5 py-2.5 hover:bg-slate-700 min-w-[44px] min-h-[44px]"
          >
            Stop
          </button>
        )}
        <button
          onClick={() => start()}
          className="rounded-xl border border-slate-200 text-slate-600 text-sm font-medium px-5 py-2.5 hover:bg-slate-50 min-w-[44px] min-h-[44px]"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
