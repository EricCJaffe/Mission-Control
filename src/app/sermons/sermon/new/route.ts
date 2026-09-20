import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Create a sermon, with or without a series.
 *
 * `series_id` used to be required and an empty one sent the user back to
 * /sermons with nothing created and no explanation. A sermon that belongs to no
 * series is now the common case — Eric, 2026-09-19: *"we need a standalone
 * category rather than just a series function"* — so an absent series_id is a
 * standalone sermon rather than a failed submission.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const seriesId = String(form.get("series_id") || "").trim() || null;
  const title = String(form.get("title") || "").trim();

  // Title is the only thing genuinely required. Everything else has a sensible
  // empty state, and refusing the whole submission over a missing date is how
  // a person loses what they typed.
  if (!title) return NextResponse.redirect(new URL("/sermons", req.url));

  // `position` orders a sermon inside its series and has no meaning without
  // one. A standalone gets null rather than 1, so it can never be mistaken for
  // "the first sermon of some series".
  let position: number | null = null;
  if (seriesId) {
    const { data: maxPos } = await supabase
      .from("sermons")
      .select("position")
      .eq("series_id", seriesId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (maxPos?.position ?? 0) + 1;
  }

  const { data: inserted } = await supabase
    .from("sermons")
    .insert({
      series_id: seriesId,
      org_id: user.id,
      title,
      preach_date: String(form.get("preach_date") || "").trim() || null,
      key_text: String(form.get("key_text") || "").trim() || null,
      big_idea: String(form.get("big_idea") || "").trim() || null,
      position,
      status: String(form.get("status") || "").trim() || "outline",
      outline_md: "",
      manuscript_md: "",
      notes_md: "",
    })
    .select("id")
    .single();

  // A standalone has no series page to return to, so it returns to its own.
  if (seriesId) return NextResponse.redirect(new URL(`/sermons/${seriesId}`, req.url));
  if (inserted?.id) {
    return NextResponse.redirect(new URL(`/sermons/sermon/${inserted.id}`, req.url));
  }
  return NextResponse.redirect(new URL("/sermons", req.url));
}
