import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  const seriesId = String(form.get("series_id") || "").trim();
  if (!id || !seriesId) return NextResponse.redirect(new URL("/sermons", req.url));

  const outline = String(form.get("outline_md") || "");
  const manuscript = String(form.get("manuscript_md") || "");
  const notes = String(form.get("notes_md") || "");
  const wc = wordCount(manuscript || outline || "");

  const payload = {
    title: String(form.get("title") || "").trim(),
    preach_date: String(form.get("preach_date") || "").trim() || null,
    key_text: String(form.get("key_text") || "").trim() || null,
    big_idea: String(form.get("big_idea") || "").trim() || null,
    outline_md: outline,
    manuscript_md: manuscript,
    notes_md: notes,
    status: String(form.get("status") || "outline").trim(),
    updated_at: new Date().toISOString(),
    word_count: wc,
  };

  await supabase.from("sermons").update(payload).eq("id", id).eq("org_id", user.id);

  return NextResponse.redirect(new URL(`/sermons/${seriesId}`, req.url));
}
