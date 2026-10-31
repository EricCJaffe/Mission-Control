import { supabaseServer } from "@/lib/supabase/server";
import DecisionsInbox from "@/components/decisions/DecisionsInbox";
import { sortOpen, type DecisionCardRow } from "@/lib/decisions/answer";

export const dynamic = "force-dynamic";

const BASE_COLUMNS =
  "id,kind,for_agent,title,context,options,default_option,urgency,deadline,status,answer,answer_text,answered_at,created_at,delivered_at,delivery_error";
// Each later migration adds columns. Between a merge and its migration being
// applied the select fails, so the page steps back to the previous list
// rather than showing an empty board.
const COLUMN_SETS = [
  `${BASE_COLUMNS},pr_ref,next_step,group_name,closed_reason,section,added_at,completed_at`,
  `${BASE_COLUMNS},pr_ref,next_step,group_name`,
  `${BASE_COLUMNS},pr_ref,next_step`,
  BASE_COLUMNS,
];

/** Completed shows the last week, newest first. */
const COMPLETED_DAYS = 7;
const completedSince = () => new Date(Date.now() - COMPLETED_DAYS * 86_400_000).toISOString();

/*
 * The Decisions board: Decisions needed, Stalled (ours, 3+ days), Waiting on
 * others, Completed (7 days). One table, mission.decisions, fed every five
 * minutes by scripts/sync/decisions-inbox.ts from the brain (decision notes,
 * stalled jobs, open/triage-open.tsv and triage-closed.tsv). The page is
 * fixed; the rows change, and the board updates live (Realtime, with a poll
 * fallback) without a deploy. Eric, 2026-10-31: "Ideally the coding in the
 * page stays solid but the entries change based on sql table updates."
 * docs/decisions-inbox.md.
 */
export default async function DecisionsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const since = completedSince();
  const load = (columns: string) =>
    Promise.all([
      supabase.from("decisions").select(columns).eq("user_id", user.id).in("status", ["open", "stale"]).limit(600),
      supabase
        .from("decisions")
        .select(columns)
        .eq("user_id", user.id)
        .eq("status", "answered")
        .gte("answered_at", since)
        .order("answered_at", { ascending: false })
        .limit(100),
    ]);

  let columns = COLUMN_SETS[0];
  let [openRes, answeredRes] = await load(columns);
  for (const next of COLUMN_SETS.slice(1)) {
    if (!openRes.error && !answeredRes.error) break;
    columns = next;
    [openRes, answeredRes] = await load(columns);
  }
  // Closed elsewhere (a loop closed in triage, a note closed): needs completed_at.
  const closedRes = columns.includes("completed_at")
    ? await supabase
        .from("decisions")
        .select(columns)
        .eq("user_id", user.id)
        .eq("status", "withdrawn")
        .gte("completed_at", since)
        .order("completed_at", { ascending: false })
        .limit(150)
    : { data: [] };

  const open = sortOpen((openRes.data ?? []) as unknown as DecisionCardRow[]);
  const completed = [
    ...((answeredRes.data ?? []) as unknown as DecisionCardRow[]),
    ...((closedRes.data ?? []) as unknown as DecisionCardRow[]),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <DecisionsInbox open={open} completed={completed} unavailable={Boolean(openRes.error)} />
    </main>
  );
}
