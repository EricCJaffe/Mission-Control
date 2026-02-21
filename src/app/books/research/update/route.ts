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
  const noteId = String(form.get("note_id") || "").trim();
  const title = String(form.get("title") || "").trim();
  const tagsInput = String(form.get("tags") || "").trim();
  const contentMd = String(form.get("content_md") || "");
  const scopeType = String(form.get("scope_type") || "").trim();
  const scopeId = String(form.get("scope_id") || "").trim();
  const redirect = String(form.get("redirect") || "").trim();

  if (!noteId || !title) {
    return NextResponse.redirect(new URL(redirect || "/books", req.url));
  }

  await supabase
    .from("research_notes")
    .update({
      title,
      content_md: contentMd,
      tags: tagsInput ? parseTags(tagsInput) : [],
      scope_type: scopeType || undefined,
      scope_id: scopeId || undefined,
    })
    .eq("id", noteId)
    .eq("org_id", user.id);

  return NextResponse.redirect(new URL(redirect || "/books", req.url));
}
