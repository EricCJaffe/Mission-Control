import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  const redirect = String(form.get("redirect") || "").trim();

  if (!id) return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));

  await supabase.from("sermon_assets").delete().eq("id", id).eq("org_id", user.id);

  return NextResponse.redirect(new URL(redirect || req.headers.get("referer") || "/", req.url));
}
