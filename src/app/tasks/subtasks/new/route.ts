import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const taskId = String(form.get("task_id") || "").trim();
  const title = String(form.get("title") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (taskId && title) {
    await supabase.from("task_subtasks").insert({
      task_id: taskId,
      org_id: user.id,
      title,
      status: "open",
    });
  }

  return NextResponse.redirect(new URL(redirectTo || "/tasks", req.url));
}
