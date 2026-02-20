import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const domain = String(form.get("domain") || "").trim();
  const cycleId = String(form.get("cycle_id") || "").trim();
  const descriptionMd = String(form.get("description_md") || "");

  if (!title || !domain) {
    return NextResponse.redirect(new URL("/goals", req.url));
  }

  await supabase.from("goals").insert({
    user_id: user.id,
    title,
    domain,
    description_md: descriptionMd,
    cycle_id: cycleId || null,
  });

  return NextResponse.redirect(new URL("/goals", req.url));
}
