import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: note, error } = await supabase
    .from("notes")
    .select("id,title,content_md")
    .eq("id", id)
    .single();

  if (error || !note) {
    return new Response("Note not found.", { status: 404 });
  }

  const safeTitle = note.title ? toSlug(note.title) : "";
  const filename = `${note.id}-${safeTitle || "note"}.md`;
  const vaultDir = path.join(process.cwd(), "vault", "notes");
  await fs.mkdir(vaultDir, { recursive: true });
  await fs.writeFile(path.join(vaultDir, filename), note.content_md || "", "utf8");

  return NextResponse.redirect(new URL(`/notes/${note.id}`, req.url));
}
