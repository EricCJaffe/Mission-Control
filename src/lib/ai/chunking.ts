export type Chunk = {
  chunk_index: number;
  heading_path: string | null;
  content: string;
  token_count: number;
  metadata: Record<string, unknown>;
};

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;

export function chunkMarkdown(markdown: string, maxChars = 2000): Chunk[] {
  const lines = markdown.split("\n");
  const chunks: Chunk[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (buffer.length === 0) return;
    const content = buffer.join("\n").trim();
    if (!content) {
      buffer = [];
      return;
    }

    if (content.length <= maxChars) {
      chunks.push({
        chunk_index: chunks.length,
        heading_path: currentHeading,
        content,
        token_count: content.split(/\s+/).length,
        metadata: { length: content.length },
      });
    } else {
      const parts = content.split(/\n\n+/);
      let temp = "";
      for (const part of parts) {
        if ((temp + part).length > maxChars) {
          if (temp) {
            chunks.push({
              chunk_index: chunks.length,
              heading_path: currentHeading,
              content: temp.trim(),
              token_count: temp.split(/\s+/).length,
              metadata: { length: temp.length, split: true },
            });
            temp = "";
          }
        }
        temp += `${part}\n\n`;
      }
      if (temp.trim()) {
        chunks.push({
          chunk_index: chunks.length,
          heading_path: currentHeading,
          content: temp.trim(),
          token_count: temp.split(/\s+/).length,
          metadata: { length: temp.length, split: true },
        });
      }
    }

    buffer = [];
  }

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      currentHeading = match[2].trim();
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }

  flush();

  if (chunks.length === 0 && markdown.trim()) {
    chunks.push({
      chunk_index: 0,
      heading_path: null,
      content: markdown.trim(),
      token_count: markdown.trim().split(/\s+/).length,
      metadata: { length: markdown.length },
    });
  }

  return chunks;
}

export async function upsertChapterChunks(
  supabase: any,
  chapterId: string,
  orgId: string,
  chunks: Chunk[]
) {
  await supabase.from("chapter_chunks").delete().eq("chapter_id", chapterId);

  if (chunks.length === 0) return;

  await supabase.from("chapter_chunks").insert(
    chunks.map((chunk, idx) => ({
      chapter_id: chapterId,
      org_id: orgId,
      chunk_index: idx,
      heading_path: chunk.heading_path,
      content: chunk.content,
      token_count: chunk.token_count,
      embedding: null,
      metadata: chunk.metadata,
    }))
  );
}

export async function enqueueEmbeddingJob(_chapterId: string) {
  // Placeholder for async embedding pipeline
  return { ok: true };
}

export function extractHeadings(markdown: string) {
  const headings: { level: number; text: string }[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(HEADING_REGEX);
  while ((match = regex.exec(markdown)) !== null) {
    headings.push({ level: match[1].length, text: match[2] });
  }
  return headings;
}
