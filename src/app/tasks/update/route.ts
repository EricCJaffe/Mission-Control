import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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
  payload.updated_at = new Date().toISOString();

  await supabase.from("tasks").update(payload).eq("id", id);

  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }

  return NextResponse.redirect(new URL("/tasks", req.url));
}
