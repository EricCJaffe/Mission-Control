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
  // Empty means standalone, not invalid. Requiring it here was the third of
  // the three layers that made a sermon without a series impossible -- the
  // others were the NOT NULL column and the list page. See the migration
  // 20260919221500_a_sermon_can_stand_on_its_own.sql.
  const seriesId = String(form.get("series_id") || "").trim() || null;
  if (!id) return NextResponse.redirect(new URL("/sermons", req.url));

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

  // A standalone has no series page to go back to.
  return NextResponse.redirect(
    new URL(seriesId ? `/sermons/${seriesId}` : `/sermons/sermon/${id}`, req.url)
  );
}
