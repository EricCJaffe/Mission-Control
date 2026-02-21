import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const commentId = String(form.get("comment_id") || "").trim();
  const chapterId = String(form.get("chapter_id") || "").trim();
  if (!commentId || !chapterId) return NextResponse.redirect(new URL(req.url).origin);

  const { data: comment } = await supabase
    .from("chapter_comments")
    .select("suggested_patch")
    .eq("id", commentId)
    .single();

  if (!comment?.suggested_patch) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("markdown_current")
    .eq("id", chapterId)
    .single();

  const updatedMarkdown = `${chapter?.markdown_current || ""}\n\n${comment.suggested_patch}`;

  const { data: latestVersion } = await supabase
    .from("chapter_versions")
    .select("version_number")
    .eq("chapter_id", chapterId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latestVersion?.version_number ?? 0) + 1;

  await supabase
    .from("chapters")
    .update({
      markdown_current: updatedMarkdown,
      word_count: wordCount(updatedMarkdown),
      updated_at: new Date().toISOString(),
    })
    .eq("id", chapterId);

  await supabase.from("chapter_versions").insert({
    chapter_id: chapterId,
    org_id: user.id,
    version_number: nextVersion,
    markdown: updatedMarkdown,
    created_by: user.id,
  });

  await supabase.from("chapter_comments").update({ status: "applied" }).eq("id", commentId);

  return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
}
