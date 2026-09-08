import Link from "next/link";
import { ShieldCheck, Inbox, FileWarning, UserCheck } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import BrainTabs from "@/components/BrainTabs";

export const dynamic = "force-dynamic";

/*
 * One row per client brain.
 *
 * ─── The rule this page is built around ────────────────────────────────────
 *
 * `clients/_ownership.md` is authoritative and nothing on this page may
 * contradict it. It exists because the mailbox misled five separate analyses in
 * one evening — a partner-owned account read as lapsed, equity read as a
 * client, finished work read as abandoned, a deliberate wind-down read as
 * decline, a personal relationship read as a lead. Eric corrected each one by
 * hand, and those corrections are worth more than anything a job can infer.
 *
 * So `Owner` and `Eric's role` come from that file and from nowhere else, and
 * the harvester withholds any status that would read as dormant on an account
 * the file governs. Blue Sky Day is the case in point: it looks quiet because
 * Tyler owns the relationship and the correspondence is his, and a dashboard
 * calling it stale would be repeating the mistake in a more permanent place.
 *
 * ─── What is deliberately absent ───────────────────────────────────────────
 *
 * The client files themselves. This page indexes them and does not open them.
 * `clients/blue-sky-day/people.md` carries a section marked "never automate" —
 * a contact's father is fighting cancer, recorded so Eric remembers to be a
 * friend, with an explicit instruction that it must never reach a briefing or
 * any generated output. Summaries stay out; the folder is a link.
 */

type BrainClient = {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  owner: string | null;
  eric_role: string | null;
  ownership_governed: boolean;
  last_contact_on: string | null;
  has_proposed: boolean;
  proposed_at: string | null;
  files: string[];
  has_folder: boolean;
  last_commit_at: string | null;
};

/** A brain is the four-file set; anything less is a stub, and it should show. */
const FULL_BRAIN = ["history.md", "open.md", "people.md", "profile.md"];

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(`${date}T12:00:00Z`).getTime()) / 864e5);
}

export default async function BrainClientsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("brain_clients")
    .select(
      "id,slug,name,status,owner,eric_role,ownership_governed,last_contact_on,has_proposed,proposed_at,files,has_folder,last_commit_at",
    )
    .order("name", { ascending: true });

  const all = (data ?? []) as BrainClient[];
  const withBrain = all.filter((c) => c.has_folder);
  const withoutBrain = all.filter((c) => !c.has_folder);
  const awaiting = withBrain.filter((c) => c.has_proposed);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Brain</h1>
        <p className="mt-1 text-sm text-slate-500">
          One row per <code>clients/&lt;slug&gt;/</code>. Owner and role come from{" "}
          <code>_ownership.md</code>, which overrides anything a job inferred from the mailbox.
        </p>
      </div>

      <BrainTabs />

      {awaiting.length > 0 && (
        /*
         * The queue this page exists to surface. A `_proposed.md` is a change to
         * profile.md or people.md that a weekly run wrote rather than applied,
         * because those files change slowly and a wrong edit is expensive. It is
         * waiting on Eric and on nobody else, so it goes at the top.
         */
        <div className="mb-6 rounded-2xl border-2 border-blue-300 bg-blue-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-blue-800">
            <Inbox className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {awaiting.length} waiting for you
            </span>
          </div>
          <p className="mt-2 text-sm text-blue-900">
            A weekly run proposed a change to these clients&apos; profile or people files rather
            than applying it. Review <code>_proposed.md</code> in each folder.
          </p>
          <p className="mt-2 text-sm font-medium text-blue-900">
            {awaiting.map((c) => c.name).join(" · ")}
          </p>
        </div>
      )}

      <section className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">
          Client brains <span className="font-normal text-slate-400">({withBrain.length})</span>
        </h2>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Client</th>
                <th className="pb-2 pr-4 font-medium">Engagement</th>
                <th className="pb-2 pr-4 font-medium">Day-to-day owner</th>
                <th className="pb-2 pr-4 font-medium">Eric&apos;s role</th>
                <th className="pb-2 pr-4 font-medium">Last contact</th>
                <th className="pb-2 font-medium">Brain</th>
              </tr>
            </thead>
            <tbody>
              {withBrain.map((client) => {
                const missing = FULL_BRAIN.filter((f) => !client.files.includes(f));
                const age = client.last_contact_on ? daysSince(client.last_contact_on) : null;

                return (
                  <tr key={client.id} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        {client.name}
                        {client.has_proposed && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800"
                            title="A _proposed.md is waiting for you"
                          >
                            <Inbox className="h-3 w-3" />
                            proposed
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">
                        clients/{client.slug}/
                      </div>
                    </td>

                    <td className="py-2 pr-4 text-slate-700">
                      {client.status ?? <span className="text-slate-400">not stated</span>}
                    </td>

                    <td className="py-2 pr-4">
                      {client.owner ? (
                        <span className="inline-flex items-start gap-1 text-slate-700">
                          <ShieldCheck
                            className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600"
                            aria-label="stated in _ownership.md"
                          />
                          {client.owner}
                        </span>
                      ) : (
                        /*
                         * Blank means _ownership.md does not name this account,
                         * not that Eric runs it. Inferring an owner from a
                         * profile.md written out of the mailbox is precisely
                         * what that file was created to stop.
                         */
                        <span className="text-slate-400">not in _ownership.md</span>
                      )}
                    </td>

                    <td className="py-2 pr-4 text-slate-600">{client.eric_role ?? "—"}</td>

                    <td className="py-2 pr-4 text-slate-600">
                      {client.last_contact_on ? (
                        <>
                          {client.last_contact_on}
                          {age !== null && age > 0 && (
                            <span className="text-slate-400"> · {age}d</span>
                          )}
                        </>
                      ) : (
                        /*
                         * Never back-filled from a file date. An mtime says when
                         * a job last ran, and showing that as contact would
                         * report the agent's activity as the relationship's.
                         */
                        <span className="text-slate-400">not stated</span>
                      )}
                    </td>

                    <td className="py-2 text-slate-600">
                      {missing.length === 0 ? (
                        <span className="text-slate-500">complete</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <FileWarning className="h-3 w-3" />
                          {client.files.length === 0
                            ? "empty"
                            : `missing ${missing.join(", ")}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          A tick marks a value taken from <code>_ownership.md</code>. Where it disagrees with a
          profile, the file wins — see <code>clients/_REFRESH.md</code> for why, and{" "}
          <Link className="text-blue-700 hover:underline" href="/brain">
            scheduled work
          </Link>{" "}
          for the runs that keep these current.
        </p>
      </section>

      {withoutBrain.length > 0 && (
        /*
         * Accounts Eric named that nothing has gathered context on. JW Supply
         * and Main Source Supply are both here. A list that quietly showed only
         * folders would never surface the gap, and the gap is the point: these
         * are relationships the system has been told about and has not learned.
         */
        <section className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UserCheck className="h-4 w-4 text-slate-400" />
            Named in <code>_ownership.md</code>, no brain built
            <span className="font-normal text-slate-400">({withoutBrain.length})</span>
          </h2>
          <div className="mt-3 grid gap-2">
            {withoutBrain.map((client) => (
              <div key={client.id} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="font-medium text-slate-800">{client.name}</span>
                <span className="text-slate-600">{client.owner ?? "owner not stated"}</span>
                <span className="text-slate-500">{client.eric_role ?? ""}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            No <code>clients/&lt;slug&gt;/</code> folder exists for these, so nothing gathers or
            refreshes context on them.
          </p>
        </section>
      )}

      {all.length === 0 && (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Nothing has been read from the brain repo yet.</p>
          <p className="mt-2 text-xs text-slate-500">
            Run <code>npm run sync:brain</code> on ubuntu-dev.
          </p>
        </div>
      )}
    </main>
  );
}
