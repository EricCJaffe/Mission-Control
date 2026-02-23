import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";
import { getPersonaProfile } from "@/lib/ai/persona";
import { stripChapterPrefix } from "@/lib/text";

type ReorderPlan = {
  ordered_ids: string[];
  rationale?: string;
  toc?: Array<{ id: string; title?: string; summary?: string }>;
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
    .select("id,title,summary,markdown_current,position")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  const chapterContext = (chapters || []).map((ch, idx) => ({
    id: ch.id,
    current_number: idx + 1,
    title: ch.title,
    summary: ch.summary,
    excerpt: (ch.markdown_current || "").slice(0, 1200),
  }));

  const persona = await getPersonaProfile(user.id);
  const system = `You are a senior book editor aligned to this persona.\nPersona: ${persona.title}\nTone: ${persona.tone}\nMission: ${persona.mission_alignment}\nPersona Notes:\n${persona.content_md || ""}`;
  const userPrompt = `Reorder chapters for best narrative flow. ${prompt ? `Additional instructions: ${prompt}` : ""}\nChapters:\n${JSON.stringify(chapterContext)}\nReturn JSON with keys ordered_ids (array of chapter ids in new order), rationale (string), toc (array of {id,title,summary}).`;

  const output = await callOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    system,
    user: userPrompt,
  });

  let plan: ReorderPlan | null = null;
  try {
    plan = JSON.parse(output);
  } catch {
    const match = output.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        plan = JSON.parse(match[0]);
      } catch {
        plan = null;
      }
    }
  }

  if (!plan?.ordered_ids?.length) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=reorder_failed`, req.url));
  }

  const normalizedPlan: ReorderPlan = {
    ordered_ids: plan.ordered_ids,
    rationale: plan.rationale || "",
    toc: (plan.toc || []).map((item) => ({
      ...item,
      title: item.title ? stripChapterPrefix(item.title) : item.title,
    })),
  };

  await supabase.from("book_proposals").insert({
    book_id: bookId,
    org_id: user.id,
    proposal_type: "reorder",
    status: "pending",
    payload: normalizedPlan,
  });

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
