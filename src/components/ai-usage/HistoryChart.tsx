'use client';

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/*
 * Last 30 days for one plan: daily tokens as bars, the day's highest vendor
 * percent reading as a line where the plan has one. Days with no row are
 * zero-token days, not gaps, so they are filled in by the page.
 */

export type HistoryPoint = { day: string; tokens: number; pct: number | null };

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export default function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const hasPct = points.some((p) => p.pct !== null);
  const hasTokens = points.some((p) => p.tokens > 0);
  if (!hasPct && !hasTokens) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-400">No history in the last 30 days</div>;
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} minTickGap={16} />
          {hasTokens && (
            <YAxis yAxisId="t" tickFormatter={(v: number) => COMPACT.format(v)} tick={{ fontSize: 11 }} width={44} />
          )}
          {hasPct && (
            <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} width={40} />
          )}
          <Tooltip
            formatter={(value, name) =>
              name === 'pct' ? [`${Number(value).toFixed(0)}%`, 'Used'] : [COMPACT.format(Number(value)), 'Tokens']
            }
          />
          {hasTokens && <Bar yAxisId="t" dataKey="tokens" fill="#2563eb" radius={[3, 3, 0, 0]} />}
          {hasPct && <Line yAxisId="p" dataKey="pct" stroke="#0f172a" strokeWidth={2} dot={false} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
