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
  const redirectTo = String(form.get("redirect") || "").trim();
  const proposalIds = (form.getAll("proposal_ids") || []).map((id) => String(id).trim()).filter(Boolean);

  if (proposalIds.length === 0) {
    return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
  }

  const { data: proposals } = await supabase
    .from("chapter_proposals")
    .select("id,chapter_id,proposed_markdown")
    .in("id", proposalIds)
    .eq("status", "pending");

  if (!proposals || proposals.length === 0) {
    return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
  }

  const chapterIds = proposals.map((p) => p.chapter_id);
  const now = new Date().toISOString();
  for (const proposal of proposals) {
    if (!proposal.proposed_markdown) continue;
    const { data: latestVersion } = await supabase
      .from("chapter_versions")
      .select("version_number")
      .eq("chapter_id", proposal.chapter_id)
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
        updated_at: now,
      })
      .eq("id", proposal.chapter_id);

    await supabase.from("chapter_versions").insert({
      chapter_id: proposal.chapter_id,
      org_id: user.id,
      version_number: nextVersion,
      markdown: updatedMarkdown,
      created_by: user.id,
    });

    await supabase
      .from("chapter_proposals")
      .update({ status: "applied" })
      .eq("id", proposal.id);
  }

  return NextResponse.redirect(new URL(redirectTo || req.headers.get("referer") || "/", req.url));
}
