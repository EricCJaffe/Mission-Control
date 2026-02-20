import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function parseTags(input: string) {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const tagsInput = String(form.get("tags") || "").trim();
  const tags = tagsInput ? parseTags(tagsInput) : [];

  if (!title) return NextResponse.redirect(new URL("/notes", req.url));

  const { data: inserted } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title,
      tags,
      content_md: "",
    })
    .select("id")
    .single();

  if (inserted?.id) {
    return NextResponse.redirect(new URL(`/notes/${inserted.id}`, req.url));
  }

  return NextResponse.redirect(new URL("/notes", req.url));
}
