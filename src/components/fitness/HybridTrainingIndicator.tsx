import Link from 'next/link';
import type { HybridBalance } from '@/lib/fitness/hybrid-balance';

type Props = {
  /** Primary window — the ring and headline number. */
  primary: HybridBalance;
  /** Longer window, shown as context beneath. */
  context?: HybridBalance | null;
};

const RING = 168;
const STROKE = 15;
const R = (RING - STROKE) / 2;
const C = 2 * Math.PI * R;
/** Visual break between the two arcs so they read as separate quantities. */
const GAP = 5;

function minutesLabel(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function verdict(b: HybridBalance): { title: string; detail: string } {
  if (b.balanceScore === null) {
    return { title: 'No training yet', detail: `Nothing logged in the last ${b.windowDays} days.` };
  }
  if (b.leaning === 'balanced') {
    return { title: 'Balanced', detail: 'Strength and cardio are within 10 points of even.' };
  }
  const heavy = b.leaning === 'strength' ? 'strength' : 'cardio';
  const light = b.leaning === 'strength' ? 'cardio' : 'strength';
  const gap =
    b.leaning === 'strength'
      ? b.strengthMinutes - b.cardioMinutes
      : b.cardioMinutes - b.strengthMinutes;
  return {
    title: `${heavy[0].toUpperCase()}${heavy.slice(1)}-leaning`,
    detail: `${minutesLabel(gap)} more ${heavy} than ${light}.`,
  };
}

/**
 * Hybrid training balance ring.
 *
 * Measures MINUTES rather than session count — a 15-minute run and a
 * 75-minute lift aren't one-for-one. Strength and cardio are the two arcs;
 * mobility sits below on its own target so it can't dilute the 50/50 goal.
 */
export default function HybridTrainingIndicator({ primary, context }: Props) {
  const { title, detail } = verdict(primary);
  const hasData = primary.balanceScore !== null && primary.strengthShare !== null;

  const strengthLen = hasData ? Math.max(0, primary.strengthShare! * C - GAP) : 0;
  const cardioLen = hasData ? Math.max(0, (1 - primary.strengthShare!) * C - GAP) : 0;

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Hybrid Training
        </h2>
        <span className="text-[11px] text-slate-400">last {primary.windowDays} days</span>
      </div>

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="relative shrink-0" style={{ width: RING, height: RING }}>
          <svg width={RING} height={RING} className="-rotate-90">
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={STROKE}
            />
            {hasData && (
              <>
                <circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={R}
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${strengthLen} ${C - strengthLen}`}
                  strokeDashoffset={-GAP / 2}
                />
                <circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={R}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${cardioLen} ${C - cardioLen}`}
                  strokeDashoffset={-(primary.strengthShare! * C + GAP / 2)}
                />
              </>
            )}
            {/* The 50/50 mark. The whole svg is rotated -90° so the arcs start
                at 12 o'clock; halfway round is therefore the LEFT edge here,
                which renders at the bottom of the ring. */}
            <line
              x1={RING / 2 - R - STROKE / 2}
              y1={RING / 2}
              x2={RING / 2 - R + STROKE / 2}
              y2={RING / 2}
              stroke="#475569"
              strokeWidth={2}
              opacity={0.55}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold tabular-nums text-slate-900">
              {primary.balanceScore ?? '—'}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              balance
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 text-sm text-slate-500">{detail}</p>

          <div className="mt-4 space-y-2">
            <Split
              color="#8b5cf6"
              label="Strength"
              minutes={primary.strengthMinutes}
              sessions={primary.strengthSessions}
              share={primary.strengthShare}
            />
            <Split
              color="#0ea5e9"
              label="Cardio"
              minutes={primary.cardioMinutes}
              sessions={primary.cardioSessions}
              share={primary.cardioShare}
            />
          </div>
        </div>
      </div>

      {/* Mobility is tracked against its own target rather than folded into the
          balance, so adding it can't move the strength/cardio goal off 50/50. */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Mobility
          </span>
          <span className="text-xs tabular-nums text-slate-500">
            {minutesLabel(primary.mobilityMinutes)}
            <span className="text-slate-300"> / {minutesLabel(primary.mobilityTargetMin)}</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-amber-400"
            style={{ width: `${primary.mobilityPct}%` }}
          />
        </div>
      </div>

      {context && context.balanceScore !== null && (
        <p className="mt-3 text-xs text-slate-400">
          Last {context.windowDays} days: {context.balanceScore} balance
          {context.strengthShare !== null && (
            <> ({Math.round(context.strengthShare * 100)}% strength / {Math.round(context.cardioShare! * 100)}% cardio)</>
          )}
        </p>
      )}

      {(primary.droppedDuplicateMinutes > 0 || primary.unclassifiedMinutes > 0) && (
        <p className="mt-2 text-[11px] text-slate-400">
          {primary.droppedDuplicateMinutes > 0 && (
            <>Ignored {minutesLabel(primary.droppedDuplicateMinutes)} of duplicate watch/app records. </>
          )}
          {primary.unclassifiedMinutes > 0 && (
            <>{minutesLabel(primary.unclassifiedMinutes)} uncategorised.</>
          )}
        </p>
      )}

      <Link
        href="/fitness"
        className="mt-4 inline-block text-xs font-medium text-blue-700 hover:text-blue-800"
      >
        Open fitness →
      </Link>
    </div>
  );
}

function Split({
  color,
  label,
  minutes,
  sessions,
  share,
}: {
  color: string;
  label: string;
  minutes: number;
  sessions: number;
  share: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-medium text-slate-700">{label}</span>
      <span className="ml-auto tabular-nums text-slate-500">
        {minutesLabel(minutes)}
        <span className="text-slate-300"> · {sessions}x</span>
      </span>
      <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-slate-900">
        {share === null ? '—' : `${Math.round(share * 100)}%`}
      </span>
    </div>
  );
}
