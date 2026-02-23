import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripChapterPrefix } from "@/lib/text";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();

  if (!bookId) return NextResponse.redirect(new URL("/books", req.url));

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title")
    .eq("book_id", bookId);

  const updates = (chapters || []).map((ch) => {
    const cleaned = stripChapterPrefix(ch.title || "");
    if (!cleaned || cleaned === ch.title) return null;
    return supabase.from("chapters").update({ title: cleaned }).eq("id", ch.id);
  }).filter(Boolean);

  if (updates.length > 0) {
    await Promise.all(updates as Promise<unknown>[]);
  }

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
