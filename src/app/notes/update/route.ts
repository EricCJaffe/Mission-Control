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
  const id = String(form.get("id") || "").trim();
  if (!id) return NextResponse.redirect(new URL("/notes", req.url));

  const title = String(form.get("title") || "").trim();
  const content = String(form.get("content") || "");
  const tagsInput = String(form.get("tags") || "").trim();
  const tags = tagsInput ? parseTags(tagsInput) : [];

  await supabase
    .from("notes")
    .update({
      title,
      content_md: content,
      tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.redirect(new URL(`/notes/${id}`, req.url));
}
