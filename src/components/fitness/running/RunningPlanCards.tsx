import { Award, BookOpen, CalendarDays, ClipboardCheck, Flag, HeartPulse, Lightbulb, Medal, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { HealthDoc, LoggedRun, RunningData } from '@/lib/fitness/running-data';
import { encouragement, paceText, scoreSession, summarize, type WeekSummary } from '@/lib/fitness/running-score';
import { ActivityUploader, AppleHealthPull, ManualRunForm, RecStatus, RunNoteEditor } from './RunningClients';

const CARD = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm';

function Card({ title, icon, children, className = '' }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARD} ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, warn = false }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold ${warn ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const fmt = (n: number | null | undefined, unit = '') => (n == null ? '—' : `${n}${unit}`);

export default function RunningPlanCards({ data, today }: { data: RunningData; today: string }) {
  const { plan, weeks, runs } = data;
  const s = summarize(plan, weeks, runs, today);
  const cur = s.current;
  const ceiling = plan.rules.hr_ceiling;
  const recent = [...runs].reverse().slice(0, 5);
  const earned = s.badges.filter((b) => b.earnedOn);
  const newThisWeek = cur ? earned.filter((b) => b.earnedOn! >= cur.week.start && b.earnedOn! <= cur.week.end) : [];

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-blue-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-200">Running plan{data.version ? ` · ${data.version}` : ''}</p>
            <h2 className="text-2xl font-semibold">{data.title}</h2>
            <p className="text-sm text-blue-100">
              {plan.race.name} · {plan.race.date} · {plan.race.distance_mi} mi{plan.race.goal ? ` · ${plan.race.goal}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold">{s.daysToRace}</p>
            <p className="text-xs text-blue-200">days to race</p>
          </div>
        </div>
        {cur && (
          <p className="mt-4 text-sm text-blue-100">
            Week {cur.week.index} of {weeks.length} · {cur.week.phase ?? 'Between phases'}
            {cur.week.deload ? ' · deload week' : ''}
            {cur.week.longRunMi != null ? ` · long run ${cur.week.longRunMi} mi` : ''}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Weekly running card */}
        <Card title="This week" icon={<CalendarDays className="h-4 w-4" aria-hidden />} className="lg:col-span-2">
          {cur ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Miles" value={fmt(cur.miles)} sub={s.previous ? `last week ${s.previous.miles}` : undefined} />
                <Stat label="Runs" value={`${cur.runs}/${cur.week.runs}`} sub={cur.longestMi ? `longest ${cur.longestMi} mi` : undefined} />
                <Stat label="Avg pace" value={paceText(cur.avgPaceSec)} sub="per mile" />
                <Stat label="Avg HR" value={fmt(cur.avgHr)} sub={cur.z2Pct != null ? `${cur.z2Pct}% in Z2` : undefined} />
                <Stat
                  label="Max HR"
                  value={fmt(cur.maxHr)}
                  sub={ceiling != null ? `ceiling ${ceiling}` : undefined}
                  warn={cur.overCeiling}
                />
                <Stat label="Feel" value={cur.feel != null ? `${cur.feel}/10` : '—'} />
                <Stat label="Points" value={`+${cur.points}`} sub={`total ${s.totalPoints}`} />
                <Stat label="Streak" value={`${s.streakWeeks} wk`} sub={cur.complete ? 'this week done' : undefined} />
              </div>
              {newThisWeek.length > 0 && (
                <p className="mt-3 text-sm text-slate-600">
                  New badges: {newThisWeek.map((b) => `${b.emoji} ${b.label}`).join(' · ')}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {today < plan.start_date ? `The plan starts ${plan.start_date}.` : 'Race week is behind you.'}
            </p>
          )}
        </Card>

        {/* Encouragement */}
        <Card title="Updates" icon={<Sparkles className="h-4 w-4" aria-hidden />}>
          <ul className="space-y-2 text-sm text-slate-700">
            {encouragement(s).map((line, i) => (
              <li key={i} className="rounded-lg bg-blue-50 px-3 py-2">{line}</li>
            ))}
          </ul>
        </Card>

        {/* Progress */}
        <Card title="Progress" icon={<TrendingUp className="h-4 w-4" aria-hidden />}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total miles" value={fmt(s.totalMiles)} />
            <Stat label="Runs logged" value={String(s.sessions)} />
            <Stat label="Longest run" value={`${s.longestRunMi} mi`} />
            <Stat label="Points" value={String(s.totalPoints)} />
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Longest run vs race distance</span>
              <span>{Math.min(100, Math.round((s.longestRunMi / plan.race.distance_mi) * 100))}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-blue-600"
                style={{ width: `${Math.min(100, (s.longestRunMi / plan.race.distance_mi) * 100)}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Badges */}
        <Card title="Badges" icon={<Medal className="h-4 w-4" aria-hidden />}>
          <ul className="grid grid-cols-2 gap-2">
            {s.badges.map((b) => (
              <li
                key={b.id}
                title={b.earnedOn ? `Earned ${b.earnedOn}` : b.progress ?? 'Not yet'}
                className={`rounded-lg border px-2 py-2 text-xs ${b.earnedOn ? 'border-slate-300 bg-white text-slate-800' : 'border-dashed border-slate-200 text-slate-400'}`}
              >
                <span className={b.earnedOn ? '' : 'grayscale'}>{b.emoji}</span> {b.label}
                {!b.earnedOn && b.progress && <span className="block text-[11px]">{b.progress}</span>}
              </li>
            ))}
          </ul>
        </Card>

        {/* Tips */}
        <Card title="Tips" icon={<Lightbulb className="h-4 w-4" aria-hidden />}>
          <ul className="space-y-2 text-sm text-slate-700">
            {cur?.week.intensity && <li><strong>This week:</strong> {cur.week.intensity}</li>}
            {cur?.week.needsClearance && (
              <li className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-800">
                <HeartPulse className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Needs your doctor&apos;s OK first: {cur.week.needsClearance}
              </li>
            )}
            {(plan.rules.notes ?? []).map((n, i) => <li key={i}>{n}</li>)}
          </ul>
          {plan.warning_signs?.length ? (
            <details className="mt-3 text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium text-red-700">
                <TriangleAlert className="h-4 w-4" aria-hidden /> Warning signs: stop
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                {plan.warning_signs.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent runs + upload */}
        <Card title="Runs" icon={<Award className="h-4 w-4" aria-hidden />} className="lg:col-span-2">
          <ActivityUploader compact />
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <ManualRunForm today={today} />
            <AppleHealthPull />
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {recent.length === 0 && <li className="py-3 text-sm text-slate-500">No runs logged in this plan yet.</li>}
            {recent.map((r) => <RunRow key={r.id} run={r} ceiling={ceiling} rules={plan.rules} />)}
          </ul>
        </Card>

        {/* Coaching */}
        {data.recs.length > 0 && (
          <Card title="Coaching" icon={<ClipboardCheck className="h-4 w-4" aria-hidden />} className="lg:col-span-3 lg:order-last">
            <ol className="space-y-2">
              {data.recs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 text-slate-800">
                    <span className="mr-2 font-semibold text-slate-500">{r.ordinal}.</span>
                    {r.text}
                    {r.reviewer && <span className="ml-1 text-xs text-slate-500">({r.reviewer})</span>}
                  </span>
                  <RecStatus id={r.id} status={r.status} />
                </li>
              ))}
            </ol>
          </Card>
        )}

        {/* Plan timeline */}
        <Card title="The plan" icon={<Flag className="h-4 w-4" aria-hidden />}>
          <ol className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
            {s.weeks.map((w) => <WeekRow key={w.week.index} w={w} today={today} />)}
          </ol>
        </Card>
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  garmin_upload: 'Garmin upload',
  apple_health: 'Apple Health',
  manual: 'Logged by hand',
};

/** Reference docs, e.g. how Apple Health reaches the app. Shown with or without a plan. */
export function HealthAccessCards({ docs }: { docs: HealthDoc[] }) {
  if (docs.length === 0) return null;
  return (
    <div className="space-y-3">
      {docs.map((d) => (
        <Card key={d.id} title={d.title} icon={<BookOpen className="h-4 w-4" aria-hidden />}>
          <p className="mb-2 text-xs text-slate-500">Updated {d.updatedAt.slice(0, 10)}</p>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-blue-700">Show the reference</summary>
            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{d.body}</div>
          </details>
        </Card>
      ))}
    </div>
  );
}

function RunRow({ run, ceiling, rules }: { run: LoggedRun; ceiling: number | undefined; rules: RunningData['plan']['rules'] }) {
  const score = scoreSession(run, rules);
  const over = ceiling != null && run.maxHr != null && run.maxHr > ceiling;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-slate-900">
          {run.date} · {run.distanceMi} mi
          <span className="ml-2 text-sm font-normal text-slate-500">
            {run.pace ?? paceText(run.durationSec ? Math.round(run.durationSec / run.distanceMi) : null)}/mi
            {run.avgHr != null && ` · avg ${run.avgHr}`}
            {run.maxHr != null && <span className={over ? 'text-red-600' : ''}> · max {run.maxHr}</span>}
            {run.z2Pct != null && ` · Z2 ${run.z2Pct}%`}
          </span>
        </p>
        <p className="text-sm font-semibold text-blue-700" title={score.bonuses.join(', ')}>+{score.points}</p>
      </div>
      <p className="text-xs text-slate-500">
        {SOURCE_LABEL[run.source] ?? run.source}
        {run.longestContinuousMin != null && ` · longest continuous ${run.longestContinuousMin} min`}
        {run.gainFt != null && ` · ${run.gainFt} ft gain`}
        {run.kcal != null && ` · ${run.kcal} kcal`}
      </p>
      <RunNoteEditor id={run.id} feel={run.feel} notes={run.notes} />
    </li>
  );
}

function WeekRow({ w, today }: { w: WeekSummary; today: string }) {
  const isCurrent = today >= w.week.start && today <= w.week.end;
  const past = w.week.end < today;
  return (
    <li
      aria-current={isCurrent ? 'true' : undefined}
      className={`rounded-lg border px-3 py-2 text-sm ${
        isCurrent ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
      } ${past && !isCurrent ? 'opacity-80' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800">
          Wk {w.week.index}
          <span className="ml-1 font-normal text-slate-500">{w.week.start.slice(5)}</span>
        </span>
        <span className="text-xs text-slate-500">
          {w.week.phase ?? 'Rest'}
          {w.week.deload ? ' · deload' : ''}
          {w.week.raceWeek ? ' · race' : ''}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs text-slate-600">
        <span>
          {w.week.runs} runs{w.week.longRunMi != null ? ` · long ${w.week.longRunMi} mi` : ''}
        </span>
        {(past || isCurrent) && (
          <span className={w.complete ? 'font-medium text-green-700' : ''}>
            {w.runs}/{w.week.runs} · {w.miles} mi
          </span>
        )}
      </div>
    </li>
  );
}
