import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripChapterPrefix } from "@/lib/text";

// book_proposals.payload is jsonb written by the AI proposal flow; every field
// is read defensively below, so these say what may be there, not what is.
type TocItem = { id?: string; title?: string };
type ReorderPayload = { ordered_ids?: string[]; toc?: TocItem[] };
type MergePayload = { source_id?: string; target_id?: string; merged_markdown?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const proposalId = String(form.get("proposal_id") || "").trim();
  const redirectTo = String(form.get("redirect") || "").trim();

  if (!proposalId) return NextResponse.redirect(new URL(redirectTo || "/books", req.url));

  const { data: proposal } = await supabase
    .from("book_proposals")
    .select("id,book_id,proposal_type,payload")
    .eq("id", proposalId)
    .eq("org_id", user.id)
    .single();

  if (!proposal) return NextResponse.redirect(new URL(redirectTo || "/books", req.url));

  if (proposal.proposal_type === "reorder") {
    const reorder = (proposal.payload ?? {}) as ReorderPayload;
    const orderedIds: string[] = Array.isArray(reorder.ordered_ids) ? reorder.ordered_ids : [];
    const toc: TocItem[] = Array.isArray(reorder.toc) ? reorder.toc : [];

    if (orderedIds.length > 0) {
      const { data: chapters } = await supabase
        .from("chapters")
        .select("id,title")
        .in("id", orderedIds);

      const titleMap = new Map((chapters || []).map((ch) => [ch.id, ch.title]));
      const tocMap = new Map(
        toc
          .filter((item) => item?.id)
          .map((item) => [item.id as string, stripChapterPrefix(item.title || "")])
      );

      const updates = orderedIds.map((id: string, idx: number) => {
        const currentTitle = titleMap.get(id) || "";
        const suggestedTitle = tocMap.get(id);
        const cleanedTitle = stripChapterPrefix(currentTitle);
        const payload: Record<string, unknown> = { position: idx + 1 };
        if (suggestedTitle) payload.title = suggestedTitle;
        else if (cleanedTitle !== currentTitle) payload.title = cleanedTitle;
        return supabase.from("chapters").update(payload).eq("id", id);
      });

      await Promise.all(updates);
    }
  }

  if (proposal.proposal_type === "merge") {
    const payload = (proposal.payload ?? {}) as MergePayload;
    const sourceId = String(payload?.source_id || "");
    const targetId = String(payload?.target_id || "");
    const mergedMarkdown = String(payload?.merged_markdown || "");

    if (sourceId && targetId && mergedMarkdown) {
      await supabase
        .from("chapters")
        .update({ markdown_current: mergedMarkdown })
        .eq("id", targetId);

      await supabase
        .from("chapters")
        .update({ status: "archive", position: null })
        .eq("id", sourceId);
    }
  }

  await supabase
    .from("book_proposals")
    .update({ status: "applied" })
    .eq("id", proposalId)
    .eq("org_id", user.id);

  return NextResponse.redirect(new URL(redirectTo || `/books/${proposal.book_id}?tab=outline`, req.url));
}
