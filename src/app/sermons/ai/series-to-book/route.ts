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
  if (!seriesId) return NextResponse.redirect(new URL("/sermons", req.url));

  const { data: series } = await supabase
    .from("sermon_series")
    .select("id,title,subtitle,theme,description")
    .eq("id", seriesId)
    .single();

  const { data: sermons } = await supabase
    .from("sermons")
    .select("id,title,key_text,big_idea,outline_md,manuscript_md,position")
    .eq("series_id", seriesId)
    .order("position", { ascending: true });

  const [personaResult, soulResult] = await Promise.all([
    supabase
      .from("notes")
      .select("content_md")
      .eq("title", "persona")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notes")
      .select("content_md")
      .eq("title", "soul")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const persona = personaResult.data?.content_md || "";
  const soul = soulResult.data?.content_md || "";

  const output = await callOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    system: `You are a book architect aligned to the persona and soul. Create a book outline from a sermon series.`,
    user: `Series: ${JSON.stringify(series)}\nSermons: ${JSON.stringify(sermons)}\nPersona:\n${persona}\nSoul:\n${soul}\nReturn JSON: {chapters:[{title,summary}]}`,
  });

  let chapters: Array<{ title: string; summary?: string }> = [];
  try {
    const parsed = JSON.parse(output);
    chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  } catch {
    chapters = [];
  }

  if (chapters.length > 0) {
    const { data: book } = await supabase
      .from("books")
      .insert({
        org_id: user.id,
        title: series?.title || "Sermon Series Book",
        description: series?.description || null,
        status: "planning",
      })
      .select("id")
      .single();

    if (book?.id) {
      await supabase.from("chapters").insert(
        chapters.map((chapter, idx) => ({
          book_id: book.id,
          org_id: user.id,
          title: chapter.title,
          summary: chapter.summary || null,
          status: "outline",
          position: idx + 1,
          markdown_current: "",
        }))
      );
    }
  }

  return NextResponse.redirect(new URL(`/sermons/${seriesId}?tab=ai`, req.url));
}
