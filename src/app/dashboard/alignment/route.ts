import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function parseFlags(value: string) {
  return value
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean);
}

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
  const periodStart = String(form.get("period_start") || "").trim();
  if (!periodStart) return NextResponse.redirect(new URL("/dashboard", req.url));

  const score = toNumber(String(form.get("alignment_score") || "").trim());
  const status = String(form.get("alignment_status") || "").trim() || null;
  const flags = parseFlags(String(form.get("drift_flags") || "").trim());

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(0);

  await supabase.from("monthly_reviews").upsert(
    {
      user_id: user.id,
      period_start: periodStart,
      period_end: periodEnd.toISOString().slice(0, 10),
      alignment_score: score,
      alignment_status: status,
      drift_flags: flags,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,period_start" }
  );

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
