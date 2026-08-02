import { statusForScore, STATUS_STYLES, type StatusLevel } from '@/lib/status-colors';

export type TrendPoint = { date: string; value: number | null };

type Props = {
  label: string;
  unit: string;
  points: TrendPoint[];
  /** Lower values are better (asymmetry, ground contact time). */
  lowerIsBetter?: boolean;
  /** Optional thresholds for the traffic light, in the metric's own units. */
  bands?: { good: number; watch: number };
  /** Decimal places for the headline number. */
  precision?: number;
  /** Plain-language note on what the metric means. */
  hint?: string;
};

const W = 240;
const H = 44;

/**
 * A single metric as a sparkline plus its current value.
 *
 * Walking asymmetry and the running-dynamics measures are close to meaningless
 * as single readings — a 2.3% asymmetry today tells you nothing without
 * knowing whether last month was 1% or 4%. The line is the point; the number
 * is context.
 */
export default function TrendSparkline({
  label,
  unit,
  points,
  lowerIsBetter = false,
  bands,
  precision = 1,
  hint,
}: Props) {
  const values = points.filter((p): p is { date: string; value: number } => p.value !== null);
  if (values.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-400">No data yet</p>
      </div>
    );
  }

  const latest = values[values.length - 1];
  const min = Math.min(...values.map((v) => v.value));
  const max = Math.max(...values.map((v) => v.value));
  const span = Math.max(max - min, 1e-9);

  // Average of the first and last thirds, so the direction reflects a trend
  // rather than whichever day happened to be first and last.
  const third = Math.max(1, Math.floor(values.length / 3));
  const early = values.slice(0, third);
  const late = values.slice(-third);
  const mean = (xs: typeof values) => xs.reduce((s, v) => s + v.value, 0) / xs.length;
  const delta = values.length >= 3 ? mean(late) - mean(early) : 0;
  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  const meaningful = Math.abs(delta) > span * 0.08;

  let level: StatusLevel = 'unknown';
  if (bands) {
    const v = latest.value;
    const good = lowerIsBetter ? v <= bands.good : v >= bands.good;
    const watch = lowerIsBetter ? v <= bands.watch : v >= bands.watch;
    level = good ? 'good' : watch ? 'watch' : 'concern';
  }
  const style = bands ? STATUS_STYLES[level] : statusForScore(null);

  const path = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * W;
      const y = H - ((v.value - min) / span) * (H - 6) - 3;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${bands ? style.border : 'border-slate-300'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {bands && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text}`}>
            {style.label}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-slate-900">
          {latest.value.toFixed(precision)}
        </span>
        <span className="text-xs text-slate-500">{unit}</span>
        {meaningful && (
          <span
            className={`ml-auto text-xs font-medium ${improving ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {delta > 0 ? '↑' : '↓'} {improving ? 'improving' : 'worsening'}
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-11 w-full" preserveAspectRatio="none" role="img" aria-label={`${label} trend`}>
        <path d={path} fill="none" stroke={bands ? style.hex : '#0ea5e9'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{values[0].date.slice(5)}</span>
        <span>{values.length} readings</span>
        <span>{latest.date.slice(5)}</span>
      </div>

      {hint && <p className="mt-2 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}
