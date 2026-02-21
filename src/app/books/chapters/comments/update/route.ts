import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const commentId = String(form.get("comment_id") || "").trim();
  const comment = String(form.get("comment") || "").trim();
  const suggestedPatch = String(form.get("suggested_patch") || "").trim();

  if (!commentId) return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));

  await supabase
    .from("chapter_comments")
    .update({
      comment: comment || null,
      suggested_patch: suggestedPatch || null,
    })
    .eq("id", commentId);

  return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
}
