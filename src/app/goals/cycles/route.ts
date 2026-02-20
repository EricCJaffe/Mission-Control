import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const startDate = String(form.get("start_date") || "").trim();
  const endDate = String(form.get("end_date") || "").trim();
  const reviewWeekStart = String(form.get("review_week_start") || "").trim();
  const reviewWeekEnd = String(form.get("review_week_end") || "").trim();
  const notesMd = String(form.get("notes_md") || "");

  if (!title || !startDate || !endDate) {
    return NextResponse.redirect(new URL("/goals", req.url));
  }

  await supabase.from("goal_cycles").insert({
    user_id: user.id,
    title,
    start_date: startDate,
    end_date: endDate,
    review_week_start: reviewWeekStart || null,
    review_week_end: reviewWeekEnd || null,
    notes_md: notesMd,
  });

  return NextResponse.redirect(new URL("/goals", req.url));
}
