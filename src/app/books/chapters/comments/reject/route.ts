import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const commentId = String(form.get("comment_id") || "").trim();
  const redirect = String(form.get("redirect") || "").trim();

  if (commentId) {
    await supabase.from("chapter_comments").update({ status: "rejected" }).eq("id", commentId);
  }

  return NextResponse.redirect(new URL(redirect || req.headers.get("referer") || "/", req.url));
}
