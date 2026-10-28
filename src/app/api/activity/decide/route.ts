import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { completionPatch, type CompletableTask } from "@/lib/tasks/complete";
import { today } from "@/lib/day";
import { parseDecision } from "@/lib/activity/decisions";

export const dynamic = "force-dynamic";

/*
 * One tap on /activity's Waiting column.
 *
 * Signed-in user only, through his own session: RLS lets him insert and read
 * his own decisions and nothing else, and there is no service-role key or
 * GitHub token here. The decision row is the audit log; the box-side
 * harvester delivers bot answers as channel notes (scripts/sync/
 * activity-deliver.ts).
 *
 * Your to-dos act on the Mission Control task at once, the same way
 * /tasks/update does: Done goes through completionPatch (a recurring task
 * rolls forward), Snooze moves the due date, and both stamp edited_at so the
 * project sync never reverts them. Drop leaves the task alone and takes it
 * off Waiting for good.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const todayEt = today();
  const parsed = parseDecision(raw, todayEt);
  if (!parsed.ok) return NextResponse.json({ error: `Bad ${parsed.error}` }, { status: 400 });
  const d = parsed.value;

  if (d.item_source === "task" && (d.choice === "done" || d.choice === "snooze")) {
    const taskId = d.item_key.slice("task:".length);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { edited_at: now, updated_at: now };
    if (d.choice === "snooze") patch.due_date = d.until_date;
    else {
      const { data: current } = await supabase
        .from("tasks")
        .select("recurrence_rule, recurrence_anchor, due_date, recurrence_count")
        .eq("id", taskId)
        .eq("user_id", user.id)
        .maybeSingle();
      patch.status = "done";
      Object.assign(patch, completionPatch(current as CompletableTask | null, todayEt));
    }
    const { error, count } = await supabase
      .from("tasks")
      .update(patch, { count: "exact" })
      .eq("id", taskId)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Could not update the task" }, { status: 500 });
    if (count === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("bot_activity_decisions")
    .insert({ ...d, user_id: user.id })
    .select("id, created_at")
    .single();
  if (error) {
    // A to-do already changed above (done, or moved to its new date) and
    // leaves Waiting on its own; only the audit row is missing. A bot answer
    // with no row was never recorded, so that one is an error.
    if (d.item_source === "task" && d.choice !== "drop") return NextResponse.json({ ok: true, recorded: false, choice: d.choice });
    return NextResponse.json({ error: "Could not record the decision" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recorded: true, id: data.id, created_at: data.created_at, choice: d.choice });
}
