import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

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

  let chosenId = chapters?.[0]?.id || "";
  try {
    const response = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      system: "You are a book editor that routes concepts to the best fitting chapter.",
      user: `Concept: ${concept}\nChapters: ${JSON.stringify(context)}\nReturn only the chapter id.`,
    });
    const match = response.trim();
    if (context.find((c) => c.id === match)) {
      chosenId = match;
    }
  } catch {
    // fall back to first chapter
  }

  if (!chosenId) return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));

  return NextResponse.redirect(new URL(`/books/${bookId}/chapters/${chosenId}`, req.url));
}
