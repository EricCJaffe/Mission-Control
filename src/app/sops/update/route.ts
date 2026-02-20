import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  const title = String(form.get("title") || "").trim();
  const contentMd = String(form.get("content_md") || "");
  const status = String(form.get("status") || "active").trim();

  if (!id || !title) return NextResponse.redirect(new URL("/sops", req.url));

  await supabase.from("sop_docs").update({
    title,
    content_md: contentMd,
    status,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.redirect(new URL(`/sops/${id}`, req.url));
}
