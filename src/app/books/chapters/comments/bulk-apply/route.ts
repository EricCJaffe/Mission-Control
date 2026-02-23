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
  const redirect = String(form.get("redirect") || "").trim();
  const commentIds = (form.getAll("comment_ids") || []).map((id) => String(id).trim()).filter(Boolean);

  if (commentIds.length === 0) {
    return NextResponse.redirect(new URL(redirect || req.headers.get("referer") || "/", req.url));
  }

  const { data: comments } = await supabase
    .from("chapter_comments")
    .select("id,chapter_id,suggested_patch")
    .in("id", commentIds);

  const byChapter = new Map<string, string[]>();
  (comments || []).forEach((comment) => {
    if (!comment.suggested_patch) return;
    const list = byChapter.get(comment.chapter_id) || [];
    list.push(comment.suggested_patch);
    byChapter.set(comment.chapter_id, list);
  });

  for (const [chapterId, patches] of byChapter.entries()) {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("markdown_current")
      .eq("id", chapterId)
      .single();

    const updatedMarkdown = `${chapter?.markdown_current || ""}\n\n${patches.join("\n\n")}`;

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
  }

  await supabase.from("chapter_comments").update({ status: "applied" }).in("id", commentIds);

  return NextResponse.redirect(new URL(redirect || req.headers.get("referer") || "/", req.url));
}
