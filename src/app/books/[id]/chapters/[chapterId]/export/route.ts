import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: chapter } = await supabase
    .from("chapters")
    .select("title,markdown_current")
    .eq("id", chapterId)
    .single();

  if (!chapter) return NextResponse.redirect(new URL("/books", req.url));

  const safeTitle = slugify(chapter.title) || "chapter";
  const body = `# ${chapter.title}\n\n${chapter.markdown_current || ""}`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown",
      "Content-Disposition": `attachment; filename=\"${safeTitle}.md\"`,
    },
  });
}
