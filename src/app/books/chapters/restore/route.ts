import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { chunkMarkdown, upsertChapterChunks } from "@/lib/ai/chunking";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const chapterId = String(form.get("chapter_id") || "").trim();
  const versionId = String(form.get("version_id") || "").trim();

  if (!chapterId || !versionId) return NextResponse.redirect(new URL(`/books`, req.url));

  const { data: version } = await supabase
    .from("chapter_versions")
    .select("markdown")
    .eq("id", versionId)
    .single();

  if (!version) return NextResponse.redirect(new URL(`/books`, req.url));

  const { data: chapter } = await supabase
    .from("chapters")
    .select("book_id")
    .eq("id", chapterId)
    .single();

  await supabase
    .from("chapters")
    .update({ markdown_current: version.markdown, updated_at: new Date().toISOString() })
    .eq("id", chapterId);

  const chunks = chunkMarkdown(version.markdown);
  await upsertChapterChunks(supabase, chapterId, user.id, chunks);

  const bookId = chapter?.book_id || "";
  return NextResponse.redirect(new URL(`/books/${bookId}/chapters/${chapterId}`, req.url));
}
