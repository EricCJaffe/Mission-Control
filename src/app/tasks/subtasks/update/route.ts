import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  const status = String(form.get("status") || "").trim();
  const title = String(form.get("title") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (id) {
    const payload: Record<string, unknown> = {};
    if (form.has("status")) payload.status = status || null;
    if (form.has("title")) payload.title = title || null;
    await supabase.from("task_subtasks").update(payload).eq("id", id).eq("org_id", user.id);
  }

  return NextResponse.redirect(new URL(redirectTo || "/tasks", req.url));
}
