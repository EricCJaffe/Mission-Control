import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const taskId = String(form.get("task_id") || "").trim();
  const noteId = String(form.get("note_id") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (taskId && noteId) {
    await supabase.from("task_note_links").insert({
      task_id: taskId,
      note_id: noteId,
      org_id: user.id,
    });
  }

  return NextResponse.redirect(new URL(redirectTo || "/tasks", req.url));
}
