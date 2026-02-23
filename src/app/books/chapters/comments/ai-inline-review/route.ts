import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";
import { getPersonaProfile } from "@/lib/ai/persona";

type InlineComment = {
  anchor_text: string;
  comment: string;
  suggested_patch?: string;
};

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const chapterId = String(form.get("chapter_id") || "").trim();
  if (!chapterId) return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));

  const { data: chapter } = await supabase
    .from("chapters")
    .select("title,markdown_current")
    .eq("id", chapterId)
    .single();

  if (!chapter) return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));

  const persona = await getPersonaProfile(user.id);
  let output = "";
  try {
    output = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      system: `You are a senior book editor aligned to this persona.\nPersona: ${persona.title}\nTone: ${persona.tone}\nMission: ${persona.mission_alignment}\nPersona Notes:\n${persona.content_md || ""}`,
      user: [
        `Chapter: ${chapter.title}`,
        "Provide 3-8 inline review comments anchored to short exact excerpts. Keep edits surgical.",
        "Return JSON array of {anchor_text, comment, suggested_patch}.",
        "",
        (chapter.markdown_current || "").slice(0, 12000),
      ].join("\n"),
    });
  } catch {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  let items: InlineComment[] = [];
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) items = parsed as InlineComment[];
  } catch {
    const match = output.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) items = parsed as InlineComment[];
      } catch {
        items = [];
      }
    }
  }

  if (items.length > 0) {
    const inserts = items
      .filter((item) => item.anchor_text && item.comment)
      .map((item) => ({
        chapter_id: chapterId,
        org_id: user.id,
        anchor_text: item.anchor_text.slice(0, 400),
        comment: item.comment,
        suggested_patch: item.suggested_patch || "",
        created_by: user.id,
      }));
    if (inserts.length > 0) {
      await supabase.from("chapter_comments").insert(inserts);
    }
  }

  return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
}
