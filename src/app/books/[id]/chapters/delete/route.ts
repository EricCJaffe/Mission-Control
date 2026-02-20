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
    .select("book_id")
    .eq("id", chapterId)
    .single();

  if (!chapter) return NextResponse.redirect(new URL(req.url).origin);

  await supabase.from("chapters").delete().eq("id", chapterId);

  return NextResponse.redirect(new URL(`/books/${chapter.book_id}`, req.url));
}
