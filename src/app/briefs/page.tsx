import Link from "next/link";
import { Mail, MailWarning, CalendarDays } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/*
 * Every brief that was generated, whether or not it was delivered.
 *
 * The cron stores before it sends, so a run that failed at the Graph call
 * still shows up here with the reason attached. That is the whole point of
 * the ordering: a missing email in an inbox tells you nothing about which of
 * the two halves broke.
 */

type BriefRow = {
  id: string;
  kind: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  sent_at: string | null;
  sent_to: string | null;
  send_error: string | null;
};

export default async function BriefsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: briefs } = await supabase
    .from("briefs")
    .select("id,kind,period_start,period_end,generated_at,sent_at,sent_to,send_error")
    .order("generated_at", { ascending: false })
    .limit(60);

  const rows = (briefs || []) as BriefRow[];

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Briefs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every weekly and daily brief, delivered or not.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">No brief has been generated yet.</p>
          <p className="mt-2 text-xs text-slate-500">
            The weekly runs Sunday evening and the daily on weekday mornings, both from
            Vercel cron. Check <Link className="text-blue-700 hover:underline" href="/sync">sync health</Link>{" "}
            if one is overdue.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((brief) => (
            <Link
              key={brief.id}
              href={`/briefs/${brief.id}`}
              className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm transition-shadow hover:shadow"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <span className="font-medium text-slate-800">
                    {brief.kind === "weekly" ? "Weekly" : "Daily"} — {brief.period_start}
                    {brief.period_end !== brief.period_start && ` to ${brief.period_end}`}
                  </span>
                </div>
                {brief.sent_at ? (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Mail className="h-3.5 w-3.5" />
                    sent to {brief.sent_to}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <MailWarning className="h-3.5 w-3.5" />
                    not sent
                  </span>
                )}
              </div>
              {brief.send_error && (
                <p className="mt-2 text-xs text-amber-700">{brief.send_error}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                generated {new Date(brief.generated_at).toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
