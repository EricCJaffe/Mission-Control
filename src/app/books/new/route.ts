import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const targetWordCountRaw = String(form.get("target_word_count") || "").trim();
  const targetWordCount = targetWordCountRaw ? Number(targetWordCountRaw) : null;

  if (!title) return NextResponse.redirect(new URL("/books", req.url));

  const { data: inserted } = await supabase
    .from("books")
    .insert({
      org_id: user.id,
      created_by: user.id,
      title,
      description: description || null,
      status: "planning",
      target_word_count: Number.isFinite(targetWordCount) ? targetWordCount : null,
    })
    .select("id")
    .single();

  if (inserted?.id) {
    return NextResponse.redirect(new URL(`/books/${inserted.id}`, req.url));
  }

  return NextResponse.redirect(new URL("/books", req.url));
}
