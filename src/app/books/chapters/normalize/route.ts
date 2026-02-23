import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripChapterPrefix } from "@/lib/text";
import { callOpenAI } from "@/lib/openai";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();

  if (!bookId) return NextResponse.redirect(new URL("/books", req.url));

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title")
    .eq("book_id", bookId);

  const updates = (chapters || []).map((ch) => {
    const cleaned = stripChapterPrefix(ch.title || "");
    if (!cleaned || cleaned === ch.title) return null;
    return supabase.from("chapters").update({ title: cleaned }).eq("id", ch.id);
  }).filter(Boolean);

  if (updates.length > 0) {
    await Promise.all(updates.map((query) => query as unknown as Promise<unknown>));
  }

  const { data: refreshed } = await supabase
    .from("chapters")
    .select("id,title,summary,position")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  if (refreshed && refreshed.length > 0) {
    const context = refreshed.map((ch, idx) => ({
      id: ch.id,
      number: idx + 1,
      title: ch.title,
      summary: ch.summary,
    }));

    const system = "You are a precise editor. Generate concise TOC titles and optional summaries. Return JSON only.";
    const userPrompt = `Update TOC titles after normalization. Chapters: ${JSON.stringify(context)}. Return JSON array of {id,title,summary}.`;

    try {
      const output = await callOpenAI({
        model: process.env.OPENAI_MODEL || "gpt-5.2-chat-latest",
        system,
        user: userPrompt,
      });

      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        const updates = parsed
          .filter((item) => item?.id)
          .map((item) => {
            const payload: Record<string, unknown> = {};
            if (item.title) payload.title = stripChapterPrefix(String(item.title));
            if (item.summary) payload.summary = String(item.summary);
            if (Object.keys(payload).length === 0) return null;
            return supabase.from("chapters").update(payload).eq("id", item.id);
          })
          .filter(Boolean);
        if (updates.length > 0) {
          await Promise.all(updates.map((query) => query as unknown as Promise<unknown>));
        }
      }
    } catch {
      // Ignore TOC refresh errors and continue
    }
  }

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
