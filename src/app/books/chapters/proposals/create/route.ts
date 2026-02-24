import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const chapterId = String(body.chapter_id || "").trim();
  const proposedMarkdown = String(body.proposed_markdown || "").trim();
  const instruction = String(body.instruction || "Section rewrite");

  if (!chapterId || !proposedMarkdown) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const { error } = await supabase.from("chapter_proposals").insert({
    chapter_id: chapterId,
    org_id: user.id,
    instruction,
    proposed_markdown: proposedMarkdown,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message || "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
