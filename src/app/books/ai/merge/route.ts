import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";
import { getPersonaProfile } from "@/lib/ai/persona";

type MergePlan = {
  merged_markdown: string;
  summary?: string;
  integration_notes?: string;
};

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const sourceId = String(form.get("source_id") || "").trim();
  const targetId = String(form.get("target_id") || "").trim();
  const prompt = String(form.get("prompt") || "").trim();

  if (!bookId || !sourceId || !targetId || sourceId === targetId) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=merge_failed`, req.url));
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,summary,markdown_current")
    .in("id", [sourceId, targetId]);

  const source = (chapters || []).find((ch) => ch.id === sourceId);
  const target = (chapters || []).find((ch) => ch.id === targetId);

  if (!source || !target) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=merge_failed`, req.url));
  }

  const persona = await getPersonaProfile(user.id);
  const system = `You are a senior book editor aligned to this persona.\nPersona: ${persona.title}\nTone: ${persona.tone}\nMission: ${persona.mission_alignment}\nPersona Notes:\n${persona.content_md || ""}`;
  const userPrompt = `Merge the source chapter into the target chapter. Preserve the target chapter's voice and improve flow. ${prompt ? `Additional instructions: ${prompt}` : ""}\nReturn JSON with keys: merged_markdown (string), summary (string), integration_notes (string).\nSource chapter:\n${JSON.stringify({
    id: source.id,
    title: source.title,
    summary: source.summary,
    markdown: source.markdown_current || "",
  })}\nTarget chapter:\n${JSON.stringify({
    id: target.id,
    title: target.title,
    summary: target.summary,
    markdown: target.markdown_current || "",
  })}`;

  const output = await callOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    system,
    user: userPrompt,
  });

  let plan: MergePlan | null = null;
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

  if (!plan?.merged_markdown) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=merge_failed`, req.url));
  }

  await supabase.from("book_proposals").insert({
    book_id: bookId,
    org_id: user.id,
    proposal_type: "merge",
    status: "pending",
    payload: {
      source_id: sourceId,
      target_id: targetId,
      summary: plan.summary || "",
      integration_notes: plan.integration_notes || "",
      merged_markdown: plan.merged_markdown,
    },
  });

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=merge_ready`, req.url));
}
