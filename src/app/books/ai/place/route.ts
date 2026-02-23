import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";
import { getPersonaProfile } from "@/lib/ai/persona";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const concept = String(form.get("concept") || "").trim();

  if (!bookId || !concept) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,summary,markdown_current,position")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  const context = (chapters || []).map((ch) => ({
    id: ch.id,
    title: ch.title,
    summary: ch.summary || "",
    excerpt: (ch.markdown_current || "").slice(0, 800),
  }));

  const persona = await getPersonaProfile(user.id);

  let plan: { chapter_id: string; proposed_markdown: string; instruction?: string } | null = null;
  try {
    const response = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      system: `You are a book editor aligned to this persona.\nPersona: ${persona.title}\nTone: ${persona.tone}\nMission: ${persona.mission_alignment}\nPersona Notes:\n${persona.content_md || ""}`,
      user: `Insert the concept into the most appropriate chapter. Reword the concept to fit the surrounding context and flow. Return JSON with keys: chapter_id, proposed_markdown, instruction.\nConcept:\n${concept}\nChapters:\n${JSON.stringify(
        context
      )}`,
    });
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      plan = JSON.parse(match[0]);
    }
  } catch {
    plan = null;
  }

  if (!plan?.chapter_id || !plan?.proposed_markdown) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=place_failed`, req.url));
  }

  await supabase.from("chapter_proposals").insert({
    chapter_id: plan.chapter_id,
    org_id: user.id,
    instruction: plan.instruction || "Insert concept into best chapter",
    proposed_markdown: plan.proposed_markdown,
    status: "pending",
  });

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=place_ready`, req.url));
}
