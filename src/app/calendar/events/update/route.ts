import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function combineDateTime(date: string, time: string) {
  const dt = new Date(`${date}T${time}`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  const date = String(form.get("date") || "").trim();
  const title = String(form.get("title") || "").trim();
  const startTime = String(form.get("start_at") || "").trim();
  const endTime = String(form.get("end_at") || "").trim();
  const eventType = String(form.get("event_type") || "").trim();
  const recurrenceRule = String(form.get("recurrence_rule") || "").trim();
  const recurrenceUntil = String(form.get("recurrence_until") || "").trim();
  const alignmentTag = String(form.get("alignment_tag") || "").trim();
  const goalId = String(form.get("goal_id") || "").trim();
  const taskId = String(form.get("task_id") || "").trim();
  const noteId = String(form.get("note_id") || "").trim();
  const reviewId = String(form.get("review_id") || "").trim();
  const redirect = String(form.get("redirect") || "").trim();
  const expandCount = Number(String(form.get("expand_count") || "0").trim());

  const startAt = combineDateTime(date, startTime);
  const endAt = combineDateTime(date, endTime);

  if (!id || !date || !title || !startAt || !endAt || !eventType) {
    return NextResponse.redirect(new URL(redirect || "/calendar", req.url));
  }

  const { error: updateError } = await supabase
    .from("calendar_events")
    .update({
      title,
      start_at: startAt,
      end_at: endAt,
      event_type: eventType,
      recurrence_rule: recurrenceRule || null,
      recurrence_until: recurrenceUntil || null,
      alignment_tag: alignmentTag || null,
      goal_id: goalId || null,
      task_id: taskId || null,
      note_id: noteId || null,
      review_id: reviewId || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    console.error('Error updating calendar_events:', updateError);
  }

  const rule = (recurrenceRule || "").toLowerCase();
  const shouldExpand = expandCount && expandCount > 0 && recurrenceRule;
  if (shouldExpand) {
    const instances: Array<Record<string, unknown>> = [];
    let currentStart = new Date(startAt);
    let currentEnd = new Date(endAt);
    for (let i = 0; i < expandCount; i++) {
      if (rule.includes("daily")) {
        currentStart.setDate(currentStart.getDate() + 1);
        currentEnd.setDate(currentEnd.getDate() + 1);
      } else if (rule.includes("weekly")) {
        currentStart.setDate(currentStart.getDate() + 7);
        currentEnd.setDate(currentEnd.getDate() + 7);
      } else if (rule.includes("monthly")) {
        currentStart.setMonth(currentStart.getMonth() + 1);
        currentEnd.setMonth(currentEnd.getMonth() + 1);
      } else {
        break;
      }
      const dateStr = currentStart.toISOString().slice(0, 10);
      if (recurrenceUntil && recurrenceUntil < dateStr) break;
      instances.push({
        user_id: user.id,
        title,
        start_at: currentStart.toISOString(),
        end_at: currentEnd.toISOString(),
        event_type: eventType,
        recurrence_rule: recurrenceRule,
        recurrence_until: recurrenceUntil || null,
        alignment_tag: alignmentTag || null,
        goal_id: goalId || null,
        task_id: taskId || null,
        note_id: noteId || null,
        review_id: reviewId || null,
      });
    }
    if (instances.length > 0) {
      await supabase.from("calendar_events").insert(instances);
    }
  }

  return NextResponse.redirect(new URL(redirect || "/calendar", req.url));
}
