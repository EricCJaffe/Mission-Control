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
  const bookId = String(form.get("book_id") || "").trim();
  const prompt = String(form.get("prompt") || "").trim();
  if (!bookId) return NextResponse.redirect(new URL("/books", req.url));

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,markdown_current")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  const persona = await getPersonaProfile(user.id);

  for (const chapter of chapters || []) {
    let output = "";
    try {
      output = await callOpenAI({
        model: process.env.OPENAI_MODEL || "gpt-5.2",
        system: `You are a senior book editor aligned to this persona.\nPersona: ${persona.title}\nTone: ${persona.tone}\nMission: ${persona.mission_alignment}\nPersona Notes:\n${persona.content_md || ""}`,
        user: [
          `Chapter: ${chapter.title}`,
          "Provide 2-6 inline review comments anchored to short exact excerpts. Keep edits surgical.",
          "Return JSON array of {anchor_text, comment, suggested_patch}.",
          prompt ? `Additional instructions: ${prompt}` : "",
          "",
          (chapter.markdown_current || "").slice(0, 12000),
        ].join("\n"),
      });
    } catch {
      continue;
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
          chapter_id: chapter.id,
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
  }

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=inline_ready`, req.url));
}
