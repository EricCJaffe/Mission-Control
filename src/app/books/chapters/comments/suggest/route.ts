import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const commentId = String(form.get("comment_id") || "").trim();
  const chapterId = String(form.get("chapter_id") || "").trim();

  if (!commentId || !chapterId) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  const { data: comment } = await supabase
    .from("chapter_comments")
    .select("comment,anchor_text")
    .eq("id", commentId)
    .single();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("title,markdown_current")
    .eq("id", chapterId)
    .single();

  if (!comment || !chapter) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  let suggestion = "";
  try {
    suggestion = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      system: "You are a book editor providing concise rewrite suggestions.",
      user: [
        `Chapter: ${chapter.title}`,
        `Comment: ${comment.comment}`,
        `Anchor: ${comment.anchor_text || ""}`,
        "Return only the suggested replacement text. If the change is global, summarize the change.",
        "",
        (chapter.markdown_current || "").slice(0, 8000),
      ].join("\n"),
    });
  } catch {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  await supabase.from("chapter_comments").update({ suggested_patch: suggestion }).eq("id", commentId);

  return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
}
