import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const instruction = String(form.get("instruction") || "").trim();
  const mode = String(form.get("mode") || "bulk").trim();

  if (!bookId || !instruction) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,markdown_current")
    .eq("book_id", bookId)
    .order("position", { ascending: true });

  for (const chapter of chapters || []) {
    const input = [
      `Mode: ${mode}`,
      `Instruction: ${instruction}`,
      `Chapter: ${chapter.title}`,
      "Return the updated chapter markdown only. Preserve existing structure unless instructed.",
      "",
      chapter.markdown_current || "",
    ].join("\n");

    let updatedMarkdown = chapter.markdown_current || "";
    try {
      updatedMarkdown = await callOpenAI({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        system: "You are a careful book editor applying requested changes to chapters.",
        user: input,
      });
    } catch {
      continue;
    }

    const { data: latestVersion } = await supabase
      .from("chapter_versions")
      .select("version_number")
      .eq("chapter_id", chapter.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersion?.version_number ?? 0) + 1;

    await supabase
      .from("chapters")
      .update({
        markdown_current: updatedMarkdown,
        word_count: wordCount(updatedMarkdown),
        updated_at: new Date().toISOString(),
      })
      .eq("id", chapter.id);

    await supabase.from("chapter_versions").insert({
      chapter_id: chapter.id,
      org_id: user.id,
      version_number: nextVersion,
      markdown: updatedMarkdown,
      created_by: user.id,
    });
  }

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
