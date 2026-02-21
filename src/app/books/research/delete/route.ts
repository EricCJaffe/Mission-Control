import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const noteId = String(form.get("note_id") || "").trim();
  const redirect = String(form.get("redirect") || "").trim();

  if (noteId) {
    await supabase.from("research_notes").delete().eq("id", noteId).eq("org_id", user.id);
  }

  return NextResponse.redirect(new URL(redirect || "/books", req.url));
}
