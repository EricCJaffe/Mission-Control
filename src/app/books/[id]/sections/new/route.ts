import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "");
  const title = String(form.get("title") || "").trim();
  const positionRaw = String(form.get("position") || "").trim();
  const position = positionRaw ? Number(positionRaw) : 1;

  if (!bookId || !title) return NextResponse.redirect(new URL(`/books/${bookId}`, req.url));

  await supabase.from("chapter_sections").insert({
    book_id: bookId,
    org_id: user.id,
    title,
    position: Number.isFinite(position) ? position : 1,
  });

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
