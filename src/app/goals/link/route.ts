import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const goalId = String(form.get("goal_id") || "").trim();
  const taskId = String(form.get("task_id") || "").trim();

  if (!goalId || !taskId) return NextResponse.redirect(new URL("/goals", req.url));

  await supabase.from("goal_tasks").upsert({
    user_id: user.id,
    goal_id: goalId,
    task_id: taskId,
  }, { onConflict: "goal_id,task_id" });

  return NextResponse.redirect(new URL("/goals", req.url));
}
