import Link from "next/link";
import { AlertTriangle, Cloud, Server, Bot, CircleSlash } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import BrainTabs from "@/components/BrainTabs";

export const dynamic = "force-dynamic";

/*
 * Every recurring job Eric runs, in one place.
 *
 * This is the view the whole page exists for. Twenty-eight jobs run across
 * three mechanisms — Vercel crons in four projects, systemd timers on
 * ubuntu-dev, and a Paperclip heartbeat on the agents VM — and until this page
 * nothing listed them together. `jobs/REGISTRY.md` in the brain repo compiled
 * the inventory; the harvester files it; this renders it.
 *
 * THE MECHANISM COLUMN IS NOT DECORATION. A Vercel cron cannot see `~/dev`, so
 * any job that reads a repo, runs `gh`, or needs Claude's judgement can only be
 * a dev-server timer. Grouping by mechanism is grouping by what a job is
 * capable of.
 *
 * Git is canonical. Nothing here writes back; the way to change this page is to
 * edit `jobs/REGISTRY.md` and let the next sync notice.
 */

type Job = {
  id: string;
  source_ref: string;
  name: string;
  mechanism: "systemd_timer" | "vercel_cron" | "paperclip";
  host: string | null;
  project: string | null;
  schedule: string | null;
  cadence: string | null;
  what: string | null;
  prompt_path: string | null;
  output_key: string | null;
  state: string | null;
  position: number;
};

type OutputStub = { job_name: string; produced_on: string };

const GROUPS = [
  {
    mechanism: "systemd_timer" as const,
    title: "systemd timers — ubuntu-dev",
    icon: Server,
    tone: "text-emerald-600",
    // Restating the capability, because it is the reason a job is here and not
    // on Vercel, and that reason is invisible from the job's name.
    note: "Can reach the repos, git, gh, Claude Code and Microsoft 365.",
  },
  {
    mechanism: "vercel_cron" as const,
    title: "Vercel crons — the cloud",
    icon: Cloud,
    tone: "text-sky-600",
    note: "Can reach each app's own database and APIs. Cannot see ~/dev.",
  },
  {
    mechanism: "paperclip" as const,
    title: "Paperclip — agents VM",
    icon: Bot,
    tone: "text-violet-600",
    note: "The agent runtime. Isolated from client data by design.",
  },
];

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(`${date}T12:00:00Z`).getTime()) / 864e5);
}

export default async function BrainPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const [{ data: jobRows }, { data: outputRows }, { data: run }] = await Promise.all([
    supabase
      .from("brain_jobs")
      .select("id,source_ref,name,mechanism,host,project,schedule,cadence,what,prompt_path,output_key,state,position")
      .order("position", { ascending: true }),
    // Bodies are deliberately not selected: this page needs the newest date per
    // job, and the briefs are up to 10 KB each.
    supabase.from("brain_outputs").select("job_name,produced_on").order("produced_on", { ascending: false }),
    supabase
      .from("sync_runs")
      .select("started_at,log")
      .eq("source", "brain")
      .eq("status", "ok")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const jobs = (jobRows ?? []) as Job[];

  // Newest output per job name. The rows arrive sorted, so the first wins.
  const lastOutput = new Map<string, string>();
  for (const output of (outputRows ?? []) as OutputStub[]) {
    if (!lastOutput.has(output.job_name)) lastOutput.set(output.job_name, output.produced_on);
  }

  const unregistered = ((run?.log as { unregistered_jobs?: string[] } | null)?.unregistered_jobs ?? []);

  if (jobs.length === 0) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Brain</h1>
        <BrainTabs />
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Nothing has been read from the brain repo yet.</p>
          <p className="mt-2 text-xs text-slate-500">
            Run <code>npm run sync:brain</code> on ubuntu-dev — it reads{" "}
            <code>~/dev/brain</code>, which Vercel cannot see. See{" "}
            <Link className="text-blue-700 hover:underline" href="/sync">
              sync health
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Brain</h1>
        <p className="mt-1 text-sm text-slate-500">
          The agent workforce — what is scheduled, who it runs for, and what it has produced.
          Read from <code>~/dev/brain</code>, which is the source of truth; this never writes back.
        </p>
      </div>

      <BrainTabs />

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {GROUPS.map((group) => {
          const count = jobs.filter((j) => j.mechanism === group.mechanism).length;
          const Icon = group.icon;
          return (
            <div key={group.mechanism} className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
              <div className={`flex items-center gap-2 ${group.tone}`}>
                <Icon className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  {group.mechanism.replace("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-800">{count}</p>
              <p className="mt-1 text-xs text-slate-500">{group.note}</p>
            </div>
          );
        })}
      </section>

      {unregistered.length > 0 && (
        /*
         * The gap that matters most on this page.
         *
         * A job producing a brief that nothing has written down is exactly the
         * invisibility this page exists to end, so it is stated at the top
         * rather than left to be noticed. All twelve of these are real: the
         * client-brain and lead-gen jobs were created after the registry was
         * compiled and no row was added.
         */
        <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {unregistered.length} producing output, none of them registered
            </span>
          </div>
          <p className="mt-2 text-sm text-amber-900">
            These wrote a file into <code>jobs/out/</code> but have no row in{" "}
            <code>jobs/REGISTRY.md</code>, so the inventory does not know they exist.
          </p>
          <p className="mt-2 font-mono text-xs text-amber-800">{unregistered.join(" · ")}</p>
        </div>
      )}

      {GROUPS.map((group) => {
        const rows = jobs.filter((j) => j.mechanism === group.mechanism);
        if (rows.length === 0) return null;
        const Icon = group.icon;

        return (
          <section
            key={group.mechanism}
            className="mb-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Icon className={`h-4 w-4 ${group.tone}`} />
              {group.title}
              <span className="font-normal text-slate-400">({rows.length})</span>
            </h2>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Job</th>
                    <th className="pb-2 pr-4 font-medium">Where</th>
                    <th className="pb-2 pr-4 font-medium">When</th>
                    <th className="pb-2 pr-4 font-medium">Last output</th>
                    <th className="pb-2 font-medium">What</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((job) => {
                    const produced = job.output_key ? lastOutput.get(job.output_key) : undefined;
                    const age = produced ? daysSince(produced) : null;

                    return (
                      <tr key={job.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-4 font-medium text-slate-800">
                          {job.name}
                          {job.prompt_path && (
                            <div className="font-mono text-[11px] font-normal text-slate-400">
                              {job.prompt_path}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {job.project ?? job.host ?? "—"}
                        </td>
                        <td className="py-2 pr-4 font-mono text-slate-600">
                          {job.schedule ?? job.cadence ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {produced ? (
                            <Link className="text-blue-700 hover:underline" href="/brain/briefs">
                              {produced}
                              {age !== null && age > 0 && (
                                <span className="text-slate-400"> · {age}d ago</span>
                              )}
                            </Link>
                          ) : (
                            /*
                             * "No file" is not "did not run". The project sync
                             * writes rows into this database and every Vercel
                             * cron acts on its own app; only the brain jobs
                             * leave a file behind. Saying so here stops the
                             * column reading as twenty-six failures.
                             */
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <CircleSlash className="h-3 w-3" />
                              no file
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-slate-600">
                          {job.what ?? job.state ?? "—"}
                          {job.state && job.what && (
                            <div className="mt-0.5 text-amber-700">{job.state}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {group.mechanism === "paperclip" && (
              <p className="mt-3 text-xs text-amber-700">
                The heartbeat runs; the Chief of Staff has never completed a run. An inventory that
                could not say so would be worse than no inventory.
              </p>
            )}
          </section>
        );
      })}

      <p className="text-xs text-slate-500">
        Compiled from <code>jobs/REGISTRY.md</code> in <code>~/dev/brain</code>. Add a job there in
        the same commit that creates it. Last read{" "}
        {run?.started_at ? new Date(run.started_at).toLocaleString() : "never"} —{" "}
        <Link className="text-blue-700 hover:underline" href="/sync">
          sync health
        </Link>
        .
      </p>
    </main>
  );
}
