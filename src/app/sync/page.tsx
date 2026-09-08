import Link from "next/link";
import { CircleCheck, CircleAlert, CircleSlash, Clock } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/*
 * Is the single pane of glass actually being fed?
 *
 * The failure this page exists to catch is the quiet one. A sync that stops
 * running leaves the app looking exactly as it did the day it stopped — every
 * task still there, every count still plausible — and the brief keeps arriving
 * with week-old data underneath it. Nothing turns red on its own, so staleness
 * has to be shown somewhere on purpose.
 *
 * Lives at /sync, not /health: `health` in this app means blood pressure and
 * lab results, and there is already a page there.
 */

/** How long a source may go unheard from before it is treated as broken. */
const STALE_AFTER_HOURS: Record<string, number> = {
  // The timer runs every two hours between 06:00 and 22:00, so an overnight
  // gap is normal and 36 hours means two working days of silence.
  projects: 36,
  m365_mail: 3,
  m365_calendar: 3,
  // The brain repo changes when a job runs or Eric edits it, not on a clock.
  // A day of silence is an ordinary weekend; three is the timer having stopped.
  brain: 72,
};

const SOURCE_LABEL: Record<string, string> = {
  projects: "Project task lists (~/dev)",
  m365_mail: "Outlook mail",
  m365_calendar: "Outlook calendar",
  brain: "Agent workforce (~/dev/brain)",
};

type Run = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  items_seen: number;
  items_created: number;
  items_updated: number;
  items_closed: number;
  error: string | null;
};

function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function describeAge(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min ago`;
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default async function SyncHealthPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: runs } = await supabase
    .from("sync_runs")
    .select("id,source,status,started_at,finished_at,items_seen,items_created,items_updated,items_closed,error")
    .order("started_at", { ascending: false })
    .limit(60);

  const latest = new Map<string, Run>();
  for (const run of (runs || []) as Run[]) {
    if (!latest.has(run.source)) latest.set(run.source, run);
  }

  const sources = Object.keys(STALE_AFTER_HOURS);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Sync health</h1>
        <p className="mt-1 text-sm text-slate-500">
          What is feeding Mission Control, and when it last did.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sources.map((source) => {
          const run = latest.get(source);
          const label = SOURCE_LABEL[source] ?? source;

          if (!run) {
            return (
              <div key={source} className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <CircleSlash className="h-4 w-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Never run</span>
                </div>
                <p className="mt-2 font-medium text-slate-700">{label}</p>
                <p className="mt-1 text-xs text-slate-500">
                  No run recorded. Not an error if this source is not set up yet.
                </p>
              </div>
            );
          }

          const age = hoursSince(run.started_at);
          const stale = age > (STALE_AFTER_HOURS[source] ?? 24);
          const failed = run.status === "error";
          const bad = stale || failed;

          return (
            <div
              key={source}
              className={`rounded-2xl border-2 p-5 shadow-sm ${
                bad ? "border-red-300 bg-red-50" : "border-slate-300 bg-white"
              }`}
            >
              <div className={`flex items-center gap-2 ${bad ? "text-red-700" : "text-slate-500"}`}>
                {bad ? <CircleAlert className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  {failed ? "Last run failed" : stale ? "Stale" : "Current"}
                </span>
              </div>
              <p className="mt-2 font-medium text-slate-800">{label}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" />
                {describeAge(age)}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {run.items_seen} seen · {run.items_created} new · {run.items_updated} updated ·{" "}
                {run.items_closed} closed
              </p>
              {run.error && <p className="mt-2 text-xs text-red-700">{run.error}</p>}
            </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Recent runs</h2>
        {(runs || []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">When</th>
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 text-right font-medium">Seen</th>
                  <th className="pb-2 pr-4 text-right font-medium">New</th>
                  <th className="pb-2 pr-4 text-right font-medium">Updated</th>
                  <th className="pb-2 text-right font-medium">Closed</th>
                </tr>
              </thead>
              <tbody>
                {((runs || []) as Run[]).slice(0, 25).map((run) => (
                  <tr key={run.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-4 text-slate-600">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-4 text-slate-600">{run.source}</td>
                    <td className={`py-1.5 pr-4 ${run.status === "error" ? "text-red-700" : "text-slate-600"}`}>
                      {run.status}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{run.items_seen}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{run.items_created}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{run.items_updated}</td>
                    <td className="py-1.5 text-right tabular-nums">{run.items_closed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Runs are written by the sync CLI on ubuntu-dev. See{" "}
          <Link className="text-blue-700 hover:underline" href="/tasks">
            Tasks
          </Link>{" "}
          for what it produced, and <code>docs/runbook.md</code> for how to run one by hand.
        </p>
      </section>
    </main>
  );
}
