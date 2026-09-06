import Link from "next/link";
import { Compass, HeartPulse, Users, Briefcase, AlertTriangle, Target } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { today as todayInAppTz, dayOf, addDays } from "@/lib/day";

/**
 * Eric's priority matrix — God first, Health, Family, Impact.
 *
 * The order is the point, not a layout choice: it is the frame the rest of the
 * app hangs off (see `~/dev/brain/identity/persona.md` §0). Spirit/soul/body
 * stays underneath as the formation detail; here `body` and `soul` are read
 * together as Health, and `work` is Impact — making a difference in others'
 * lives, which is what the business work is for.
 *
 * The amber rule exists so a week that has eaten Health and Family reads as a
 * *misalignment* rather than as a full calendar. Nothing else is tinted: green
 * means DONE everywhere else in this app, so a "healthy" tile in green would
 * read as "finished".
 */

/** The five task/event domains, as stored. Nullable in both tables. */
type Domain = "spirit" | "body" | "soul" | "family" | "work";

type Tile = {
  key: string;
  label: string;
  icon: React.ReactNode;
  domains: Domain[];
};

const TILES: Tile[] = [
  { key: "god", label: "God First", icon: <Compass className="h-4 w-4" />, domains: ["spirit"] },
  { key: "health", label: "Health", icon: <HeartPulse className="h-4 w-4" />, domains: ["body", "soul"] },
  { key: "family", label: "Family", icon: <Users className="h-4 w-4" />, domains: ["family"] },
  { key: "impact", label: "Impact", icon: <Briefcase className="h-4 w-4" />, domains: ["work"] },
];

/** Share of the week's scheduled hours above which Impact is flagged. */
const IMPACT_WARN_SHARE = 0.7;

/** Day-of-week for a 'YYYY-MM-DD', Monday = 0, without touching timezones. */
function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sunday = 0
  return (dow + 6) % 7;
}

function hoursBetween(startAt: string | null, endAt: string | null): number {
  if (!startAt || !endAt) return 0;
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return (end - start) / 3_600_000;
}

/** One quadrant of the matrix. */
function MatrixTile({
  icon,
  label,
  open,
  overdue,
  hours,
  warn,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  open: number;
  overdue: number;
  hours: number;
  warn: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={
        warn
          ? "rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 shadow-sm transition-shadow hover:shadow"
          : "rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
      }
    >
      <div
        className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
          warn ? "text-amber-800" : "text-slate-500"
        }`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {open}
        <span className="ml-1 text-xs font-medium text-slate-400">open</span>
      </p>
      {/* Overdue is stated even when zero, so an empty tile is not mistaken for an unread one. */}
      <p className={`text-[11px] tabular-nums ${overdue > 0 ? "font-semibold text-amber-700" : "text-slate-400"}`}>
        {overdue > 0 ? `${overdue} overdue` : "none overdue"}
      </p>
      <p className={`text-[11px] tabular-nums ${warn ? "text-amber-800" : "text-slate-500"}`}>
        {hours > 0 ? `${hours.toFixed(1)}h this week` : "nothing scheduled"}
      </p>
    </Link>
  );
}

export default async function PriorityMatrix() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const todayIso = todayInAppTz();
  const weekStartIso = addDays(todayIso, -mondayIndex(todayIso));
  const weekEndIso = addDays(weekStartIso, 6);

  // The window is widened a day either side and then trimmed by app-timezone
  // day: a bare 'YYYY-MM-DDT00:00:00' is read as UTC by Postgres, which would
  // slice four or five hours off each end of Eric's week.
  const fetchFrom = `${addDays(weekStartIso, -1)}T00:00:00Z`;
  const fetchTo = `${addDays(weekEndIso, 2)}T00:00:00Z`;

  const [tasksResult, eventsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,status,due_date,domain")
      .eq("user_id", user.id)
      .neq("status", "done"),
    supabase
      .from("calendar_events")
      .select("start_at,end_at,domain")
      .eq("user_id", user.id)
      .gte("start_at", fetchFrom)
      .lt("start_at", fetchTo),
  ]);

  const tasks = tasksResult.data ?? [];
  const events = eventsResult.data ?? [];

  const openByDomain = new Map<string, number>();
  const overdueByDomain = new Map<string, number>();
  let unclassifiedTasks = 0;

  for (const task of tasks) {
    const domain = (task.domain as string | null) ?? null;
    if (!domain) {
      unclassifiedTasks += 1;
      continue;
    }
    openByDomain.set(domain, (openByDomain.get(domain) ?? 0) + 1);
    const dueDate = task.due_date as string | null;
    if (dueDate && dueDate < todayIso) {
      overdueByDomain.set(domain, (overdueByDomain.get(domain) ?? 0) + 1);
    }
  }

  const hoursByDomain = new Map<string, number>();
  let unclassifiedHours = 0;

  for (const event of events) {
    const startAt = event.start_at as string | null;
    if (!startAt) continue;
    const day = dayOf(startAt);
    if (day < weekStartIso || day > weekEndIso) continue;
    const hours = hoursBetween(startAt, event.end_at as string | null);
    if (hours <= 0) continue;
    const domain = (event.domain as string | null) ?? null;
    if (!domain) {
      unclassifiedHours += hours;
      continue;
    }
    hoursByDomain.set(domain, (hoursByDomain.get(domain) ?? 0) + hours);
  }

  const rows = TILES.map((tile) => ({
    ...tile,
    open: tile.domains.reduce((sum, d) => sum + (openByDomain.get(d) ?? 0), 0),
    overdue: tile.domains.reduce((sum, d) => sum + (overdueByDomain.get(d) ?? 0), 0),
    hours: tile.domains.reduce((sum, d) => sum + (hoursByDomain.get(d) ?? 0), 0),
    // Health is body + soul, so the link carries both and the Tasks filter
    // reads a comma list. A tile that dropped half its own domain on the way
    // through would be worse than not linking at all.
    href: `/tasks?domain=${tile.domains.join(',')}`,
  }));

  // Share is measured against the four tiles only. Unclassified hours are
  // reported separately rather than folded in, which would quietly dilute the
  // warning with time nobody has placed yet.
  const classifiedHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const impactHours = rows.find((row) => row.key === "impact")?.hours ?? 0;
  const impactShare = classifiedHours > 0 ? impactHours / classifiedHours : 0;
  const impactDominates = classifiedHours > 0 && impactShare > IMPACT_WARN_SHARE;

  const unknown = unclassifiedTasks > 0 || unclassifiedHours > 0;

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Target className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-900">Priority matrix</h2>
        </div>
        <span className="text-[11px] text-slate-400">
          week of {weekStartIso}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map((row) => (
          <MatrixTile
            key={row.key}
            icon={row.icon}
            label={row.label}
            open={row.open}
            overdue={row.overdue}
            hours={row.hours}
            warn={row.key === "impact" && impactDominates}
            href={row.href}
          />
        ))}
      </div>

      {impactDominates && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Impact is {Math.round(impactShare * 100)}% of this week&apos;s scheduled hours. Health and
            Family are getting what is left.
          </span>
        </p>
      )}

      {/* Half the tasks in this database have no domain. Hiding them would make
          every tile above look better than the week actually is. */}
      {unknown && (
        <p className="mt-3 text-xs text-slate-500">
          {unclassifiedTasks > 0 && (
            <>
              {unclassifiedTasks} unclassified {unclassifiedTasks === 1 ? "task" : "tasks"}
            </>
          )}
          {unclassifiedTasks > 0 && unclassifiedHours > 0 && " and "}
          {unclassifiedHours > 0 && <>{unclassifiedHours.toFixed(1)}h unclassified time</>}
          {" — not counted above. "}
          <Link href="/tasks?domain=none" className="font-medium text-blue-600 hover:text-blue-700">
            Triage →
          </Link>
        </p>
      )}
    </div>
  );
}
