import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SermonSeriesPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: series } = await supabase
    .from("sermon_series")
    .select("id,title,subtitle,status,start_date,end_date")
    .order("created_at", { ascending: false });

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Sermon Builder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build sermon series, outlines, and downstream resources.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Create Series</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" action="/sermons/new" method="post" data-toast="Series created">
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Series title" required />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="subtitle" placeholder="Subtitle (optional)" />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="theme" placeholder="Theme / big idea" />
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="status" defaultValue="planning">
            <option value="planning">planning</option>
            <option value="writing">writing</option>
            <option value="review">review</option>
            <option value="delivered">delivered</option>
            <option value="archive">archive</option>
          </select>
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="start_date" type="date" />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="end_date" type="date" />
          <textarea className="md:col-span-2 min-h-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2" name="description" placeholder="Series description" />
          <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Save Series
          </button>
        </form>
      </section>

      <section className="mt-6 grid gap-3">
        {(series || []).map((item) => (
          <Link key={item.id} href={`/sermons/${item.id}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-base font-semibold">{item.title}</div>
            {item.subtitle && <div className="text-sm text-slate-600">{item.subtitle}</div>}
            <div className="mt-1 text-xs text-slate-500">
              Status: {item.status} · {item.start_date || "n/a"} → {item.end_date || "n/a"}
            </div>
          </Link>
        ))}
        {series && series.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No series yet. Create your first sermon series above.
          </div>
        )}
      </section>
    </main>
  );
}
