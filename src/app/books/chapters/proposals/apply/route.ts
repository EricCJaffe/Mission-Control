import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const proposalId = String(form.get("proposal_id") || "").trim();
  const chapterId = String(form.get("chapter_id") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (!proposalId || !chapterId) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  const { data: proposal } = await supabase
    .from("chapter_proposals")
    .select("proposed_markdown")
    .eq("id", proposalId)
    .single();

  if (!proposal?.proposed_markdown) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  const { data: latestVersion } = await supabase
    .from("chapter_versions")
    .select("version_number")
    .eq("chapter_id", chapterId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latestVersion?.version_number ?? 0) + 1;
  const updatedMarkdown = proposal.proposed_markdown;

  await supabase
    .from("chapters")
    .update({
      markdown_current: updatedMarkdown,
      word_count: wordCount(updatedMarkdown),
      updated_at: new Date().toISOString(),
    })
    .eq("id", chapterId);

  await supabase.from("chapter_versions").insert({
    chapter_id: chapterId,
    org_id: user.id,
    version_number: nextVersion,
    markdown: updatedMarkdown,
    created_by: user.id,
  });

  await supabase.from("chapter_proposals").update({ status: "applied" }).eq("id", proposalId);

  return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
}
