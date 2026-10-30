import { supabaseServer } from "@/lib/supabase/server";
import DecisionsInbox from "@/components/decisions/DecisionsInbox";
import { sortOpen, type DecisionCardRow } from "@/lib/decisions/answer";

export const dynamic = "force-dynamic";

const COLUMNS =
  "id,kind,for_agent,title,context,options,default_option,urgency,deadline,status,answer,answer_text,answered_at,created_at,delivered_at,delivery_error";

/*
 * The Decisions inbox: every open decision waiting on Eric and every job
 * stalled on him, one tap each. Eric, 2026-10-30: "one always-live link".
 * Rows come from the brain through scripts/sync/decisions-inbox.ts every five
 * minutes; answers go back the same way. docs/decisions-inbox.md.
 */
export default async function DecisionsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const [openRes, doneRes] = await Promise.all([
    supabase.from("decisions").select(COLUMNS).eq("user_id", userData.user.id).in("status", ["open", "stale"]).limit(200),
    supabase
      .from("decisions")
      .select(COLUMNS)
      .eq("user_id", userData.user.id)
      .eq("status", "answered")
      .order("answered_at", { ascending: false })
      .limit(30),
  ]);

  const open = sortOpen((openRes.data ?? []) as DecisionCardRow[]);
  const answered = (doneRes.data ?? []) as DecisionCardRow[];
  const unavailable = Boolean(openRes.error);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Decisions</h1>
        <p className="text-sm text-slate-600">
          {unavailable
            ? "The decisions list is not available yet."
            : open.length === 0
              ? "Nothing is waiting on you."
              : `${open.length} waiting on you · ${open.filter((r) => r.urgency === "red").length} red`}
        </p>
      </header>
      <DecisionsInbox open={open} answered={answered} />
    </main>
  );
}
