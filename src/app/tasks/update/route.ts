import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { nextOccurrence } from "@/lib/tasks/recurrence";

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
  const why = String(form.get("why") || "").trim();
  const recurrenceRule = String(form.get("recurrence_rule") || "").trim();
  const recurrenceAnchor = String(form.get("recurrence_anchor") || "").trim();
  const isTemplate = String(form.get("is_template") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  const payload: Record<string, unknown> = {};
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
  if (form.has("why")) payload.why = why || null;
  if (form.has("recurrence_rule")) payload.recurrence_rule = recurrenceRule || null;
  if (form.has("recurrence_anchor")) payload.recurrence_anchor = recurrenceAnchor || null;
  if (form.has("is_template")) payload.is_template = isTemplate === "on";
  payload.updated_at = new Date().toISOString();

  // Completing a recurring task rolls it forward instead of closing it. The
  // task IS the series — spawning a row per occurrence would turn "bins out
  // weekly" into a hundred rows nobody can read — so the due date moves and
  // the status stays open until COUNT or UNTIL runs out.
  if (payload.status === "done") {
    const { data: current } = await supabase
      .from("tasks")
      .select("recurrence_rule, recurrence_anchor, due_date, recurrence_count")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    const rule = current?.recurrence_rule as string | null;
    if (rule) {
      const today = new Date().toISOString().slice(0, 10);
      const anchor = (current?.recurrence_anchor as string | null)
        ?? (current?.due_date as string | null)
        ?? today;
      const from = (current?.due_date as string | null) ?? today;
      const soFar = Number(current?.recurrence_count ?? 0);
      const next = nextOccurrence(rule, anchor, from, soFar);

      if (next) {
        payload.status = "todo";
        payload.due_date = next;
        payload.recurrence_count = soFar + 1;
        payload.last_completed_at = new Date().toISOString();
      }
      // No next occurrence means the series is finished; it closes as done.
    }
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

  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }

  return NextResponse.redirect(new URL("/tasks", req.url));
}
