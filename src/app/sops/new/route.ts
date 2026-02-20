import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const contentMd = String(form.get("content_md") || "");

  if (!title) return NextResponse.redirect(new URL("/sops", req.url));

  await supabase.from("sop_docs").insert({
    user_id: user.id,
    title,
    content_md: contentMd,
  });

  return NextResponse.redirect(new URL("/sops", req.url));
}
