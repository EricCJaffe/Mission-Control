import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(url, key);

function safeName(input) {
  return String(input || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const baseDir = path.join(process.cwd(), "vault", "backups", stamp);

await fs.mkdir(baseDir, { recursive: true });

const { data: books, error: bookErr } = await supabase
  .from("books")
  .select("id,title,description,created_at")
  .order("created_at", { ascending: false });

if (bookErr) {
  console.error(bookErr);
  process.exit(1);
}

for (const book of books || []) {
  const bookDir = path.join(baseDir, `${safeName(book.title)}-${book.id}`);
  await fs.mkdir(bookDir, { recursive: true });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,position,markdown_current")
    .eq("book_id", book.id)
    .order("position", { ascending: true });

  const indexLines = [
    `# ${book.title || "Untitled Book"}`,
    "",
    `ID: ${book.id}`,
    `Created: ${book.created_at}`,
    "",
    book.description || "",
    "",
    "## Chapters",
    "",
  ];

  for (const [idx, chapter] of (chapters || []).entries()) {
    const number = idx + 1;
    const title = chapter.title || `Chapter ${number}`;
    const filename = `${String(number).padStart(2, "0")}-${safeName(title)}-${chapter.id}.md`;
    indexLines.push(`${number}. ${title} (${filename})`);
    const content = `# Chapter ${number}: ${title}\n\n${chapter.markdown_current || ""}\n`;
    await fs.writeFile(path.join(bookDir, filename), content, "utf8");
  }

  await fs.writeFile(path.join(bookDir, "README.md"), indexLines.join("\n"), "utf8");
}

console.log(`Backup complete: ${baseDir}`);
