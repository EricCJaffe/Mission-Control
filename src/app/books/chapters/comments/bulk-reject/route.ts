import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const redirect = String(form.get("redirect") || "").trim();
  const commentIds = (form.getAll("comment_ids") || []).map((id) => String(id).trim()).filter(Boolean);

  if (commentIds.length === 0) {
    return NextResponse.redirect(new URL(redirect || req.headers.get("referer") || "/", req.url));
  }

  await supabase.from("chapter_comments").update({ status: "rejected" }).in("id", commentIds);

  return NextResponse.redirect(new URL(redirect || req.headers.get("referer") || "/", req.url));
}
