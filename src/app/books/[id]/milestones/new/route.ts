import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const title = String(form.get("title") || "").trim();
  const dueDate = String(form.get("due_date") || "").trim();

  if (!bookId || !title) return NextResponse.redirect(new URL(`/books/${bookId}?tab=timeline`, req.url));

  await supabase.from("book_milestones").insert({
    book_id: bookId,
    org_id: user.id,
    title,
    due_date: dueDate || null,
  });

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=timeline`, req.url));
}
