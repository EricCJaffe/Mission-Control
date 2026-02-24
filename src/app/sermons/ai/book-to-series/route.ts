import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const seriesId = String(form.get("series_id") || "").trim();
  const bookId = String(form.get("book_id") || "").trim();
  if (!seriesId || !bookId) return NextResponse.redirect(new URL(`/sermons/${seriesId}?tab=ai`, req.url));

  const { data: book } = await supabase
    .from("books")
    .select("id,title,description")
    .eq("id", bookId)
    .single();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,summary,position,markdown_current")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  const output = await callOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    system: `You are a sermon series architect. Convert a book outline into sermon topics.`,
    user: `Book: ${JSON.stringify(book)}\nChapters: ${JSON.stringify(chapters)}\nReturn JSON: {sermons:[{title, key_text, big_idea}]}`,
  });

  let sermons: Array<{ title: string; key_text?: string; big_idea?: string }> = [];
  try {
    const parsed = JSON.parse(output);
    sermons = Array.isArray(parsed.sermons) ? parsed.sermons : [];
  } catch {
    sermons = [];
  }

  if (sermons.length > 0) {
    const { data: maxPos } = await supabase
      .from("sermons")
      .select("position")
      .eq("series_id", seriesId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let position = (maxPos?.position ?? 0) + 1;
    await supabase.from("sermons").insert(
      sermons.map((sermon) => ({
        series_id: seriesId,
        org_id: user.id,
        title: sermon.title,
        key_text: sermon.key_text || null,
        big_idea: sermon.big_idea || null,
        status: "outline",
        position: position++,
        outline_md: "",
        manuscript_md: "",
        notes_md: "",
      }))
    );
  }

  return NextResponse.redirect(new URL(`/sermons/${seriesId}?tab=outline`, req.url));
}
