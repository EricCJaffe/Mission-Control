import Link from "next/link";
import { FileText, Code2, CalendarDays } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import BrainTabs from "@/components/BrainTabs";

export const dynamic = "force-dynamic";

/*
 * Everything the workforce has written, newest first.
 *
 * These are the files in `jobs/out/` — a job runs on ubuntu-dev, writes its
 * brief, and `run-job.sh` commits it. Deliberately a separate list from
 * `/briefs`, which is this app's own weekly and daily email: same shape on
 * screen, different lineage, and a different answer to who can change them.
 * Folding them together would have made one list where half the rows can be
 * regenerated from the database and half cannot.
 *
 * Bodies are not selected here. Some briefs are 10 KB and this page needs a
 * date, a job and a size.
 */

type OutputRow = {
  id: string;
  path: string;
  job_name: string;
  produced_on: string;
  format: "markdown" | "html";
  bytes: number;
  committed_at: string | null;
};

function humanBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export default async function BrainBriefsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("brain_outputs")
    .select("id,path,job_name,produced_on,format,bytes,committed_at")
    .order("produced_on", { ascending: false })
    .order("job_name", { ascending: true })
    .limit(200);

  const rows = (data ?? []) as OutputRow[];

  // Grouped by day, because these run in batches: eleven client brains and a
  // lead-gen sweep all landed on 2026-09-07, and a flat list buries that.
  const byDay = new Map<string, OutputRow[]>();
  for (const row of rows) {
    const day = byDay.get(row.produced_on) ?? [];
    day.push(row);
    byDay.set(row.produced_on, day);
  }

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Brain</h1>
        <p className="mt-1 text-sm text-slate-500">
          What the scheduled jobs have written, from <code>jobs/out/</code>. For this app&apos;s own
          weekly and daily email, see{" "}
          <Link className="text-blue-700 hover:underline" href="/briefs">
            Briefs
          </Link>
          .
        </p>
      </div>

      <BrainTabs />

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">No job has produced a file yet.</p>
          <p className="mt-2 text-xs text-slate-500">
            Run <code>npm run sync:brain</code> on ubuntu-dev, or{" "}
            <code>./jobs/run-job.sh &lt;name&gt;</code> in <code>~/dev/brain</code> to produce one.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {[...byDay.entries()].map(([day, dayRows]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                {day}
                <span className="font-normal text-slate-400">({dayRows.length})</span>
              </h2>
              <div className="grid gap-2">
                {dayRows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/brain/briefs/${row.id}`}
                    className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium text-slate-800">
                        {row.format === "html" ? (
                          <Code2 className="h-4 w-4 text-sky-500" />
                        ) : (
                          <FileText className="h-4 w-4 text-slate-400" />
                        )}
                        {row.job_name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {humanBytes(row.bytes)}
                        {/*
                          * A zero-byte brief is a job that ran and produced
                          * nothing, which looks identical to a healthy one in a
                          * directory listing. Saying so here is the only place
                          * it becomes visible.
                          */}
                        {row.bytes === 0 && (
                          <span className="ml-2 text-amber-700">empty — the job wrote nothing</span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{row.path}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
