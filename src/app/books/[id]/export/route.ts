import { NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "zip";

  const { data: book } = await supabase
    .from("books")
    .select("id,title")
    .eq("id", params.id)
    .single();

  if (!book) return NextResponse.redirect(new URL("/books", req.url));

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,position,markdown_current")
    .eq("book_id", params.id)
    .order("position", { ascending: true });

  const safeTitle = slugify(book.title) || "book";

  if (format === "md") {
    const combined = (chapters || [])
      .map((ch) => `# ${ch.title}\n\n${ch.markdown_current || ""}`)
      .join("\n\n");

    return new Response(combined, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename=\"${safeTitle}.md\"`,
      },
    });
  }

  const zip = new JSZip();
  (chapters || []).forEach((ch, idx) => {
    const name = `${String(idx + 1).padStart(2, "0")}-${slugify(ch.title) || "chapter"}.md`;
    zip.file(name, `# ${ch.title}\n\n${ch.markdown_current || ""}`);
  });

  const blob = await zip.generateAsync({ type: "nodebuffer" });

  return new Response(blob, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${safeTitle}.zip\"`,
    },
  });
}
