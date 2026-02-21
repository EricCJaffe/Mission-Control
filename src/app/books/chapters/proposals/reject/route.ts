import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const proposalId = String(form.get("proposal_id") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (!proposalId) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  await supabase.from("chapter_proposals").update({ status: "rejected" }).eq("id", proposalId);

  return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
}
