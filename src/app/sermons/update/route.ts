import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  if (!id) return NextResponse.redirect(new URL("/sermons", req.url));

  const payload = {
    title: String(form.get("title") || "").trim(),
    subtitle: String(form.get("subtitle") || "").trim() || null,
    description: String(form.get("description") || "").trim() || null,
    theme: String(form.get("theme") || "").trim() || null,
    status: String(form.get("status") || "planning").trim(),
    updated_at: new Date().toISOString(),
  };

  await supabase.from("sermon_series").update(payload).eq("id", id).eq("org_id", user.id);

  return NextResponse.redirect(new URL(`/sermons/${id}`, req.url));
}
