import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const seriesId = String(form.get("series_id") || "").trim();
  const title = String(form.get("title") || "").trim();
  if (!seriesId || !title) return NextResponse.redirect(new URL("/sermons", req.url));

  const { data: maxPos } = await supabase
    .from("sermons")
    .select("position")
    .eq("series_id", seriesId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxPos?.position ?? 0) + 1;

  const { data: inserted } = await supabase
    .from("sermons")
    .insert({
      series_id: seriesId,
      org_id: user.id,
      title,
      preach_date: String(form.get("preach_date") || "").trim() || null,
      position,
      status: "outline",
      outline_md: "",
      manuscript_md: "",
      notes_md: "",
    })
    .select("id")
    .single();

  if (inserted?.id) {
    return NextResponse.redirect(new URL(`/sermons/${seriesId}`, req.url));
  }

  return NextResponse.redirect(new URL(`/sermons/${seriesId}`, req.url));
}
