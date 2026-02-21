import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const chapterId = String(form.get("chapter_id") || "").trim();
  if (!chapterId) return NextResponse.redirect(new URL(req.url).origin);

  const { data: chapter } = await supabase
    .from("chapters")
    .select("title,markdown_current")
    .eq("id", chapterId)
    .single();

  if (!chapter) return NextResponse.redirect(new URL(req.url).origin);

  let reviewText = "";
  try {
    reviewText = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      system: "You are a senior book editor. Identify issues and propose concise improvements.",
      user: `Review this chapter for grammar, clarity, consistency, and flow. Provide 3-6 bullet points of suggested changes with optional patch text.\n\n${chapter.markdown_current || ""}`,
    });
  } catch {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  await supabase.from("chapter_comments").insert({
    chapter_id: chapterId,
    org_id: user.id,
    comment: "AI Editor Review",
    suggested_patch: reviewText,
    created_by: user.id,
  });

  return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
}
