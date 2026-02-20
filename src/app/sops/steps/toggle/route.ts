import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();

  if (!id) return NextResponse.redirect(new URL("/sops", req.url));

  const { data: existing } = await supabase.from("sop_checks").select("is_done,sop_id").eq("id", id).single();
  if (!existing) return NextResponse.redirect(new URL("/sops", req.url));

  await supabase.from("sop_checks").update({
    is_done: !existing.is_done,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.redirect(new URL(`/sops/${existing.sop_id}`, req.url));
}
