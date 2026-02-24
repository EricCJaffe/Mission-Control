import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { chunkMarkdown, upsertChapterChunks } from "@/lib/ai/chunking";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (!bookId) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,markdown_current")
    .eq("book_id", bookId);

  if (!chapters || chapters.length === 0) {
    return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
  }

  for (const chapter of chapters) {
    const markdown = chapter.markdown_current || "";
    const chunks = chunkMarkdown(markdown);
    await upsertChapterChunks(supabase, chapter.id, user.id, chunks);
  }

  const redirectUrl = new URL(redirectTo || req.headers.get("referer") || "/", req.url);
  redirectUrl.searchParams.set("toast", "embeddings_ready");
  return NextResponse.redirect(redirectUrl);
}
