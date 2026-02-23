import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const redirectTo = String(form.get("redirect") || "").trim();
  const proposalIds = (form.getAll("proposal_ids") || []).map((id) => String(id).trim()).filter(Boolean);

  if (proposalIds.length === 0) {
    return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
  }

  await supabase.from("chapter_proposals").update({ status: "rejected" }).in("id", proposalIds);

  return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
}
