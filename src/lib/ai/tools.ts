import { supabaseServer } from "@/lib/supabase/server";
import { chunkMarkdown, upsertChapterChunks } from "@/lib/ai/chunking";
import { embedTexts } from "@/lib/ai/embeddings";

export async function retrieveContext(scopeType: string, scopeId: string, query?: string) {
  const supabase = await supabaseServer();
  let semanticMatches: any[] = [];
  if (query && process.env.OPENAI_API_KEY) {
    try {
      const [queryEmbedding] = await embedTexts([query]);
      if (queryEmbedding) {
        if (scopeType === "chapter") {
          const { data } = await supabase.rpc("match_chapter_chunks", {
            query_embedding: queryEmbedding,
            match_count: 6,
            match_threshold: 0.2,
            in_chapter_id: scopeId,
            in_book_id: null,
          });
          semanticMatches = data || [];
        }
        if (scopeType === "book") {
          const { data } = await supabase.rpc("match_chapter_chunks", {
            query_embedding: queryEmbedding,
            match_count: 8,
            match_threshold: 0.2,
            in_chapter_id: null,
            in_book_id: scopeId,
          });
          semanticMatches = data || [];
        }
      }
    } catch {
      semanticMatches = [];
    }
  }
  if (scopeType === "chapter") {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id,title,markdown_current")
      .eq("id", scopeId)
      .single();
    return { scopeType, scopeId, query, chapter, semanticMatches };
  }
  if (scopeType === "book") {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id,title,markdown_current,position")
      .eq("book_id", scopeId)
      .order("position", { ascending: true });
    return { scopeType, scopeId, query, chapters, semanticMatches };
  }
  return { scopeType, scopeId, query, semanticMatches, data: null };
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

  const current = chapter.markdown_current || "";
  let merged = `${current}\n\n${patch}`.trim();

  function tryParseJson(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  let parsed: any = null;
  if (patch.trim().startsWith("{")) {
    parsed = tryParseJson(patch.trim());
  }
  if (!parsed) {
    const fenced = patch.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) parsed = tryParseJson(fenced[1].trim());
  }

  if (parsed && typeof parsed === "object") {
    if (typeof parsed.markdown === "string") {
      merged = parsed.markdown.trim();
    } else if (parsed.replace) {
      const from = String(parsed.replace.from || "");
      const to = String(parsed.replace.to || "");
      if (from && to) {
        merged = current.replace(from, to);
      }
    } else if (typeof parsed.replace_from === "string" && typeof parsed.replace_to === "string") {
      merged = current.replace(parsed.replace_from, parsed.replace_to);
    }
  }

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
