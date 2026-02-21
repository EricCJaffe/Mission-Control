import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const priorityRaw = String(form.get("priority") || "").trim();
  const dueDate = String(form.get("due_date") || "").trim();
  const category = String(form.get("category") || "").trim();
  const why = String(form.get("why") || "").trim();
  const recurrenceRule = String(form.get("recurrence_rule") || "").trim();
  const recurrenceAnchor = String(form.get("recurrence_anchor") || "").trim();
  const bookId = String(form.get("book_id") || "").trim();
  const chapterId = String(form.get("chapter_id") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (!title) return NextResponse.redirect(new URL("/tasks", req.url));

  const payload: Record<string, unknown> = {
    user_id: user.id,
    title,
  };

  if (priorityRaw) {
    const parsed = Number(priorityRaw);
    if (!Number.isNaN(parsed)) payload.priority = parsed;
  }
  if (dueDate) payload.due_date = dueDate;
  if (category) payload.category = category;
  if (why) payload.why = why;
  if (recurrenceRule) payload.recurrence_rule = recurrenceRule;
  if (recurrenceAnchor) payload.recurrence_anchor = recurrenceAnchor;
  if (bookId) payload.book_id = bookId;
  if (chapterId) payload.chapter_id = chapterId;

  await supabase.from("tasks").insert(payload);

  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }

  return NextResponse.redirect(new URL("/tasks", req.url));
}
