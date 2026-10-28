import { supabaseServer } from "@/lib/supabase/server";
import { today, dayOf } from "@/lib/day";
import ActivityBoard, { type ActivityRow } from "@/components/activity/ActivityBoard";
import { loadActivity, EVENT_LIMIT, FINISHED_LIMIT } from "@/lib/activity/source";
import { splitByAge } from "@/lib/activity/format";
import { scrubRow, scrub } from "@/lib/activity/scrub";
import { droppedKeys, latestByKey, waitingState, type Decision } from "@/lib/activity/decisions";

export const dynamic = "force-dynamic";

/*
 * What every bot did, what is still running, and what waits on Eric.
 *
 * Eric, 2026-10-27: one page so he does not have to read chat to keep up. He
 * is on the road, so the page is built for a phone first: one column with a
 * Waiting / Timeline / Work switch, three columns from md up.
 *
 * Read-only. v2 reads mission.bot_activity_items, filled every 5 minutes on
 * ubuntu-dev by scripts/sync/activity.ts from scrubbed brain rows (display
 * names only, no ids, no addresses, Honey Lake reduced to a status); "as of"
 * is its newest ok run. Until that has run once, the v1 snapshot and then the
 * committed synthetic sample (under a banner) stand in: see
 * src/lib/activity/source.ts. The page adds Mission Control's own tasks due
 * today, which are already here and are not re-synced.
 */

type TaskStub = { id: string; title: string; due_date: string | null; created_at: string; project_id: string | null };

function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function ActivityPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const todayEt = today();
  const [snapshot, tasks, decisionsRes, dropsRes] = await Promise.all([
    loadActivity(supabase),
    // Mission Control's own tasks that are due (today or overdue) and not
    // done, for Eric or for nobody in particular. Read here, never re-synced.
    supabase
      .from("tasks")
      .select("id,title,due_date,created_at,project_id")
      .lte("due_date", todayEt)
      .neq("status", "done")
      .or("assignee.is.null,assignee.ilike.*eric*")
      .order("due_date", { ascending: true })
      .limit(50),
    // His answers (v3), newest first: the audit log, and what hides or marks
    // a Waiting item. Before the migration this errors and is treated as none.
    supabase
      .from("bot_activity_decisions")
      .select("id,item_key,item_source,item_title,item_bot,choice,reply,until_date,created_at,delivered_at")
      .order("created_at", { ascending: false })
      .limit(300),
    // Every drop, however old: dropped stays dropped (R-163), so it cannot
    // depend on the 300 newest decisions above.
    supabase.from("bot_activity_decisions").select("item_key,choice,created_at").eq("choice", "drop").limit(1000),
  ]);
  const decisions = (decisionsRes.error ? [] : (decisionsRes.data ?? [])) as Decision[];
  const latest = latestByKey(decisions);
  const dropped = droppedKeys([...decisions, ...((dropsRes.error ? [] : (dropsRes.data ?? [])) as Decision[])]);

  // Every row from every source goes through the one scrub before it renders.
  const clean = (rows: ActivityRow[]) => rows.map(scrubRow).filter((r): r is ActivityRow => r !== null);
  const byKind = (kind: ActivityRow["kind"]) => clean(snapshot.items.filter((i) => i.kind === kind) as ActivityRow[]);
  const newestFirst = (a: ActivityRow, b: ActivityRow) => b.occurred_at.localeCompare(a.occurred_at);

  // Honey Lake tasks show as an item waiting and nothing more, the same rule
  // the harvester applies to the brain.
  const taskRows = (tasks.data ?? []) as TaskStub[];
  const projectIds = [...new Set(taskRows.map((t) => t.project_id).filter(Boolean))] as string[];
  const honeyLake = new Set<string>();
  if (projectIds.length) {
    const { data: projects } = await supabase.from("projects").select("id,name,slug,client").in("id", projectIds);
    for (const p of (projects ?? []) as Array<{ id: string; name: string | null; slug: string | null; client: string | null }>) {
      if (/honey[\s_-]?lake|hlcos/i.test(`${p.name ?? ""} ${p.slug ?? ""} ${p.client ?? ""}`)) honeyLake.add(p.id);
    }
  }
  const taskWaiting: ActivityRow[] = taskRows.map((t) => {
    const hl = t.project_id !== null && honeyLake.has(t.project_id);
    return {
      id: `task:${t.id}`,
      key: `task:${t.id}`,
      bot: hl ? "Honey Lake session" : "Tasks",
      kind: "waiting",
      title: hl ? "Honey Lake: item waiting" : t.title,
      tag: t.due_date === todayEt ? "due_today" : "action",
      project: hl ? "Honey Lake" : null,
      started_at: null,
      ended_at: null,
      // A date, not a time: noon UTC falls inside that ET day in both EST and EDT.
      due_at: t.due_date ? `${t.due_date}T12:00:00.000Z` : null,
      pr_url: null,
      occurred_at: t.created_at,
    };
  });

  // A drop is final (R-163); Not now / Snooze hide until their day; Done
  // hides; Approve / No / Reply stay, marked "answered, waiting for bot".
  const answered: Record<string, { choice: Decision["choice"]; at: string; delivered: boolean }> = {};
  const visible = (rows: ActivityRow[]) =>
    rows.filter((r) => {
      const key = r.key ?? r.id;
      if (dropped.has(key)) return false;
      const state = waitingState(latest.get(key), todayEt);
      if (state.answered && !state.hidden) {
        answered[key] = { choice: state.answered.choice, at: state.answered.created_at, delivered: !!state.answered.delivered_at };
      }
      return !state.hidden;
    });
  const sortWaiting = (a: ActivityRow, b: ActivityRow) => {
    const due = Number(b.tag === "due_today") - Number(a.tag === "due_today");
    return due || a.occurred_at.localeCompare(b.occurred_at);
  };
  const botWaiting = visible(byKind("waiting")).sort(sortWaiting);
  const todoWaiting = visible(clean(taskWaiting)).sort(sortWaiting);
  const audit = decisions.slice(0, 100).map((d) => ({
    id: d.id,
    bot: scrub(d.item_bot, 60) || "Bot",
    title: scrub(d.item_title, 200) || "Item",
    choice: d.choice,
    reply: d.reply ? scrub(d.reply, 1000) || null : null,
    until_date: d.until_date,
    created_at: d.created_at,
    delivered: d.item_source === "task" || !!d.delivered_at,
  }));

  const waitingRows = [...botWaiting, ...todoWaiting].sort((a, b) => {
    const due = Number(b.tag === "due_today") - Number(a.tag === "due_today");
    return due || a.occurred_at.localeCompare(b.occurred_at);
  });
  const dueToday = waitingRows.filter((r) => r.tag === "due_today");
  const { recent, older } = splitByAge(waitingRows.filter((r) => r.tag !== "due_today"));
  const waitingRecent = dueToday.length + recent.length;
  const waitingOlder = older.length;
  const progressRows = byKind("in_progress").sort(newestFirst);
  const allFinished = byKind("finished").sort(newestFirst);
  const finishedRows = allFinished.slice(0, FINISHED_LIMIT);
  const eventRows = byKind("event").sort(newestFirst).slice(0, EVENT_LIMIT);
  const asOf = snapshot.generated_at;

  const days = eventRows.map((e) => dayOf(e.occurred_at)).filter(Boolean).sort();
  const range = days.length ? `${shortDay(days[0])} – ${shortDay(days[days.length - 1])}` : "this week";
  const asOfText = new Date(asOf).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  const finishedTotal = snapshot.finishedTotal;

  return (
    <main className="pt-2 md:pt-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl font-semibold md:text-3xl">Bot activity</h1>
        <p className="mt-1 text-sm text-slate-600">
          What your bots did {range}, what is still running, and what waits on you.{" "}
          As of {asOfText} ET:{" "}
          <strong className="font-semibold text-slate-800">{waitingRecent} waiting on you</strong>
          {waitingOlder > 0 && <> ({waitingOlder} older)</>},{" "}
          {progressRows.length} in progress, {finishedTotal} finished.
        </p>
        {snapshot.sample && (
          <p className="mt-3 rounded-xl border-2 border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <strong className="font-semibold">Sample data.</strong> The bot activity sync has not run yet, so
            this shows invented rows until the 5-minute sync has run.
          </p>
        )}
      </div>

      <ActivityBoard
        botWaiting={botWaiting}
        todos={todoWaiting}
        answered={answered}
        audit={audit}
        // Taps act on real rows only: never on the sample or a snapshot.
        interactive={snapshot.from === "tables"}
        inProgress={progressRows}
        finished={finishedRows}
        finishedTotal={finishedTotal}
        events={eventRows}
        today={todayEt}
      />
    </main>
  );
}
