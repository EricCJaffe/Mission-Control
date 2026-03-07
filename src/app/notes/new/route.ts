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
  const status = String(form.get("status") || "inbox").trim();
  const tagsInput = String(form.get("tags") || "").trim();
  const tags = tagsInput ? parseTags(tagsInput) : [];

  if (!title) return NextResponse.redirect(new URL("/notes", req.url));

  let inserted: { id: string } | null = null;
  const primary = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title,
      status: status || "inbox",
      tags,
      content_md: "",
    })
    .select("id")
    .single();

  if (primary.error?.message?.includes("column \"status\" of relation \"notes\" does not exist")) {
    const fallback = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        title,
        tags,
        content_md: "",
      })
      .select("id")
      .single();
    inserted = fallback.data;
  } else {
    inserted = primary.data;
  }

  if (inserted?.id) {
    return NextResponse.redirect(new URL(`/notes/${inserted.id}`, req.url));
  }

  return NextResponse.redirect(new URL("/notes", req.url));
}
