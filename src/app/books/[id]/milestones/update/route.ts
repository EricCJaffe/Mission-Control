import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  const bookId = String(form.get("book_id") || "").trim();
  const status = String(form.get("status") || "").trim();

  if (!id || !bookId) return NextResponse.redirect(new URL(`/books/${bookId}?tab=timeline`, req.url));

  await supabase
    .from("book_milestones")
    .update({
      status: status || "planned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=timeline`, req.url));
}
