import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseQuestion } from "@/lib/decisions/question";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * "Ask a question" on a /decisions card. Signed-in owner only, through his own
 * session: RLS lets him insert (decision_id, question) on his own decision and
 * nothing else. The box script (scripts/sync/decisions-inbox.ts) turns it into
 * a `kind: question` note for Chief of Staff and rings the doorbell within five
 * minutes. The card stays open; asking is not answering.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = parseQuestion(raw);
  if (!parsed.ok) {
    const msg = parsed.error === "health" ? "Leave health details out: this question is written to the bots' notes" : "Write a question (up to 1,000 characters)";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data: row, error: readErr } = await supabase
    .from("decisions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "Could not read the decision" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  const { error } = await supabase.from("decision_questions").insert({ decision_id: id, question: parsed.question });
  if (error) return NextResponse.json({ error: "Could not send the question" }, { status: 500 });
  return NextResponse.json({ ok: true, question: parsed.question });
}
