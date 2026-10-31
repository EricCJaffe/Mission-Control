import { supabaseServer } from "@/lib/supabase/server";
import DecisionsInbox from "@/components/decisions/DecisionsInbox";
import { sortOpen, type DecisionCardRow } from "@/lib/decisions/answer";

export const dynamic = "force-dynamic";

const BASE_COLUMNS =
  "id,kind,for_agent,title,context,options,default_option,urgency,deadline,status,answer,answer_text,answered_at,created_at,delivered_at,delivery_error";
// From 20261031 decisions_actionable. Between the merge and that migration
// being applied the select fails, so the page falls back to BASE_COLUMNS
// rather than showing an empty inbox.
const COLUMNS = `${BASE_COLUMNS},pr_ref,next_step,group_name`;

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
  const load = (columns: string) =>
    Promise.all([
      supabase.from("decisions").select(columns).eq("user_id", userData.user!.id).in("status", ["open", "stale"]).limit(200),
      supabase
        .from("decisions")
        .select(columns)
        .eq("user_id", userData.user!.id)
        .eq("status", "answered")
        .gte("answered_at", since)
        .order("answered_at", { ascending: false })
        .limit(30),
    ]);
  let [openRes, doneRes] = await load(COLUMNS);
  // group_name arrives with 20261031 decisions_loops; before it, the round-two columns.
  if (openRes.error || doneRes.error) [openRes, doneRes] = await load(`${BASE_COLUMNS},pr_ref,next_step`);
  if (openRes.error || doneRes.error) [openRes, doneRes] = await load(BASE_COLUMNS);

  const open = sortOpen((openRes.data ?? []) as unknown as DecisionCardRow[]);
  const answered = (doneRes.data ?? []) as unknown as DecisionCardRow[];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <DecisionsInbox open={open} answered={answered} unavailable={Boolean(openRes.error)} />
    </main>
  );
}
