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
  const priorityRaw = String(form.get("priority") || "").trim();
  const dueDate = String(form.get("due_date") || "").trim();

  const payload: Record<string, unknown> = {};
  payload.status = status || null;
  if (!priorityRaw) {
    payload.priority = null;
  } else {
    const parsed = Number(priorityRaw);
    payload.priority = Number.isNaN(parsed) ? null : parsed;
  }
  payload.due_date = dueDate || null;
  payload.updated_at = new Date().toISOString();

  await supabase.from("tasks").update(payload).eq("id", id);

  return NextResponse.redirect(new URL("/tasks", req.url));
}
