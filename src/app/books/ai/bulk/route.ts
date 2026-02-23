import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";
import { getPersonaProfile } from "@/lib/ai/persona";

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const instruction = String(form.get("instruction") || "").trim();
  const mode = String(form.get("mode") || "bulk").trim();

  if (!bookId || !instruction) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,markdown_current")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  const persona = await getPersonaProfile(user.id);

  for (const chapter of chapters || []) {
    const input = [
      `Mode: ${mode}`,
      `Instruction: ${instruction}`,
      `Chapter: ${chapter.title}`,
      "Return the updated chapter markdown only. Preserve existing structure unless instructed.",
      "",
      chapter.markdown_current || "",
    ].join("\n");

    let updatedMarkdown = chapter.markdown_current || "";
    try {
      updatedMarkdown = await callOpenAI({
        model: process.env.OPENAI_MODEL || "gpt-5.2",
        system: `You are a careful book editor aligned to this persona.\nPersona: ${persona.title}\nTone: ${persona.tone}\nMission: ${persona.mission_alignment}\nPersona Notes:\n${persona.content_md || ""}`,
        user: input,
      });
    } catch {
      continue;
    }

    await supabase.from("chapter_proposals").insert({
      chapter_id: chapter.id,
      org_id: user.id,
      instruction,
      proposed_markdown: updatedMarkdown,
      status: "pending",
    });
  }

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
