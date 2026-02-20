import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { promises as fs } from "fs";
import path from "path";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const [personaResult, soulResult, notesResult] = await Promise.all([
    supabase
      .from("notes")
      .select("id,title,content_md")
      .eq("title", "persona")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notes")
      .select("id,title,content_md")
      .eq("title", "soul")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notes")
      .select("id,title,content_md,tags,updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  const personaContent = personaResult.data?.content_md || "# Persona\n\n";
  const soulContent = soulResult.data?.content_md || "# Soul\n\n";

  const vaultRoot = path.join(process.cwd(), "vault");
  const notesDir = path.join(vaultRoot, "notes");
  const knowledgeDir = path.join(vaultRoot, "knowledge");

  await fs.mkdir(notesDir, { recursive: true });
  await fs.mkdir(knowledgeDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(knowledgeDir, "persona.md"), personaContent, "utf8"),
    fs.writeFile(path.join(knowledgeDir, "soul.md"), soulContent, "utf8"),
  ]);

  const notes = notesResult.data || [];
  const filteredNotes = notes.filter(
    (note) => note.title !== "persona" && note.title !== "soul"
  );

  await Promise.all(
    filteredNotes.map(async (note) => {
      const titleSlug = slugify(note.title || "note");
      const filename = `${note.id}-${titleSlug || "note"}.md`;
      const body = note.content_md || "";
      await fs.writeFile(path.join(notesDir, filename), body, "utf8");
    })
  );

  return NextResponse.redirect(new URL("/knowledge", req.url));
}
