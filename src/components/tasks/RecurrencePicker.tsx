'use client';

import { useState } from 'react';
import {
  DEFAULT_RECURRENCE,
  WEEKDAYS,
  WEEKDAY_LABELS,
  describeRRule,
  parseRRule,
  toRRule,
  type Freq,
  type Recurrence,
  type Weekday,
} from '@/lib/tasks/recurrence';

/**
 * Builds an RRULE without the user ever seeing one.
 *
 * Emits into a hidden input named `recurrence_rule`, so the surrounding plain
 * <form> posts work unchanged — the task forms are server-action style and did
 * not need converting to client submits just to gain a picker.
 */
export default function RecurrencePicker({
  name = 'recurrence_rule',
  defaultValue,
}: {
  name?: string;
  defaultValue?: string | null;
}) {
  const initial = parseRRule(defaultValue);
  const [enabled, setEnabled] = useState(Boolean(initial));
  const [rule, setRule] = useState<Recurrence>(initial ?? DEFAULT_RECURRENCE);
  const [ends, setEnds] = useState<'never' | 'count' | 'until'>(
    initial?.count ? 'count' : initial?.until ? 'until' : 'never'
  );

  const serialised = enabled ? toRRule(rule) : '';
  const summary = describeRRule(serialised);

  const set = (patch: Partial<Recurrence>) => setRule((r) => ({ ...r, ...patch }));

  const toggleDay = (day: Weekday) =>
    set({
      byDay: rule.byDay.includes(day)
        ? rule.byDay.filter((d) => d !== day)
        : [...rule.byDay, day].sort(
            (a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)
          ),
    });

  return (
    <div>
      <input type="hidden" name={name} value={serialised} />

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Repeats
      </label>

      {enabled && (
        <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={rule.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
              aria-label="Repeat interval"
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <select
              value={rule.freq}
              onChange={(e) => set({ freq: e.target.value as Freq })}
              aria-label="Repeat frequency"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
            >
              <option value="DAILY">{rule.interval === 1 ? 'day' : 'days'}</option>
              <option value="WEEKLY">{rule.interval === 1 ? 'week' : 'weeks'}</option>
              <option value="MONTHLY">{rule.interval === 1 ? 'month' : 'months'}</option>
              <option value="YEARLY">{rule.interval === 1 ? 'year' : 'years'}</option>
            </select>
          </div>

          {rule.freq === 'WEEKLY' && (
            <div>
              <span className="text-xs text-slate-500">On</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`h-8 w-10 rounded-lg text-xs font-semibold transition-colors ${
                      rule.byDay.includes(d)
                        ? 'bg-blue-700 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {WEEKDAY_LABELS[d]}
                  </button>
                ))}
              </div>
              {rule.byDay.length === 0 && (
                <p className="mt-1 text-[11px] text-slate-400">
                  No day picked — it will repeat on the same weekday as the due date.
                </p>
              )}
            </div>
          )}

          {rule.freq === 'MONTHLY' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">On day</span>
              <input
                type="number"
                min={1}
                max={31}
                value={rule.byMonthDay ?? ''}
                placeholder="same as due date"
                onChange={(e) =>
                  set({ byMonthDay: e.target.value ? Number(e.target.value) : null })
                }
                aria-label="Day of month"
                className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Ends</span>
            <select
              value={ends}
              onChange={(e) => {
                const v = e.target.value as typeof ends;
                setEnds(v);
                set({
                  count: v === 'count' ? (rule.count ?? 10) : null,
                  until: v === 'until' ? rule.until : null,
                });
              }}
              aria-label="When the repeat ends"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
            >
              <option value="never">never</option>
              <option value="count">after N times</option>
              <option value="until">on a date</option>
            </select>
            {ends === 'count' && (
              <input
                type="number"
                min={1}
                value={rule.count ?? 10}
                onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Number of occurrences"
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
            )}
            {ends === 'until' && (
              <input
                type="date"
                value={rule.until ?? ''}
                onChange={(e) => set({ until: e.target.value || null })}
                aria-label="Repeat until"
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
            )}
          </div>

          {summary && (
            <p className="text-xs font-medium text-blue-700">{summary}</p>
          )}
        </div>
      )}
    </div>
  );
}
