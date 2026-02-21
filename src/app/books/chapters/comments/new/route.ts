import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const chapterId = String(form.get("chapter_id") || "").trim();
  const comment = String(form.get("comment") || "").trim();
  const anchorText = String(form.get("anchor_text") || "").trim();
  const suggestedPatch = String(form.get("suggested_patch") || "").trim();

  if (!chapterId || !comment) return NextResponse.redirect(new URL(req.url).origin);

  await supabase.from("chapter_comments").insert({
    chapter_id: chapterId,
    org_id: user.id,
    anchor_text: anchorText || null,
    comment,
    suggested_patch: suggestedPatch || null,
    created_by: user.id,
  });

  return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
}
