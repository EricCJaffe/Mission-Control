import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { completionPatch, type CompletableTask } from "@/lib/tasks/complete";
import { today } from "@/lib/day";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  if (!id) return NextResponse.redirect(new URL("/tasks", req.url));

  const status = String(form.get("status") || "").trim();
  const title = String(form.get("title") || "").trim();
  const priorityRaw = String(form.get("priority") || "").trim();
  const dueDate = String(form.get("due_date") || "").trim();
  const category = String(form.get("category") || "").trim();
  const domain = String(form.get("domain") || "").trim();
  const why = String(form.get("why") || "").trim();
  const recurrenceRule = String(form.get("recurrence_rule") || "").trim();
  const recurrenceAnchor = String(form.get("recurrence_anchor") || "").trim();
  const isTemplate = String(form.get("is_template") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();
  // Programmatic callers ask for JSON. Everything else is a plain <form> post
  // and still wants a redirect back to the page.
  const wantsJson = String(form.get("json") || "").trim() === "1";

  /*
   * Any edit made here claims the task from the project harvester.
   *
   * scripts/sync reads `edited_at`: while it is null the source file still
   * owns the title, status and priority, and once it is set the sync may only
   * refresh the wording. Without this line a two-hourly cron would quietly
   * revert every status you changed by hand, which is the fastest way to teach
   * someone to stop using the app.
   */
  const payload: Record<string, unknown> = { edited_at: new Date().toISOString() };
  if (form.has("title")) payload.title = title || null;
  if (form.has("status")) payload.status = status || null;

  if (form.has("priority")) {
    if (!priorityRaw) {
      payload.priority = null;
    } else {
      const parsed = Number(priorityRaw);
      payload.priority = Number.isNaN(parsed) ? null : parsed;
    }
  }

  if (form.has("due_date")) payload.due_date = dueDate || null;
  if (form.has("category")) payload.category = category || null;
  if (form.has("domain")) payload.domain = domain || null;
  if (form.has("why")) payload.why = why || null;
  if (form.has("recurrence_rule")) payload.recurrence_rule = recurrenceRule || null;
  if (form.has("recurrence_anchor")) payload.recurrence_anchor = recurrenceAnchor || null;
  if (form.has("is_template")) payload.is_template = isTemplate === "on";
  payload.updated_at = new Date().toISOString();

  // Completing a recurring task rolls it forward instead of closing it — see
  // completionPatch, which the maintenance module shares.
  if (payload.status === "done") {
    const { data: current } = await supabase
      .from("tasks")
      .select("recurrence_rule, recurrence_anchor, due_date, recurrence_count")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    // today() is Eastern; toISOString() here rolled every evening completion
    // into tomorrow and skipped an occurrence.
    Object.assign(payload, completionPatch(current as CompletableTask | null, today()));
  }

  const { error, count } = await supabase
    .from("tasks")
    .update(payload, { count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);

  // The client toggles optimistically and rolls back on a non-ok response, but
  // this route always redirected — so a failed write returned 200 through the
  // redirect and the tick stayed on screen until the next refetch silently
  // undid it. Report failures, and treat "matched nothing" as a failure too:
  // an update that changed no rows is not a success just because Postgres
  // raised no error.
  if (error || count === 0) {
    return NextResponse.json(
      { error: error?.message ?? "Task not found" },
      { status: error ? 500 : 404 },
    );
  }

  /*
   * This is why ticking a task never stuck.
   *
   * NextResponse.redirect() returns 307, and 307 PRESERVES the method — so a
   * fetch() POST here followed the redirect by POSTing again to /tasks, which
   * is a page with no POST handler, got a 405, and the client saw res.ok as
   * false. The database write had already succeeded; the UI then rolled its
   * optimistic tick back on top of it. Hence "it goes away for a second and
   * pops right back in".
   */
  if (wantsJson) {
    return NextResponse.json({ ok: true, status: payload.status ?? null });
  }

  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }

  return NextResponse.redirect(new URL("/tasks", req.url));
}
