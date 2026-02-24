import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

const ASSET_TYPES = [
  "Small Group Leader Guide",
  "Small Group Participant Guide",
  "Daily Devotional Pack",
  "Social Media Pack",
];

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  if (!bookId) return NextResponse.redirect(new URL("/books", req.url));

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

  for (const assetType of ASSET_TYPES) {
    const output = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      system: `You are a publishing assistant aligned to persona and soul. Produce ${assetType} in markdown.`,
      user: `Book: ${JSON.stringify(book)}\nChapters: ${JSON.stringify(chapters)}\nPersona:\n${persona}\nSoul:\n${soul}`,
    });

    await supabase.from("sermon_assets").insert({
      org_id: user.id,
      scope_type: "book",
      scope_id: bookId,
      asset_type: assetType,
      content_md: output,
      status: "draft",
    });
  }

  return NextResponse.redirect(new URL(`/books/${bookId}/ai?toast=assets_ready`, req.url));
}
