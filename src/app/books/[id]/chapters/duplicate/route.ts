import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const chapterId = String(form.get("chapter_id") || "").trim();
  if (!chapterId) return NextResponse.redirect(new URL(req.url).origin);

  const { data: chapter } = await supabase
    .from("chapters")
    .select("book_id,title,slug,status,summary,markdown_current,position")
    .eq("id", chapterId)
    .single();

  if (!chapter) return NextResponse.redirect(new URL(req.url).origin);

  const { data: last } = await supabase
    .from("chapters")
    .select("position")
    .eq("book_id", chapter.book_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (last?.position ?? 0) + 1;

  await supabase.from("chapters").insert({
    book_id: chapter.book_id,
    org_id: user.id,
    title: `${chapter.title} (Copy)`,
    slug: `${chapter.slug}-copy`,
    position,
    status: chapter.status,
    summary: chapter.summary,
    markdown_current: chapter.markdown_current,
  });

  return NextResponse.redirect(new URL(`/books/${chapter.book_id}`, req.url));
}
