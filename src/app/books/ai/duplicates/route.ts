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
  const userPrompt = `Scan chapters for redundancy and propose *balanced* edits (remove repeated stats, duplicated anecdotes, or near-identical paragraphs). Do not shorten entire sections or convert prose into bullets. Preserve recurring structural blocks and signatures. ${prompt ? `Additional instructions: ${prompt}` : ""}\nRequired: Keep any existing blocks for Quote, Scripture, Next Steps, Challenge, and Questions for Reflection.\nChapters:\n${JSON.stringify(
    chapterContext
  )}\nReturn JSON array of {chapter_id,instruction,proposed_markdown}.`;

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
    const match = output.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) items = parsed as DuplicateResult[];
      } catch {
        items = [];
      }
    }
  }

  if (!items.length) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=duplicates_none`, req.url));
  }

  const chaptersById = new Map((chapters || []).map((ch) => [ch.id, ch]));
  const inserts = items
    .filter((item) => item.chapter_id && item.proposed_markdown)
    .map((item) => {
      const current = chaptersById.get(item.chapter_id);
      if (!current) return null;
      const currentMarkdown = current.markdown_current || "";
      const proposed = item.proposed_markdown || "";
      const requiredLines: string[] = [];

      const firstQuote = currentMarkdown.split("\n").find((line: string) => line.trim().startsWith("> "));
      if (firstQuote) requiredLines.push(firstQuote.trim());
      const scriptureLine = currentMarkdown.split("\n").find((line: string) => line.toLowerCase().includes("scripture:"));
      if (scriptureLine) requiredLines.push(scriptureLine.trim());
      const nextStepsLine = currentMarkdown.split("\n").find((line: string) => line.toLowerCase().includes("next steps"));
      if (nextStepsLine) requiredLines.push(nextStepsLine.trim());
      const challengeLine = currentMarkdown.split("\n").find((line: string) => line.toLowerCase().includes("challenge"));
      if (challengeLine) requiredLines.push(challengeLine.trim());
      const questionsLine = currentMarkdown
        .split("\n")
        .find((line: string) => line.toLowerCase().includes("questions for reflection"));
      if (questionsLine) requiredLines.push(questionsLine.trim());

      const missingRequired = requiredLines.some((line) => line && !proposed.includes(line));
      if (missingRequired) return null;

      const lengthDelta = Math.abs(proposed.length - currentMarkdown.length) / Math.max(1, currentMarkdown.length);
      if (lengthDelta > 0.4) return null;

      return {
        chapter_id: item.chapter_id,
        org_id: user.id,
        instruction: item.instruction || "Reduce duplicate content (surgical edits only)",
        proposed_markdown: proposed,
        status: "pending",
      };
    })
    .filter(Boolean) as Array<{
    chapter_id: string;
    org_id: string;
    instruction: string;
    proposed_markdown: string;
    status: string;
  }>;

  if (inserts.length > 0) {
    await supabase.from("chapter_proposals").insert(inserts);
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=duplicates_ready`, req.url));
  }

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline&toast=duplicates_none`, req.url));
}
