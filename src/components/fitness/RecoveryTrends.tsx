'use client';

import { Flame, Snowflake, Hand, Footprints, Waves, Info } from 'lucide-react';
import type { RecoveryTrends } from '@/lib/fitness/recovery-trends';

const ICONS: Record<string, typeof Flame> = {
  sauna: Flame,
  cold_plunge: Snowflake,
  massage: Hand,
  compression: Footprints,
  mobility: Waves,
  stretching: Waves,
};

const LABELS: Record<string, string> = {
  sauna: 'Sauna',
  cold_plunge: 'Cold plunge',
  massage: 'Massage',
  compression: 'Compression',
  mobility: 'Mobility',
  stretching: 'Stretching',
};

/**
 * Recovery over time.
 *
 * The next-day comparison is the interesting part and the easiest to
 * over-read, so the sample size is always on screen next to it. Two sessions
 * is not evidence of anything and the panel says so rather than presenting a
 * difference as a result.
 */
export default function RecoveryTrends({ trends }: { trends: RecoveryTrends }) {
  const t = trends;
  if (t.totalSessions === 0) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center">
        <p className="text-sm text-slate-500">
          No recovery sessions in the last {t.windowDays} days. Log one and this fills in.
        </p>
      </section>
    );
  }

  const maxWeek = Math.max(...t.weekly.map((w) => w.minutes), 1);

  const hrvDelta =
    t.nextDay.hrvAfter !== null && t.nextDay.hrvBaseline !== null
      ? t.nextDay.hrvAfter - t.nextDay.hrvBaseline
      : null;
  const rhrDelta =
    t.nextDay.rhrAfter !== null && t.nextDay.rhrBaseline !== null
      ? t.nextDay.rhrAfter - t.nextDay.rhrBaseline
      : null;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sessions" value={String(t.totalSessions)} sub={`last ${t.windowDays} days`} />
        <Stat label="Per week" value={t.sessionsPerWeek.toFixed(1)} sub="average" />
        <Stat
          label="Total time"
          value={`${Math.floor(t.totalMinutes / 60)}h ${t.totalMinutes % 60}m`}
          sub={`${t.activeDays} active days`}
        />
        <Stat
          label="Modalities"
          value={String(t.byModality.length)}
          sub={t.byModality[0] ? LABELS[t.byModality[0].modality] ?? t.byModality[0].modality : ''}
        />
      </section>

      <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">By modality</p>
        <div className="mt-2 space-y-2">
          {t.byModality.map((m) => {
            const Icon = ICONS[m.modality] ?? Waves;
            return (
              <div key={m.modality} className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-teal-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {LABELS[m.modality] ?? m.modality}
                  </p>
                  <p className="text-xs text-slate-500">
                    {m.sessions} session{m.sessions === 1 ? '' : 's'} · {m.avgMinutes} min avg
                    {m.avgTemperature !== null && (
                      <>
                        {' · '}
                        {m.avgTemperature}&deg;F avg
                        {m.tempRange && ` (${m.tempRange[0]}–${m.tempRange[1]})`}
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {m.daysSince === 0 ? 'today' : m.daysSince === 1 ? 'yesterday' : `${m.daysSince}d ago`}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {t.weekly.length > 1 && (
        <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Minutes by week
          </p>
          <div className="mt-3 flex items-end gap-1" style={{ height: 100 }}>
            {t.weekly.map((w) => (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold tabular-nums text-slate-500">
                  {w.minutes || ''}
                </span>
                <div
                  className="w-full rounded-t bg-teal-600"
                  style={{ height: `${Math.max((w.minutes / maxWeek) * 100, 3)}%` }}
                  title={`Week of ${w.weekStart}: ${w.sessions} sessions, ${w.minutes} min`}
                />
                <span className="text-[9px] text-slate-400">{w.weekStart.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {t.subjective.ratedSessions > 0 && (
        <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            How you rated them
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
              {t.subjective.ratedSessions} rated
            </span>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Stat
              label="Energy"
              value={t.subjective.avgEnergyDelta !== null ? `${t.subjective.avgEnergyDelta > 0 ? '+' : ''}${t.subjective.avgEnergyDelta}` : '—'}
              sub="before → after"
            />
            <Stat
              label="Soreness"
              value={t.subjective.avgSorenessDelta !== null ? `${t.subjective.avgSorenessDelta > 0 ? '+' : ''}${t.subjective.avgSorenessDelta}` : '—'}
              sub="lower is better"
            />
            <Stat
              label="Felt recovered"
              value={t.subjective.avgPerceivedRecovery !== null ? `${t.subjective.avgPerceivedRecovery}/10` : '—'}
              sub="average"
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            These are the only recovery numbers that reach the readiness score, and only because
            soreness is something nothing else measures.
          </p>
        </section>
      )}

      <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Info className="h-3.5 w-3.5" />
          The morning after
          <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
            {t.nextDay.sampleSize} session{t.nextDay.sampleSize === 1 ? '' : 's'} with a reading
          </span>
        </p>

        {t.nextDay.sampleSize === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No overnight readings the day after a session yet.
          </p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stat
                label="HRV"
                value={t.nextDay.hrvAfter !== null ? `${t.nextDay.hrvAfter} ms` : '—'}
                sub={
                  t.nextDay.hrvBaseline !== null
                    ? `vs ${t.nextDay.hrvBaseline} on other days${hrvDelta !== null ? ` (${hrvDelta > 0 ? '+' : ''}${Math.round(hrvDelta * 10) / 10})` : ''}`
                    : 'no baseline yet'
                }
              />
              <Stat
                label="Resting HR"
                value={t.nextDay.rhrAfter !== null ? `${t.nextDay.rhrAfter} bpm` : '—'}
                sub={
                  t.nextDay.rhrBaseline !== null
                    ? `vs ${t.nextDay.rhrBaseline} on other days${rhrDelta !== null ? ` (${rhrDelta > 0 ? '+' : ''}${Math.round(rhrDelta * 10) / 10})` : ''}`
                    : 'no baseline yet'
                }
              />
            </div>

            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
              {t.nextDay.sampleSize < 8
                ? `Too few sessions to read anything into — ${t.nextDay.sampleSize} is a prompt to keep logging, not a result. `
                : ''}
              This compares mornings after a session against every other morning, which is not a
              controlled test: sauna tends to follow hard training, and hard training lowers
              next-day HRV on its own. A difference here shows the two go together, not that one
              caused the other.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border-2 border-slate-300 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}
