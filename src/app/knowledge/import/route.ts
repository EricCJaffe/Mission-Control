import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { promises as fs } from "fs";
import path from "path";

function titleFromFilename(filename: string) {
  const base = filename.replace(/\.md$/i, "");
  const parts = base.split("-");
  if (parts.length <= 1) return base;
  return parts.slice(1).join(" ").trim() || base;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const notesDir = path.join(process.cwd(), "vault", "notes");

  let files: string[] = [];
  try {
    files = await fs.readdir(notesDir);
  } catch {
    return NextResponse.redirect(new URL("/knowledge", req.url));
  }

  const markdownFiles = files.filter((file) => file.endsWith(".md"));

  for (const file of markdownFiles) {
    const content = await fs.readFile(path.join(notesDir, file), "utf8");
    const title = titleFromFilename(file);
    await supabase.from("notes").insert({
      user_id: user.id,
      title: title || "Imported Note",
      content_md: content,
      tags: ["imported"],
    });
  }

  return NextResponse.redirect(new URL("/notes", req.url));
}
