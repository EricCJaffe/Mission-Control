import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const taskId = String(form.get("task_id") || "").trim();
  const label = String(form.get("label") || "").trim();
  const url = String(form.get("url") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (taskId && url) {
    await supabase.from("task_links").insert({
      task_id: taskId,
      org_id: user.id,
      label: label || null,
      url,
    });
  }

  return NextResponse.redirect(new URL(redirectTo || "/tasks", req.url));
}
