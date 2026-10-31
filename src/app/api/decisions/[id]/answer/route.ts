import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseAnswer, type DecisionOption } from "@/lib/decisions/answer";
import { LINK_ERROR_TEXT, verifyLinkToken } from "@/lib/decisions/link-token";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * One tap on /decisions.
 *
 * Signed-in user only, through his own session. RLS and the column grants in
 * the migration let him set answer, answer_text, status and answered_at on
 * his own open or stale row, once; nothing else, and no service-role key or
 * GitHub token lives in Vercel. The box script (scripts/sync/
 * decisions-inbox.ts) writes the `kind: answer` note to the brain, rings
 * Chief of Staff's doorbell and stamps delivered_at within five minutes.
 *
 * A tap from the email digest (/decisions/a/[token]) sends its link token as
 * well. The session is still what authorizes the answer; the token only has
 * to name this decision and this option and be unexpired, so a link cannot be
 * bent to answer anything else (src/lib/decisions/link-token.ts).
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

  const { data: row, error: readErr } = await supabase
    .from("decisions")
    .select("id, status, options")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "Could not read the decision" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  if (row.status !== "open" && row.status !== "stale") {
    return NextResponse.json({ error: row.status === "answered" ? "Already answered" : "No longer open" }, { status: 409 });
  }

  const parsed = parseAnswer(raw, (row.options ?? []) as DecisionOption[]);
  if (!parsed.ok) {
    const msg = parsed.error === "health" ? "Leave health details out: this answer is written to the bots' notes" : `Bad ${parsed.error}`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const token = (raw as Record<string, unknown>).token;
  if (token !== undefined) {
    const link = verifyLinkToken(token, process.env.DECISIONS_LINK_SECRET);
    if (!link.ok) return NextResponse.json({ error: LINK_ERROR_TEXT[link.error] }, { status: link.error === "expired" ? 410 : 403 });
    if (link.claims.id !== id.toLowerCase() || link.claims.answer !== parsed.value.answer) {
      return NextResponse.json({ error: LINK_ERROR_TEXT.mismatch }, { status: 403 });
    }
  }

  const answeredAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("decisions")
    .update({ ...parsed.value, status: "answered", answered_at: answeredAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["open", "stale"])
    .is("answered_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: "Could not record the answer" }, { status: 500 });
  // Zero rows: answered in another tab a moment ago, or withdrawn meanwhile.
  if (!updated || updated.length === 0) return NextResponse.json({ error: "Already answered" }, { status: 409 });

  return NextResponse.json({ ok: true, id, answer: parsed.value.answer, answer_text: parsed.value.answer_text, answered_at: answeredAt });
}
