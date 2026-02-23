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
  const scopeType = String(form.get("scope_type") || "").trim();
  const scopeId = String(form.get("scope_id") || "").trim();
  const title = String(form.get("title") || "").trim();
  const tagsInput = String(form.get("tags") || "").trim();
  const contentMd = String(form.get("content_md") || "");
  const status = String(form.get("status") || "inbox").trim();
  const redirect = String(form.get("redirect") || "").trim();

  if (!scopeType || !scopeId || !title) {
    return NextResponse.redirect(new URL(redirect || `/books/${scopeId}`, req.url));
  }

  await supabase.from("research_notes").insert({
    scope_type: scopeType,
    scope_id: scopeId,
    org_id: user.id,
    title,
    content_md: contentMd,
    tags: tagsInput ? parseTags(tagsInput) : [],
    status: status || "inbox",
  });

  return NextResponse.redirect(new URL(redirect || `/books/${scopeId}`, req.url));
}
