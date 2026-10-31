import { supabaseServer } from "@/lib/supabase/server";
import DecisionsInbox from "@/components/decisions/DecisionsInbox";
import { sortOpen, type DecisionCardRow } from "@/lib/decisions/answer";

export const dynamic = "force-dynamic";

const COLUMNS =
  "id,kind,for_agent,title,context,options,default_option,urgency,deadline,status,answer,answer_text,answered_at,created_at,delivered_at,delivery_error,pr_ref,next_step";

/** Answered items stay visible this long (to see the bots picked them up), then drop off. */
const ANSWERED_SHOWN_HOURS = 24;
const answeredSince = () => new Date(Date.now() - ANSWERED_SHOWN_HOURS * 3_600_000).toISOString();

/*
 * The Decisions inbox: the one place Eric acts on decisions. Every open
 * decision waiting on him and every job stalled on him, one tap each, plus a
 * question box that goes to Chief of Staff. Eric, 2026-10-31: "An email that
 * I can't take action on though is kind of useless." Emails link here
 * (/decisions, and /decisions#d-<id> per item). Rows come from the brain
 * through scripts/sync/decisions-inbox.ts every five minutes; answers go back
 * the same way. docs/decisions-inbox.md.
 */
export default async function DecisionsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const since = answeredSince();
  const [openRes, doneRes] = await Promise.all([
    supabase.from("decisions").select(COLUMNS).eq("user_id", userData.user.id).in("status", ["open", "stale"]).limit(200),
    supabase
      .from("decisions")
      .select(COLUMNS)
      .eq("user_id", userData.user.id)
      .eq("status", "answered")
      .gte("answered_at", since)
      .order("answered_at", { ascending: false })
      .limit(30),
  ]);

  const open = sortOpen((openRes.data ?? []) as DecisionCardRow[]);
  const answered = (doneRes.data ?? []) as DecisionCardRow[];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <DecisionsInbox open={open} answered={answered} unavailable={Boolean(openRes.error)} />
    </main>
  );
}
