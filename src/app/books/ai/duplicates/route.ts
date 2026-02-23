import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";
import { getPersonaProfile } from "@/lib/ai/persona";

type DuplicateResult = {
  chapter_id: string;
  instruction: string;
  proposed_markdown: string;
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
    .select("id,title,markdown_current,position")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  const chapterContext = (chapters || []).map((ch, idx) => ({
    id: ch.id,
    number: idx + 1,
    title: ch.title,
    content: (ch.markdown_current || "").slice(0, 4000),
  }));

  const persona = await getPersonaProfile(user.id);

  const system = `You are a rigorous book editor aligned to this persona.\nPersona: ${persona.title}\nTone: ${persona.tone}\nMission: ${persona.mission_alignment}\nPersona Notes:\n${persona.content_md || ""}`;
  const userPrompt = `Scan chapters for redundancy and propose streamlined edits per affected chapter. ${prompt ? `Additional instructions: ${prompt}` : ""}\nChapters:\n${JSON.stringify(chapterContext)}\nReturn JSON array of {chapter_id,instruction,proposed_markdown}.`;

  const output = await callOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    system,
    user: userPrompt,
  });

  let items: DuplicateResult[] = [];
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) items = parsed as DuplicateResult[];
  } catch {
    items = [];
  }

  if (!items.length) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
  }

  const inserts = items
    .filter((item) => item.chapter_id && item.proposed_markdown)
    .map((item) => ({
      chapter_id: item.chapter_id,
      org_id: user.id,
      instruction: item.instruction || "Reduce duplicate content",
      proposed_markdown: item.proposed_markdown,
      status: "pending",
    }));

  if (inserts.length > 0) {
    await supabase.from("chapter_proposals").insert(inserts);
  }

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
