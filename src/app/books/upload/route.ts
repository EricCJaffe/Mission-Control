import path from "path";
import { NextResponse } from "next/server";
import * as mammoth from "mammoth";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function splitByHeading(markdown: string) {
  const lines = markdown.split("\n");
  const chapters: { title: string; content: string }[] = [];
  let currentTitle = "";
  let buffer: string[] = [];
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)/);
    if (match) {
      if (currentTitle || buffer.length) {
        chapters.push({
          title: currentTitle || "Untitled Chapter",
          content: buffer.join("\n").trim(),
        });
        buffer = [];
      }
      currentTitle = match[1].trim();
    } else {
      buffer.push(line);
    }
  }
  if (currentTitle || buffer.length) {
    chapters.push({
      title: currentTitle || "Untitled Chapter",
      content: buffer.join("\n").trim(),
    });
  }
  return chapters.filter((ch) => ch.title || ch.content);
}

async function ensureHeadings(markdown: string) {
  const attempt = splitByHeading(markdown);
  if (attempt.length > 0) return { markdown, chapters: attempt };

  const aiPrompt = [
    "Insert top-level chapter headings using '# ' so the manuscript can be split into chapters.",
    "Preserve all content. Only add headings; do not delete text.",
    "Return markdown only.",
  ].join("\n");

  let aiMarkdown = markdown;
  try {
    aiMarkdown = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      system: "You are a careful book editor preparing a manuscript for chapterization.",
      user: `${aiPrompt}\n\nMANUSCRIPT:\n${markdown.slice(0, 12000)}`,
    });
  } catch {
    return { markdown, chapters: attempt };
  }

  const chapters = splitByHeading(aiMarkdown);
  if (chapters.length === 0) {
    return {
      markdown,
      chapters: [{ title: "Chapter 1", content: markdown }],
    };
  }

  return { markdown: aiMarkdown, chapters };
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const file = form.get("file");
  const titleInput = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const targetWordCountRaw = String(form.get("target_word_count") || "").trim();
  const targetWordCount = targetWordCountRaw ? Number(targetWordCountRaw) : null;

  if (!file || !(file instanceof File)) {
    return NextResponse.redirect(new URL("/books", req.url));
  }

  if (file.size > 50 * 1024 * 1024) {
    return new Response("File too large (max 50MB).", { status: 413 });
  }

  const filename = file.name || "upload";
  const ext = path.extname(filename).toLowerCase();
  if (![".docx", ".md"].includes(ext)) {
    return new Response("Unsupported file type.", { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  let markdown = "";
  if (ext === ".docx") {
    const result = await mammoth.convertToMarkdown({ buffer: Buffer.from(arrayBuffer) });
    markdown = result.value || "";
  } else {
    markdown = Buffer.from(arrayBuffer).toString("utf8");
  }

  const bookTitle = titleInput || filename.replace(/\.[^/.]+$/, "") || "Untitled Book";

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      org_id: user.id,
      created_by: user.id,
      title: bookTitle,
      description: description || null,
      status: "planning",
      target_word_count: Number.isFinite(targetWordCount) ? targetWordCount : null,
    })
    .select("id")
    .single();

  if (bookError || !book) {
    return NextResponse.redirect(new URL("/books", req.url));
  }

  const storagePath = `${user.id}/${book.id}/${Date.now()}-${toSlug(filename) || "upload"}${ext}`;
  await supabase.storage.from("book_uploads").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  await supabase.from("book_uploads").insert({
    book_id: book.id,
    org_id: user.id,
    filename,
    storage_path: storagePath,
    mime_type: file.type,
    size_bytes: file.size,
  });

  const { chapters } = await ensureHeadings(markdown);
  const inserts = chapters.map((chapter, index) => ({
    book_id: book.id,
    org_id: user.id,
    title: chapter.title || `Chapter ${index + 1}`,
    slug: toSlug(chapter.title || `chapter-${index + 1}`) || `chapter-${index + 1}`,
    position: index + 1,
    status: "outline",
    summary: null,
    markdown_current: chapter.content || "",
    word_count: wordCount(chapter.content || ""),
  }));

  if (inserts.length > 0) {
    const { data: insertedChapters } = await supabase
      .from("chapters")
      .insert(inserts)
      .select("id,markdown_current");

    if (insertedChapters && insertedChapters.length > 0) {
      const versions = insertedChapters.map((ch) => ({
        chapter_id: ch.id,
        org_id: user.id,
        version_number: 1,
        markdown: ch.markdown_current || "",
        created_by: user.id,
      }));
      await supabase.from("chapter_versions").insert(versions);
    }
  }

  return NextResponse.redirect(new URL(`/books/${book.id}`, req.url));
}
