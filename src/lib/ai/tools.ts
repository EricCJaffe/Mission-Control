import { supabaseServer } from "@/lib/supabase/server";
import { chunkMarkdown, upsertChapterChunks } from "@/lib/ai/chunking";

export async function retrieveContext(scopeType: string, scopeId: string, query?: string) {
  const supabase = await supabaseServer();
  if (scopeType === "chapter") {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id,title,markdown_current")
      .eq("id", scopeId)
      .single();
    return { scopeType, scopeId, query, chapter };
  }
  if (scopeType === "book") {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id,title,markdown_current,position")
      .eq("book_id", scopeId)
      .order("position", { ascending: true });
    return { scopeType, scopeId, query, chapters };
  }
  return { scopeType, scopeId, query, data: null };
}

export async function applyPatch(chapterId: string, patch: string) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false };

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id,markdown_current")
    .eq("id", chapterId)
    .single();

  if (!chapter) return { ok: false };

  const merged = `${chapter.markdown_current || ""}\n\n${patch}`.trim();

  const { data: latestVersion } = await supabase
    .from("chapter_versions")
    .select("version_number")
    .eq("chapter_id", chapterId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latestVersion?.version_number ?? 0) + 1;

  const wordCount = merged.trim().split(/\s+/).filter(Boolean).length;

  await supabase
    .from("chapters")
    .update({ markdown_current: merged, word_count: wordCount, updated_at: new Date().toISOString() })
    .eq("id", chapterId);

  await supabase.from("chapter_versions").insert({
    chapter_id: chapterId,
    org_id: user.id,
    version_number: nextVersion,
    markdown: merged,
    created_by: user.id,
  });

  const chunks = chunkMarkdown(merged);
  await upsertChapterChunks(supabase, chapterId, user.id, chunks);

  return { ok: true, markdown: merged };
}

export async function reorderChapters(bookId: string, orderedIds: string[]) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false };

  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("chapters").update({ position: idx + 1 }).eq("id", id)
    )
  );

  return { ok: true };
}

export async function generateOutline(chapterId: string) {
  const supabase = await supabaseServer();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("title")
    .eq("id", chapterId)
    .single();

  return {
    outline: `# Outline for ${chapter?.title || "Chapter"}\n\n- Key point 1\n- Key point 2\n- Key point 3`,
  };
}
