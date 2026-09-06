import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  Compass,
  ExternalLink,
  HeartPulse,
  Hourglass,
  Mail,
  Target,
  Users,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { collect, dayLabel } from "@/lib/brief/collect";
import { periodFor } from "@/lib/brief/generate";
import {
  MATRIX_LABEL,
  MATRIX_ORDER,
  STALE_AFTER_HOURS,
  type BriefTask,
  type DayCell,
  type MatrixKey,
  type SourceHealth,
  type StaleTask,
  type StaleVerdict,
  TASK_STALE_AFTER_DAYS,
} from "@/lib/brief/types";

/**
 * The weekly brief as a page, not as an email.
 *
 * `/briefs` and `/briefs/[id]` hold the stored briefs: a 640px inline-CSS
 * table built to survive Outlook, with Claude's prose in it. This is the other
 * half — the same payload, computed fresh on every load, laid out for a phone
 * and a wide screen using the app's own cards.
 *
 * Two deliberate omissions:
 *
 * 1. NO MODEL CALL. `collect()` only. The numbers are the whole truth of a
 *    brief (see the header of `src/lib/brief/types.ts`); the narrative is
 *    commentary, and commentary belongs in the thing that gets sent once a
 *    week, not in a page reloaded ten times a day.
 * 2. NO STORAGE. Nothing here writes, so opening this page never affects what
 *    the Sunday cron generates or what `/briefs` lists.
 *
 * The one correctness rule is staleness. If a sync has gone quiet the banner
 * says so before anything else is read, because stale data rendered
 * confidently is indistinguishable from good data.
 */

export const dynamic = "force-dynamic";

const MATRIX_ICON: Record<MatrixKey, React.ReactNode> = {
  god_first: <Compass className="h-4 w-4" />,
  health: <HeartPulse className="h-4 w-4" />,
  family: <Users className="h-4 w-4" />,
  impact: <Briefcase className="h-4 w-4" />,
  admin: <CheckSquare className="h-4 w-4" />,
};

/** The four tiles. `admin` is not one of them; it is reported underneath. */
const TILE_KEYS: readonly MatrixKey[] = MATRIX_ORDER.filter((k) => k !== "admin");

function staleLine(source: SourceHealth): string {
  if (source.ageHours === null) return `${source.label} has never completed a sync.`;
  const hours = Math.round(source.ageHours);
  if (hours < 48) return `${source.label} last synced ${hours} hours ago.`;
  return `${source.label} last synced ${Math.floor(hours / 24)} days ago.`;
}

function hoursAwayLabel(hoursAway: number | null): string | null {
  if (hoursAway === null) return null;
  if (hoursAway < 0) return "already started";
  if (hoursAway < 1) return "within the hour";
  if (hoursAway < 48) return `in ${Math.round(hoursAway)}h`;
  return `in ${Math.round(hoursAway / 24)} days`;
}

function dueLabel(task: BriefTask): string {
  if (task.daysUntilDue === null) return "no date";
  if (task.daysUntilDue < 0) {
    const late = -task.daysUntilDue;
    return late === 1 ? "1 day late" : `${late} days late`;
  }
  if (task.daysUntilDue === 0) return "due today";
  if (task.daysUntilDue === 1) return "due tomorrow";
  return `due in ${task.daysUntilDue} days`;
}

/**
 * The verdict `collect()` already reached, said out loud.
 *
 * The heuristic lives in `buildTaskSections` and is deterministic — priority,
 * date, and how many siblings on the same project have also gone quiet. This
 * page only names it. Inventing a second opinion here would put two different
 * answers on the same task depending on whether you read the page or the email.
 */
const VERDICT_LABEL: Record<StaleVerdict, string> = {
  kill: "Kill it",
  collapse: "Collapse",
  schedule: "Schedule it",
};

function sittingLabel(ageDays: number | null): string {
  if (ageDays === null) return "untouched";
  if (ageDays >= 365) return "untouched over a year";
  if (ageDays >= 60) return `untouched ${Math.floor(ageDays / 30)} months`;
  return `untouched ${ageDays} days`;
}

/** One task line. Everything links to /tasks; the brief points, it does not edit. */
function TaskRowLine({ task, late }: { task: BriefTask; late: boolean }) {
  return (
    <Link
      href="/tasks"
      className="flex items-start justify-between gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-slate-900">{task.title}</span>
        {(task.project || task.client) && (
          <span className="block truncate text-[11px] text-slate-500">
            {[task.client, task.project].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      <span
        className={`shrink-0 text-[11px] tabular-nums ${
          late ? "font-semibold text-red-700" : "text-slate-500"
        }`}
      >
        {dueLabel(task)}
      </span>
    </Link>
  );
}

function DayColumn({ day }: { day: DayCell }) {
  return (
    <div
      className={`rounded-2xl border-2 p-4 shadow-sm ${
        day.isToday ? "border-blue-500 bg-white" : "border-slate-300 bg-white"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {day.label}
          {day.isToday && <span className="ml-1.5 text-[11px] font-medium text-blue-700">today</span>}
        </h3>
        <span className="text-[11px] tabular-nums text-slate-400">
          {day.hours > 0 ? `${day.hours.toFixed(1)}h` : "clear"}
        </span>
      </div>

      {day.conflicts > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {day.conflicts === 1 ? "1 overlap" : `${day.conflicts} overlaps`}
        </p>
      )}

      {day.events.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nothing scheduled.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {day.events.map((event) => (
            <li
              key={event.id}
              className={`rounded-xl border px-2 py-1.5 ${
                event.conflict ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-900">{event.title}</span>
                <span
                  className={`shrink-0 text-[11px] tabular-nums ${
                    event.conflict ? "font-semibold text-red-700" : "text-slate-500"
                  }`}
                >
                  {event.timeLabel}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                <span>{MATRIX_LABEL[event.matrix]}</span>
                {event.leaveBy && <span>leave by {event.leaveBy}</span>}
                {event.isExternal && !event.hasPrep && (
                  <span className="font-semibold text-amber-700">no prep</span>
                )}
                {event.conflict && <span className="font-semibold text-red-700">overlaps</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Open blocks are stated in neutral slate, NOT green.
          Green means DONE everywhere in this app (CLAUDE.md, and the same note
          in PriorityMatrix.tsx). A free block tinted green would read as work
          already finished, which is the opposite of what it is: unclaimed
          time, and an invitation. */}
      {day.openBlocks.length > 0 && (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Open</p>
          <ul className="mt-1 space-y-0.5">
            {day.openBlocks.map((block) => (
              <li key={`${day.date}-${block.startLabel}`} className="text-[11px] tabular-nums text-slate-600">
                {block.startLabel}–{block.endLabel}
                <span className="ml-1 text-slate-400">{block.hours.toFixed(1)}h</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function BriefPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { periodStart, periodEnd } = periodFor("weekly");
  const payload = await collect(supabase, userData.user.id, "weekly", periodStart, periodEnd);

  const { alignment, prepWarnings, days, threads, tasks, staleSources } = payload;

  // Matrix order is enforced here rather than trusted from the payload. It is
  // the one thing in this page that is never allowed to be a coincidence.
  const tiles = TILE_KEYS.map((key) => {
    const row = alignment.byMatrix.find((m) => m.key === key);
    return {
      key,
      label: MATRIX_LABEL[key],
      hours: row?.hours ?? 0,
      share: row?.share ?? 0,
      meetings: row?.meetings ?? 0,
    };
  });
  const adminHours = alignment.byMatrix.find((m) => m.key === "admin")?.hours ?? 0;
  const absent = MATRIX_ORDER.filter((key) => alignment.absent.includes(key)).map(
    (key) => MATRIX_LABEL[key],
  );

  const overdueGroups = [...tasks.overdue].sort(
    (a, b) => MATRIX_ORDER.indexOf(a.key) - MATRIX_ORDER.indexOf(b.key),
  );

  // Same rule as the overdue groups: matrix order is enforced at render, not
  // trusted from the payload, so a change in collect() cannot quietly put
  // client work above God First.
  const byMatrixOrder = <T extends { matrix: MatrixKey }>(a: T, b: T) =>
    MATRIX_ORDER.indexOf(a.matrix) - MATRIX_ORDER.indexOf(b.matrix);
  const staleTasks: StaleTask[] = [...tasks.stale].sort(byMatrixOrder);
  const closedTasks: BriefTask[] = [...tasks.closed].sort(byMatrixOrder);

  const weekHasContent = days.some((d) => d.events.length > 0 || d.openBlocks.length > 0);
  const hasTasks = overdueGroups.length > 0 || tasks.dueThisPeriod.length > 0;

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">This week</h1>
          <p className="mt-1 text-sm text-slate-500">
            {payload.periodLabel} · computed just now, {payload.timezone.replace("_", " ")}
          </p>
        </div>
        <Link
          href="/briefs"
          className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm transition-shadow hover:shadow"
        >
          <Mail className="h-4 w-4" />
          View as email
        </Link>
      </div>

      {/* Staleness first, before any number is read. */}
      {staleSources.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Some of this is out of date
          </div>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {staleSources.map((source) => (
              <li key={source.source}>{staleLine(source)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Anything older than {STALE_AFTER_HOURS} hours is called stale. Meetings, mail and tasks
            below may be missing or already handled.{" "}
            <Link href="/sync" className="font-medium underline">
              Sync health
            </Link>
          </p>
        </div>
      )}

      {/* 1. Alignment */}
      <section className="mb-4 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Target className="h-4 w-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">Alignment</h2>
          </div>
          <span className="text-[11px] tabular-nums text-slate-400">
            {alignment.totalHours.toFixed(1)}h scheduled
          </span>
        </div>

        {alignment.totalHours === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Nothing is on the calendar for this week. That is a blank sheet, not a rest week — the
            matrix has nothing to weigh.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tiles.map((tile) => {
                const warn = tile.key === "impact" && alignment.impactCrowding;
                return (
                  <div
                    key={tile.key}
                    className={
                      warn
                        ? "rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 shadow-sm"
                        : "rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm"
                    }
                  >
                    <div
                      className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                        warn ? "text-amber-800" : "text-slate-500"
                      }`}
                    >
                      {MATRIX_ICON[tile.key]}
                      <span className="truncate">{tile.label}</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                      {tile.hours.toFixed(1)}
                      <span className="ml-1 text-xs font-medium text-slate-400">h</span>
                    </p>
                    <p className={`text-[11px] tabular-nums ${warn ? "text-amber-800" : "text-slate-500"}`}>
                      {tile.hours > 0 ? `${Math.round(tile.share * 100)}% of the week` : "nothing scheduled"}
                    </p>
                    <p className="text-[11px] tabular-nums text-slate-400">
                      {tile.meetings === 1 ? "1 event" : `${tile.meetings} events`}
                    </p>
                  </div>
                );
              })}
            </div>

            {alignment.impactCrowding && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Impact is{" "}
                  {Math.round((alignment.byMatrix.find((m) => m.key === "impact")?.share ?? 0) * 100)}% of
                  this week&apos;s scheduled hours. Health and Family are getting what is left.
                </span>
              </p>
            )}

            {/* Scheduled time is not the whole of a life — prayer rarely has a
                calendar entry — so this says "nothing scheduled", never
                "nothing happened". */}
            {absent.length > 0 && (
              <p className="mt-3 text-xs text-slate-600">
                No scheduled time at all for {absent.join(", ")}. That is what the calendar says, not
                what the week was.
              </p>
            )}

            {adminHours > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {adminHours.toFixed(1)}h sits in Admin — events with no domain on them.
              </p>
            )}
          </>
        )}
      </section>

      {/* 2. Prep warnings */}
      {prepWarnings.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Meetings with no prep
            <span className="font-normal text-slate-400">({prepWarnings.length})</span>
          </h2>
          <div className="grid gap-3">
            {prepWarnings.map((warning) => (
              <div
                key={warning.eventId}
                className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{warning.title}</h3>
                  <span className="text-[11px] tabular-nums text-amber-800">
                    {warning.whenLabel}
                    {hoursAwayLabel(warning.hoursAway) && ` · ${hoursAwayLabel(warning.hoursAway)}`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {MATRIX_LABEL[warning.matrix]}
                  {warning.location && ` · ${warning.location}`}
                </p>

                {warning.attendees.length > 0 && (
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">With </span>
                    {warning.attendees.join(", ")}
                  </p>
                )}

                {warning.inbox.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Mail on this
                    </p>
                    <ul className="mt-1 space-y-1">
                      {warning.inbox.map((item) => (
                        <li key={item.id} className="text-xs text-slate-700">
                          {item.webLink ? (
                            <a
                              href={item.webLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 hover:underline"
                            >
                              {item.subject}
                            </a>
                          ) : (
                            item.subject
                          )}
                          <span className="text-slate-500"> — {item.sender}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {warning.tasks.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Tasks on this
                    </p>
                    <ul className="mt-1 space-y-1">
                      {warning.tasks.map((task) => (
                        <li key={task.id} className="text-xs text-slate-700">
                          <Link href="/tasks" className="text-blue-700 hover:underline">
                            {task.title}
                          </Link>
                          {task.dueDate && <span className="text-slate-500"> — due {task.dueDate}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {warning.inbox.length === 0 && warning.tasks.length === 0 && (
                  <p className="mt-3 text-xs text-slate-600">
                    Nothing in mail or tasks matches this meeting. You are walking in cold.
                  </p>
                )}

                {warning.webLink && (
                  <a
                    href={warning.webLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                  >
                    Open in Outlook <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. The week */}
      {weekHasContent && (
        <section className="mb-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <CalendarDays className="h-4 w-4 text-slate-600" />
            The week
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {days.map((day) => (
              <DayColumn key={day.date} day={day} />
            ))}
          </div>
        </section>
      )}

      {/* 4. Waiting on you */}
      {threads.length > 0 && (
        <section className="mb-4 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-900">Waiting on you</h2>
            </div>
            <span className="text-[11px] text-slate-400">
              {threads.length === 1 ? "1 thread" : `${threads.length} threads`}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-slate-200">
            {threads.map((thread) => (
              <li key={thread.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    {thread.webLink ? (
                      <a
                        href={thread.webLink}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-medium text-blue-700 hover:underline"
                      >
                        {thread.subject}
                      </a>
                    ) : (
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {thread.subject}
                      </span>
                    )}
                    <span className="block truncate text-[11px] text-slate-500">
                      {thread.sender} · {MATRIX_LABEL[thread.matrix]}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                    {thread.ageLabel}
                  </span>
                </div>
                {thread.snippet && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{thread.snippet}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Tasks */}
      {hasTasks && (
        <section className="mb-4 grid gap-3 md:grid-cols-2">
          {overdueGroups.length > 0 && (
            <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-red-600" />
                  <h2 className="text-sm font-semibold text-slate-900">Overdue</h2>
                </div>
                <span className="text-[11px] tabular-nums text-red-700">{tasks.overdueCount}</span>
              </div>
              <div className="mt-3 space-y-4">
                {overdueGroups.map((group) => (
                  <div key={group.key}>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {MATRIX_ICON[group.key]}
                      {group.label}
                    </p>
                    <div className="mt-1">
                      {group.tasks.map((task) => (
                        <TaskRowLine key={task.id} task={task} late />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tasks.dueThisPeriod.length > 0 && (
            <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4 text-slate-600" />
                  <h2 className="text-sm font-semibold text-slate-900">Due this week</h2>
                </div>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {tasks.dueThisPeriod.length}
                </span>
              </div>
              <div className="mt-3">
                {tasks.dueThisPeriod.map((task) => (
                  <TaskRowLine key={task.id} task={task} late={false} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 6. Stale — open, untouched a month, and not shouting via a date.
          Deliberately quieter than Overdue: a missed deadline is an alarm, a
          decision never made is a nag. Slate, no red, no amber — amber is
          already spoken for by the alignment warning, and letting these three
          compete would flatten all of them into noise. */}
      {tasks.stale.length > 0 && (
        <section className="mb-4 rounded-2xl border-2 border-slate-300 bg-slate-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Hourglass className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">Going quiet</h2>
            </div>
            <span className="text-[11px] tabular-nums text-slate-400">{tasks.stale.length}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Open, no deadline pressing, and nobody has touched them in{" "}
            {TASK_STALE_AFTER_DAYS} days. Each one is a decision you have not made.
          </p>
          <ul className="mt-3 divide-y divide-slate-200">
            {staleTasks.map((task) => (
              <li key={task.id} className="py-2 first:pt-0 last:pb-0">
                <Link href="/tasks" className="block rounded-xl px-2 py-1 transition-colors hover:bg-white">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-slate-800">{task.title}</span>
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      {VERDICT_LABEL[task.verdict]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {MATRIX_LABEL[task.matrix]}
                    {(task.client || task.project) &&
                      ` · ${[task.client, task.project].filter(Boolean).join(" · ")}`}
                    {` · ${sittingLabel(task.ageDays)}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{task.reason}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 7. Closed. The only section in the brief that reports finished work,
          so green is correct here and only here — it is the app's DONE colour
          (CLAUDE.md), which is exactly what these are. */}
      {tasks.closed.length > 0 && (
        <section className="mb-4 rounded-2xl border-2 border-green-300 bg-green-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-700" />
              <h2 className="text-sm font-semibold text-green-900">Closed last week</h2>
            </div>
            <span className="text-[11px] tabular-nums text-green-700">{tasks.closed.length}</span>
          </div>
          <ul className="mt-3 space-y-1">
            {closedTasks.map((task) => (
              <li key={task.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-green-900">{task.title}</span>
                <span className="shrink-0 text-[11px] text-green-700">{MATRIX_LABEL[task.matrix]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Briefs are generated on a schedule — the weekly Sunday evening, the daily on weekday
        mornings — and will be mailed out once Outlook sending is enabled. Until then they are
        written to{" "}
        <Link href="/briefs" className="font-medium text-blue-700 hover:underline">
          the brief list
        </Link>
        , which is also the only place the prose appears. This page is the same numbers,
        recomputed every time it loads. Week of {dayLabel(payload.periodStart)}.
      </p>
    </main>
  );
}
