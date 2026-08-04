/**
 * Recovery sessions over time, and whether they are doing anything.
 *
 * The honest position, carried over from recovery-readiness.ts: logging a
 * sauna does not make you recovered. So the interesting question is not "how
 * many sessions did I do" — it is whether the days around them look different
 * in the measures that are not self-reported.
 *
 * That comparison is observational and easily over-read. Two confounds matter
 * enough to state wherever the numbers are shown: sauna tends to follow hard
 * training, which depresses next-day HRV on its own, and the days you choose to
 * plunge are not a random sample. With one user and a handful of sessions this
 * is a prompt to look, not a finding. Sample sizes are always reported so a
 * difference drawn from three days reads as what it is.
 */

import { daysBetween, dayOf, today as appToday } from '@/lib/day';

export type RecoverySession = {
  id: string;
  session_date: string;
  modality: string;
  sub_type: string | null;
  duration_min: number | null;
  temperature_f: number | null;
  perceived_recovery: number | null;
  energy_before: number | null;
  energy_after: number | null;
  soreness_before: number | null;
  soreness_after: number | null;
};

export type DailyMetric = {
  metric_date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
};

export type ModalityStat = {
  modality: string;
  sessions: number;
  totalMinutes: number;
  avgMinutes: number;
  avgTemperature: number | null;
  tempRange: [number, number] | null;
  lastOn: string | null;
  daysSince: number | null;
};

export type RecoveryTrends = {
  windowDays: number;
  totalSessions: number;
  totalMinutes: number;
  sessionsPerWeek: number;
  activeDays: number;
  byModality: ModalityStat[];
  weekly: Array<{ weekStart: string; sessions: number; minutes: number }>;
  /** Self-reported deltas, where he filled them in. */
  subjective: {
    ratedSessions: number;
    avgEnergyDelta: number | null;
    avgSorenessDelta: number | null;
    avgPerceivedRecovery: number | null;
  };
  /** Observational, and labelled as such wherever it is displayed. */
  nextDay: {
    /** Sessions with a usable next-day reading. */
    sampleSize: number;
    hrvAfter: number | null;
    hrvBaseline: number | null;
    rhrAfter: number | null;
    rhrBaseline: number | null;
  };
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(v: number | null, dp = 1): number | null {
  if (v === null) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** Monday-based week key, matching the mileage view. */
function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const offset = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - offset);
  return dt.toISOString().slice(0, 10);
}

export function computeRecoveryTrends(
  sessions: RecoverySession[],
  metrics: DailyMetric[],
  opts: { windowDays?: number; now?: string } = {}
): RecoveryTrends {
  const windowDays = opts.windowDays ?? 90;
  const todayIso = opts.now ?? appToday();

  const inWindow = sessions.filter(
    (s) => s.session_date && daysBetween(s.session_date, todayIso) <= windowDays
  );

  const byModality = new Map<string, RecoverySession[]>();
  for (const s of inWindow) {
    const list = byModality.get(s.modality) ?? [];
    list.push(s);
    byModality.set(s.modality, list);
  }

  const modalityStats: ModalityStat[] = [...byModality.entries()]
    .map(([modality, list]) => {
      const temps = list.map((s) => s.temperature_f).filter((t): t is number => t != null);
      const dates = list.map((s) => s.session_date).sort();
      const lastOn = dates[dates.length - 1] ?? null;
      const minutes = list.reduce((n, s) => n + (s.duration_min ?? 0), 0);
      return {
        modality,
        sessions: list.length,
        totalMinutes: minutes,
        avgMinutes: round(minutes / list.length, 0) ?? 0,
        avgTemperature: round(mean(temps), 0),
        tempRange: (temps.length > 1 ? [Math.min(...temps), Math.max(...temps)] : null) as [number, number] | null,
        lastOn,
        daysSince: lastOn ? daysBetween(lastOn, todayIso) : null,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  // Weekly buckets, oldest first, only weeks that had something in them.
  const weekMap = new Map<string, { sessions: number; minutes: number }>();
  for (const s of inWindow) {
    const key = weekStartOf(s.session_date);
    const entry = weekMap.get(key) ?? { sessions: 0, minutes: 0 };
    entry.sessions += 1;
    entry.minutes += s.duration_min ?? 0;
    weekMap.set(key, entry);
  }
  const weekly = [...weekMap.entries()]
    .map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const energyDeltas = inWindow
    .filter((s) => s.energy_before != null && s.energy_after != null)
    .map((s) => (s.energy_after as number) - (s.energy_before as number));
  const sorenessDeltas = inWindow
    .filter((s) => s.soreness_before != null && s.soreness_after != null)
    .map((s) => (s.soreness_after as number) - (s.soreness_before as number));
  const perceived = inWindow
    .map((s) => s.perceived_recovery)
    .filter((v): v is number => v != null);

  // Next-day comparison. Metrics are keyed by date; a session on the 3rd is
  // compared against the reading on the 4th.
  const metricByDate = new Map(metrics.map((m) => [m.metric_date, m]));
  const sessionDates = new Set(inWindow.map((s) => s.session_date));

  const afterHrv: number[] = [];
  const afterRhr: number[] = [];
  for (const s of inWindow) {
    const [y, m, d] = s.session_date.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const row = metricByDate.get(next);
    if (row?.hrv_ms != null) afterHrv.push(row.hrv_ms);
    if (row?.resting_hr != null) afterRhr.push(row.resting_hr);
  }

  // Baseline is every other day in the window — days that neither followed a
  // session nor were one.
  const baselineHrv: number[] = [];
  const baselineRhr: number[] = [];
  for (const m of metrics) {
    if (daysBetween(m.metric_date, todayIso) > windowDays) continue;
    const [y, mo, d] = m.metric_date.split('-').map(Number);
    const prev = new Date(Date.UTC(y, mo - 1, d - 1)).toISOString().slice(0, 10);
    if (sessionDates.has(prev) || sessionDates.has(m.metric_date)) continue;
    if (m.hrv_ms != null) baselineHrv.push(m.hrv_ms);
    if (m.resting_hr != null) baselineRhr.push(m.resting_hr);
  }

  const totalMinutes = inWindow.reduce((n, s) => n + (s.duration_min ?? 0), 0);

  return {
    windowDays,
    totalSessions: inWindow.length,
    totalMinutes,
    sessionsPerWeek: round((inWindow.length / windowDays) * 7, 1) ?? 0,
    activeDays: new Set(inWindow.map((s) => s.session_date)).size,
    byModality: modalityStats,
    weekly,
    subjective: {
      ratedSessions: Math.max(energyDeltas.length, sorenessDeltas.length, perceived.length),
      avgEnergyDelta: round(mean(energyDeltas)),
      avgSorenessDelta: round(mean(sorenessDeltas)),
      avgPerceivedRecovery: round(mean(perceived)),
    },
    nextDay: {
      sampleSize: Math.max(afterHrv.length, afterRhr.length),
      hrvAfter: round(mean(afterHrv)),
      hrvBaseline: round(mean(baselineHrv)),
      rhrAfter: round(mean(afterRhr)),
      rhrBaseline: round(mean(baselineRhr)),
    },
  };
}

/** Most recent session per modality, for "days since" prompts. */
export function daysSinceEach(sessions: RecoverySession[], now?: string): Record<string, number> {
  const todayIso = now ?? appToday();
  const out: Record<string, number> = {};
  for (const s of sessions) {
    const days = daysBetween(s.session_date, todayIso);
    if (out[s.modality] === undefined || days < out[s.modality]) out[s.modality] = days;
  }
  return out;
}

export { dayOf };
