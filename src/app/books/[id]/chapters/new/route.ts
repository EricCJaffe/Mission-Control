import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const title = String(form.get("title") || "").trim();
  const summary = String(form.get("summary") || "").trim();
  const status = String(form.get("status") || "outline").trim();

  if (!bookId || !title) return NextResponse.redirect(new URL(`/books/${bookId}`, req.url));

  const { data: last } = await supabase
    .from("chapters")
    .select("position")
    .eq("book_id", bookId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (last?.position ?? 0) + 1;

  const { data: inserted } = await supabase
    .from("chapters")
    .insert({
      book_id: bookId,
      org_id: user.id,
      title,
      slug: slugify(title) || "chapter",
      position,
      status,
      summary: summary || null,
      markdown_current: "",
      word_count: 0,
    })
    .select("id")
    .single();

  if (inserted?.id) {
    return NextResponse.redirect(new URL(`/books/${bookId}/chapters/${inserted.id}`, req.url));
  }

  return NextResponse.redirect(new URL(`/books/${bookId}`, req.url));
}
