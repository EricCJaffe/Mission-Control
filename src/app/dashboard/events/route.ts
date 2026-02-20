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
  const date = String(form.get("date") || "").trim();
  const title = String(form.get("title") || "").trim();
  const startTime = String(form.get("start_at") || "").trim();
  const endTime = String(form.get("end_at") || "").trim();
  const eventType = String(form.get("event_type") || "").trim();

  const startAt = combineDateTime(date, startTime);
  const endAt = combineDateTime(date, endTime);

  if (!date || !title || !startAt || !endAt || !eventType) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  await supabase.from("calendar_events").insert({
    user_id: user.id,
    title,
    start_at: startAt,
    end_at: endAt,
    event_type: eventType,
  });

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
