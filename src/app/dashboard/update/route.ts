import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function toNumber(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const scoreId = String(form.get("score_id") || "").trim();

  const payload = {
    user_id: user.id,
    spirit: toNumber(String(form.get("spirit") || "").trim()),
    soul: toNumber(String(form.get("soul") || "").trim()),
    body: toNumber(String(form.get("body") || "").trim()),
    spirit_alignment: String(form.get("spirit_alignment") || "").trim() || null,
    soul_alignment: String(form.get("soul_alignment") || "").trim() || null,
    body_alignment: String(form.get("body_alignment") || "").trim() || null,
    spirit_action: String(form.get("spirit_action") || "").trim() || null,
    soul_action: String(form.get("soul_action") || "").trim() || null,
    body_action: String(form.get("body_action") || "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (scoreId) {
    await supabase.from("dashboard_scores").update(payload).eq("id", scoreId);
  } else {
    await supabase.from("dashboard_scores").insert(payload);
  }

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
