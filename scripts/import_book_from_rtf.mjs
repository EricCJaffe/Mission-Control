import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function wordCount(markdown) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function parseTodoSection(markdown) {
  const marker = "Items to Circle Back On";
  const idx = markdown.indexOf(marker);
  if (idx === -1) return [];
  const section = markdown.slice(idx);
  const lines = section.split("\n");
  const items = [];
  let current = null;
  for (const line of lines.slice(1)) {
    const raw = line.trim();
    if (!raw) continue;
    const match = raw.match(/^(\d+)\.\s*(.+)/);
    if (match) {
      if (current) items.push(current);
      current = { title: match[2].trim(), details: [] };
    } else if (current) {
      current.details.push(raw);
    }
  }
  if (current) items.push(current);
  return items.map((item) => ({
    title: item.title.replace(/\*\*/g, "").trim(),
    details: item.details.join(" ").trim(),
  }));
}

function parseChapters(markdown) {
  const parts = markdown.split(/^##\s+/m);
  const chapters = [];
  for (const part of parts.slice(1)) {
    const [titleLine, ...rest] = part.split("\n");
    const title = titleLine.trim();
    const content = rest.join("\n").trim();
    if (!title) continue;
    if (title.toLowerCase().startsWith("todo section")) continue;
    chapters.push({
      title,
      markdown: `# ${title}\n\n${content}\n`,
    });
  }
  return chapters;
}

function extractTitle(markdown) {
  const lines = markdown.split("\n").map((line) => line.trim());
  const titleIndex = lines.indexOf("# Main Title:");
  const subtitleIndex = lines.indexOf("#Subtitle:");
  const title = titleIndex !== -1 ? lines[titleIndex + 1]?.trim() : "";
  const subtitle = subtitleIndex !== -1 ? lines[subtitleIndex + 1]?.trim() : "";
  return { title, subtitle };
}

async function findUserIdByEmail(supabase, email) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function main() {
  const filePath = process.argv[2];
  const email = process.argv[3] || "ejaffejax@gmail.com";
  if (!filePath) {
    console.error("Usage: node scripts/import_book_from_rtf.mjs <path-to-rtf> [email]");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  const markdown = execFileSync("textutil", ["-convert", "txt", "-stdout", filePath], {
    encoding: "utf8",
  });

  const { title, subtitle } = extractTitle(markdown);
  if (!title) {
    console.error("Could not extract title from RTF.");
    process.exit(1);
  }

  const chapters = parseChapters(markdown);
  const todos = parseTodoSection(markdown);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const userId = await findUserIdByEmail(supabase, email);
  if (!userId) {
    console.error("User not found for email:", email);
    process.exit(1);
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      org_id: userId,
      created_by: userId,
      title,
      description: subtitle || null,
      status: "planning",
    })
    .select("id")
    .single();

  if (bookError || !book?.id) {
    console.error("Failed to create book:", bookError?.message || "unknown error");
    process.exit(1);
  }

  const chapterInserts = chapters.map((chapter, idx) => ({
    book_id: book.id,
    org_id: userId,
    title: chapter.title,
    slug: slugify(chapter.title) || `chapter-${idx + 1}`,
    position: idx + 1,
    status: "draft",
    summary: null,
    markdown_current: chapter.markdown,
    word_count: wordCount(chapter.markdown),
  }));

  const { data: insertedChapters, error: chaptersError } = await supabase
    .from("chapters")
    .insert(chapterInserts)
    .select("id,markdown_current");

  if (chaptersError) {
    console.error("Failed to create chapters:", chaptersError.message);
    process.exit(1);
  }

  if (insertedChapters?.length) {
    const versionInserts = insertedChapters.map((ch) => ({
      chapter_id: ch.id,
      org_id: userId,
      version_number: 1,
      markdown: ch.markdown_current || "",
      created_by: userId,
    }));
    await supabase.from("chapter_versions").insert(versionInserts);
  }

  if (todos.length) {
    const taskInserts = todos.map((todo) => ({
      user_id: userId,
      title: todo.title,
      status: "open",
      category: "Writing / Content",
      why: todo.details || null,
      book_id: book.id,
    }));
    await supabase.from("tasks").insert(taskInserts);
  }

  console.log(`Imported book: ${title} (${chapters.length} chapters, ${todos.length} tasks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
