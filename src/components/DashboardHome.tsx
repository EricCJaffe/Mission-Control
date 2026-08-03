import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import HybridTrainingIndicator from "@/components/fitness/HybridTrainingIndicator";
import { computeHybridBalance } from "@/lib/fitness/hybrid-balance";
import { computePillarScores } from "@/lib/flourishing/spirit-soul-body";
import { statusForScore } from "@/lib/status-colors";
import PracticeTracker from "@/components/spirit/PracticeTracker";
import {
  isPracticeDue,
  todayIso as practiceToday,
  type Practice,
  type PracticeLog,
} from "@/lib/spirit/practices";
import {
  buildSubjectIndex,
  selectDailyRotation,
  CATEGORY_LABELS as PRAYER_CATEGORY_LABELS,
  type PrayerRequest,
} from "@/lib/spirit/prayer";
import { Dumbbell, Plus, CalendarDays, Target, CheckSquare, HeartPulse, Activity, Gauge } from "lucide-react";
import { FEATURES } from "@/lib/feature-flags";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function alignmentLabel(status?: string | null, score?: number | null, flags?: string[] | null) {
  if (status) return status;
  const hasFlags = (flags || []).length > 0;
  if (score !== null && score !== undefined) {
    if (score < 4 || hasFlags) return "off-track";
    if (score < 6) return "drifting";
    return "aligned";
  }
  return "unknown";
}

/** Compact vital readout for the dashboard strip. */
function VitalCard({
  icon,
  label,
  value,
  unit,
  asOf,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | null;
  unit: string;
  asOf: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border-2 border-slate-300 bg-white p-3 shadow-sm transition-shadow hover:shadow"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value ?? "—"}
        {value !== null && unit ? <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span> : null}
      </p>
      {/* Vitals are only as current as the last reading — say when. */}
      <p className="text-[10px] text-slate-400">{asOf ? asOf : "no data"}</p>
    </Link>
  );
}

/** A short list of open items with a one-tap add. */
function OpenList({
  title,
  icon,
  addHref,
  browseHref,
  items,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  addHref: string;
  browseHref: string;
  items: Array<{ id: string; label: string; hint?: string | null }>;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <Link
          href={addHref}
          aria-label={`Add ${title.toLowerCase()}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-slate-300 text-slate-600 transition-colors hover:border-slate-500 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-slate-700">{item.label}</span>
              {item.hint && (
                <span className="shrink-0 text-[11px] text-slate-400">{item.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href={browseHref} className="mt-3 inline-block text-xs font-medium text-blue-600 hover:text-blue-700">
        View all →
      </Link>
    </div>
  );
}

export default async function DashboardHome() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const today = new Date();
  const todayIso = formatDate(today);
  const start = startOfDay(today).toISOString();
  const end = endOfDay(today).toISOString();
  const HYBRID_CONTEXT_DAYS = 30;
  const hybridSince = new Date(
    today.getTime() - HYBRID_CONTEXT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    alignmentResult,
    flourishingResult,
    prioritiesResult,
    eventsResult,
    tasksResult,
    hybridWorkoutsResult,
    hybridRecoveryResult,
    rhrResult,
    hrvResult,
    bpResult,
    plannedWorkoutResult,
    goalsResult,
    prayerResult,
    prayerSubjectsResult,
    practicesResult,
    practiceLogsResult,
    readingSubsResult,
  ] = await Promise.all([
    supabase
      .from("monthly_reviews")
      .select("id,alignment_score,alignment_status,drift_flags,period_start")
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("flourishing_profiles")
      .select("display_index,strongest_domains,growth_domains,overall_message,updated_at,domain_scores")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("daily_priorities")
      .select("id,rank,domain,title,task_id")
      .eq("date", todayIso)
      .order("rank", { ascending: true }),
    supabase
      .from("calendar_events")
      .select("id,title,start_at,end_at,event_type,domain")
      .gte("start_at", start)
      .lte("start_at", end)
      .order("start_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("id,title,status,due_date,priority")
      .order("created_at", { ascending: false })
      .limit(50),
    // Hybrid balance needs a 30-day look-back so the ring can show the week
    // against a longer trend.
    supabase
      .from("workout_logs")
      .select("id,workout_date,workout_type,source,duration_minutes")
      .eq("user_id", user.id)
      .gte("workout_date", hybridSince),
    supabase
      .from("recovery_sessions")
      .select("id,session_date,modality,duration_min")
      .eq("user_id", user.id)
      .in("modality", ["stretching", "mobility"])
      .gte("session_date", hybridSince.slice(0, 10)),
    // Latest non-null RHR/HRV: the newest body_metrics row is written daily by
    // the watch and often carries neither, so each is looked up on its own.
    supabase
      .from("body_metrics")
      .select("metric_date,resting_hr")
      .eq("user_id", user.id)
      .not("resting_hr", "is", null)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("body_metrics")
      .select("metric_date,hrv_ms")
      .eq("user_id", user.id)
      .not("hrv_ms", "is", null)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bp_readings")
      .select("reading_date,systolic,diastolic")
      .eq("user_id", user.id)
      .order("reading_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Every session scheduled today, across all active plans — strength and
    // cardio run concurrently, so maybeSingle() would arbitrarily drop one.
    supabase
      .from("planned_workouts")
      .select("id,workout_type,day_label,status,scheduled_time")
      .eq("user_id", user.id)
      .eq("scheduled_date", todayIso)
      .order("scheduled_time", { ascending: true, nullsFirst: false }),
    supabase
      .from("goals")
      .select("id,title,status")
      .eq("user_id", user.id)
      .neq("status", "complete")
      .limit(5),
    supabase
      .from("prayer_requests")
      .select("id, subject_id, body, mode, status, urgent, last_prayed_at, prayed_count, cadence, cadence_anchor, due_date")
      .eq("user_id", user.id)
      .in("status", ["open", "waiting"]),
    supabase
      .from("prayer_subjects")
      .select("id, name, category, parent_id")
      .eq("user_id", user.id)
      .eq("archived", false),
    supabase
      .from("practices")
      .select("id,key,label,cadence,target_per_period,sort_order,created_at,due_weekday,due_day_of_month")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("practice_logs")
      .select("practice_id,log_date,completed")
      .eq("user_id", user.id)
      .gte("log_date", hybridSince.slice(0, 10)),
    supabase
      .from("reading_plan_subscriptions")
      .select("id,plan_id,reading_plans(name,day_count)")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const alignment = alignmentResult.data;
  const flourishing = flourishingResult.data;
  const alignmentStatus = alignmentLabel(
    alignment?.alignment_status,
    alignment?.alignment_score,
    alignment?.drift_flags || []
  );

  const priorities = prioritiesResult.data || [];
  const events = eventsResult.data || [];

  const tasks = tasksResult.data || [];
  const mustDo = tasks.filter((t) => t.due_date === todayIso);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < todayIso);



  const statusStyles: Record<string, string> = {
    aligned: "bg-blue-700 text-white",
    drifting: "bg-amber-500 text-white",
    "off-track": "bg-rose-600 text-white",
    unknown: "bg-slate-400 text-white",
  };

  const hybridSessions = [
    ...(hybridWorkoutsResult.data ?? []).map((w) => ({
      id: w.id as string,
      date: w.workout_date as string,
      type: (w.workout_type as string) ?? "",
      source: (w.source as string) ?? null,
      minutes: (w.duration_minutes as number) ?? 0,
    })),
    // Recovery sessions are date-only; noon keeps them inside the window
    // regardless of the viewer's offset.
    ...(hybridRecoveryResult.data ?? []).map((r) => ({
      id: r.id as string,
      date: `${r.session_date as string}T12:00:00Z`,
      type: (r.modality as string) ?? "",
      source: "recovery",
      minutes: (r.duration_min as number) ?? 0,
    })),
  ];
  // Monthly cadence: the survey is only useful if it's retaken, and a stale
  // score presented as current is worse than an obvious prompt to redo it.

  // Pillars lead the page: this is the one row that answers "how am I doing".
  const pillarScores = computePillarScores(
    ((flourishing?.domain_scores ?? []) as Array<{ domain: string; score: number | null }>).map(
      (d) => ({ domain: d.domain, score: d.score }),
    ),
  );

  const rhr = rhrResult.data;
  const hrv = hrvResult.data;
  const bp = bpResult.data;
  const plannedWorkouts = plannedWorkoutResult.data ?? [];
  const goals = goalsResult.data ?? [];
  const allPractices = (practicesResult.data ?? []) as Practice[];
  const practiceLogsToday = new Set(
    (practiceLogsResult.data ?? [])
      .filter((l) => l.log_date === todayIso && l.completed)
      .map((l) => l.practice_id),
  );
  // Only what is due today and still outstanding. Church on a Tuesday is not a
  // missed practice, it is not due; and a completed one has served its purpose
  // — leaving it on the list turns a prompt into a scoreboard.
  const practices = allPractices.filter(
    (p) => isPracticeDue(p, todayIso) && !practiceLogsToday.has(p.id),
  );
  const practicesDoneToday = allPractices.filter(
    (p) => isPracticeDue(p, todayIso) && practiceLogsToday.has(p.id),
  ).length;

  // Today's rotation, computed here so the card shows real items rather than a
  // count. A number tells you the list exists; the names get you praying.
  const prayerRotation = selectDailyRotation((prayerResult.data ?? []) as PrayerRequest[], { size: 3 });
  const prayerActive = (prayerResult.data ?? []).length;
  // Who each request is for. "Freedom from alcoholism" with no name attached
  // is not something you can act on from a dashboard.
  const prayerSubjects = buildSubjectIndex(prayerSubjectsResult.data ?? []);
  const practiceLogs = (practiceLogsResult.data ?? []) as PracticeLog[];

  // Where each active reading plan stands. Progress is counted per
  // subscription so a day read shows on the dashboard, not just in the module.
  const readingSubs = readingSubsResult.data ?? [];
  const readingProgress = await Promise.all(
    readingSubs.map(async (sub) => {
      const { data: rows } = await supabase
        .from("reading_plan_progress")
        .select("day_number,completed_on")
        .eq("subscription_id", sub.id);
      const done = rows ?? [];
      const doneDays = new Set(done.map((d) => d.day_number));
      const planMeta = sub.reading_plans as unknown as { name: string; day_count: number } | null;
      let currentDay = 1;
      while (doneDays.has(currentDay) && currentDay <= (planMeta?.day_count ?? 1)) currentDay += 1;
      return {
        id: sub.id,
        name: planMeta?.name ?? "Reading plan",
        dayCount: planMeta?.day_count ?? 0,
        currentDay: Math.min(currentDay, planMeta?.day_count ?? 1),
        completed: done.length,
        doneToday: done.some((d) => d.completed_on === todayIso),
      };
    }),
  );

  const hybridWeek = computeHybridBalance(hybridSessions, { windowDays: 7, now: today });
  const hybridMonth = computeHybridBalance(hybridSessions, {
    windowDays: HYBRID_CONTEXT_DAYS,
    now: today,
  });

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mission alignment for Spirit, Soul, and Body.
          </p>
        </div>
        <div className="text-sm text-slate-500">
          Signed in as: <span className="font-medium text-slate-900">{user.email}</span>
        </div>
      </div>

      {/* Spirit / Soul / Body — the app's own frame, at the top where it
          belongs. Colour carries status, and every card also states it in
          words so hue is never the only signal. */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {pillarScores.map((pillar) => {
          const style = statusForScore(pillar.score);
          return (
            <Link
              key={pillar.pillar}
              href={
                pillar.pillar === "body"
                  ? "/fitness"
                  : pillar.pillar === "spirit"
                    ? "/spirit"
                    : "/flourishing"
              }
              className={`rounded-2xl border-2 p-4 shadow-sm transition-shadow hover:shadow ${style.border} ${style.bg}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  {pillar.label}
                </span>
                {pillar.trend !== "unknown" && (
                  <span className="text-[11px] text-slate-500">
                    {pillar.trend === "progressing" ? "↑" : pillar.trend === "slipping" ? "↓" : "→"}
                  </span>
                )}
              </div>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${style.text}`}>
                {pillar.score ?? "—"}
              </p>
              <p className="text-xs font-medium text-slate-600">{style.label}</p>
              {pillar.weakest && (
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  weakest: {pillar.weakest.replace(/_/g, " ")}
                </p>
              )}
            </Link>
          );
        })}
      </section>

      {FEATURES.monthlyAlignment && (
        <section className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-blue-800">
                Alignment Status
              </div>
              <div className="mt-2 text-2xl font-semibold">Monthly Alignment</div>
              <div className="mt-1 text-sm text-slate-500">
                Based on the latest review score and drift flags.
              </div>
            </div>
            <div className={`rounded-full px-4 py-2 text-sm font-semibold ${statusStyles[alignmentStatus]}`}>
              {alignmentStatus === "aligned" && "Aligned"}
              {alignmentStatus === "drifting" && "Drifting"}
              {alignmentStatus === "off-track" && "Off-track"}
              {alignmentStatus === "unknown" && "No data yet"}
            </div>
          </div>

          <form className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]" action="/dashboard/alignment" method="post">
            <input type="hidden" name="period_start" value={todayIso.slice(0, 7) + "-01"} />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              name="alignment_score"
              type="number"
              min="0"
              max="10"
              placeholder="Alignment score (0-10)"
              defaultValue={alignment?.alignment_score ?? ""}
            />
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              name="alignment_status"
              defaultValue={alignment?.alignment_status ?? ""}
            >
              <option value="">Auto</option>
              <option value="aligned">Aligned</option>
              <option value="drifting">Drifting</option>
              <option value="off-track">Off-track</option>
            </select>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              name="drift_flags"
              placeholder="Drift flags (comma-separated)"
              defaultValue={(alignment?.drift_flags || []).join(", ")}
            />
            <button className="md:col-span-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Update Alignment
            </button>
          </form>
        </section>
      )}

      {/* Act row: the two things wanted most days — start a workout, and see
          what's already planned. */}
      <section className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Today&rsquo;s training</p>
          {plannedWorkouts.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {plannedWorkouts.map((w) => (
                <li key={w.id} className="flex items-baseline gap-2 leading-snug">
                  <span
                    className={`text-sm font-bold ${
                      w.status === "completed" ? "text-slate-400 line-through" : "text-slate-900"
                    }`}
                  >
                    {w.day_label || w.workout_type}
                  </span>
                  {w.status === "completed" && (
                    <span className="text-[11px] font-semibold text-emerald-600">done</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-sm text-slate-500">Nothing scheduled — log whatever you do.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/fitness/log"
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl bg-lime-500 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-lime-600"
          >
            <Dumbbell className="h-5 w-5" />
            Log Workout
          </Link>
          <Link
            href="/fitness/log/class"
            className="flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-lime-500 bg-lime-50 px-4 text-sm font-bold text-lime-700 transition-colors hover:bg-lime-100"
          >
            Jiu Jitsu
          </Link>
        </div>
      </section>

      {/* Health vitals at a glance. */}
      <section className="mt-3 grid grid-cols-3 gap-3">
        <VitalCard
          icon={<HeartPulse className="h-4 w-4 text-rose-500" />}
          label="Resting HR"
          value={rhr?.resting_hr ?? null}
          unit="bpm"
          asOf={rhr?.metric_date ?? null}
          href="/fitness/rhr"
        />
        <VitalCard
          icon={<Activity className="h-4 w-4 text-violet-500" />}
          label="HRV"
          value={hrv?.hrv_ms ?? null}
          unit="ms"
          asOf={hrv?.metric_date ?? null}
          href="/fitness/hrv"
        />
        <VitalCard
          icon={<Gauge className="h-4 w-4 text-sky-500" />}
          label="Blood pressure"
          value={bp ? `${bp.systolic}/${bp.diastolic}` : null}
          unit=""
          asOf={bp?.reading_date?.slice(0, 10) ?? null}
          href="/fitness/bp"
        />
      </section>

      {/* Priority matrix — horizontal so it reads as a strip, not a list. */}
      {priorities.length > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Today&rsquo;s priorities
            </h2>
            <Link href="/dashboard/priorities" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Edit
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {priorities.slice(0, 3).map((p, i) => {
              const tone = [
                "border-rose-400 bg-rose-50 text-rose-900",
                "border-amber-400 bg-amber-50 text-amber-900",
                "border-sky-400 bg-sky-50 text-sky-900",
              ][i % 3];
              return (
                <div key={p.id} className={`rounded-2xl border-2 p-4 shadow-sm ${tone}`}>
                  <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
                    {p.domain || `Priority ${i + 1}`}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug">{p.title}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Daily practices — the Spirit checklist, on the one page that gets
          opened every morning. */}
      {practices.length > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Practices today
              {practicesDoneToday > 0 && (
                <span className="ml-2 font-normal normal-case tracking-normal text-emerald-600">
                  {practicesDoneToday} done
                </span>
              )}
            </h2>
            <Link href="/spirit" className="text-xs font-medium text-amber-700 hover:text-amber-800">
              Open Spirit
            </Link>
          </div>
          <PracticeTracker practices={practices} logs={practiceLogs} today={practiceToday(today)} />
        </section>
      )}

      {prayerActive > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Prayer
            </h2>
            <Link href="/spirit/prayer" className="text-xs font-medium text-indigo-700 hover:text-indigo-800">
              Open prayer
            </Link>
          </div>
          <Link
            href="/spirit/prayer"
            className="block rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
          >
            <p className="text-xs text-slate-500">
              {prayerActive} active · next up in the rotation
            </p>
            <ul className="mt-1.5 space-y-1">
              {prayerRotation.map((r) => {
                const ctx = r.subject_id ? prayerSubjects.get(r.subject_id) : undefined;
                return (
                  <li key={r.id} className="truncate text-sm text-slate-800">
                    {r.urgent && <span className="mr-1 font-semibold text-rose-600">!</span>}
                    {ctx && (
                      <span className="text-xs font-semibold text-indigo-600">
                        {PRAYER_CATEGORY_LABELS[ctx.category] ?? ctx.category} · {ctx.name}
                        <span className="mx-1 text-slate-300">—</span>
                      </span>
                    )}
                    {r.body}
                  </li>
                );
              })}
            </ul>
          </Link>
        </section>
      )}

      {readingProgress.length > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Bible reading
            </h2>
            <Link href="/spirit/reading" className="text-xs font-medium text-amber-700 hover:text-amber-800">
              All plans
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {readingProgress.map((r) => {
              const pct = r.dayCount ? Math.round((r.completed / r.dayCount) * 100) : 0;
              return (
                <Link
                  key={r.id}
                  href="/spirit/reading"
                  className={`rounded-2xl border-2 bg-white p-4 shadow-sm transition-shadow hover:shadow ${
                    r.doneToday ? "border-emerald-400" : "border-amber-400"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                    <span
                      className={`shrink-0 text-[11px] font-semibold ${
                        r.doneToday ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {r.doneToday ? "Read today" : "Continue"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Day {r.currentDay} of {r.dayCount} · {pct}%
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-4">
        <HybridTrainingIndicator primary={hybridWeek} context={hybridMonth} />
      </section>

      {/* Open items, each with a one-tap way to add another. */}
      <section className="mt-4 grid gap-3 md:grid-cols-3">
        <OpenList
          title="Tasks"
          icon={<CheckSquare className="h-4 w-4 text-green-600" />}
          addHref="/tasks/new"
          browseHref="/tasks"
          items={[...mustDo, ...overdue.filter((t) => !mustDo.some((m) => m.id === t.id))]
            .slice(0, 5)
            .map((t) => ({
              id: t.id,
              label: t.title,
              hint: t.due_date && t.due_date < todayIso ? "overdue" : t.due_date === todayIso ? "today" : null,
            }))}
          emptyLabel="Nothing due"
        />
        <OpenList
          title="Events"
          icon={<CalendarDays className="h-4 w-4 text-orange-600" />}
          addHref="/calendar"
          browseHref="/calendar"
          items={events.slice(0, 5).map((e) => ({
            id: e.id,
            label: e.title,
            hint: formatTime(e.start_at),
          }))}
          emptyLabel="Nothing today"
        />
        <OpenList
          title="Goals"
          icon={<Target className="h-4 w-4 text-cyan-600" />}
          addHref="/goals"
          browseHref="/goals"
          items={goals.slice(0, 5).map((g) => ({ id: g.id, label: g.title, hint: g.status }))}
          emptyLabel="No open goals"
        />
      </section>
    </main>
  );
}
