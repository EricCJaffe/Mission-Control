import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  if (!title) return NextResponse.redirect(new URL("/sermons", req.url));

  const payload = {
    org_id: user.id,
    title,
    subtitle: String(form.get("subtitle") || "").trim() || null,
    description: String(form.get("description") || "").trim() || null,
    theme: String(form.get("theme") || "").trim() || null,
    status: String(form.get("status") || "planning").trim(),
    start_date: String(form.get("start_date") || "").trim() || null,
    end_date: String(form.get("end_date") || "").trim() || null,
  };

  const { data: inserted } = await supabase.from("sermon_series").insert(payload).select("id").single();
  if (inserted?.id) {
    return NextResponse.redirect(new URL(`/sermons/${inserted.id}`, req.url));
  }

  return NextResponse.redirect(new URL("/sermons", req.url));
}
