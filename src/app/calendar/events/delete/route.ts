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

  if (id) {
    await supabase.from("calendar_events").delete().eq("id", id).eq("user_id", user.id);
  }

  return NextResponse.redirect(new URL(redirect || "/calendar", req.url));
}
