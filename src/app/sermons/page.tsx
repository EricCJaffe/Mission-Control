import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Sermons, in two shapes.
 *
 * This page listed `sermon_series` only, which made a sermon something that
 * lives inside a series and nothing else. Eric, 2026-09-19: *"we need a
 * standalone category rather than just a series function."* He had already
 * said why earlier the same day, answering the preaching-brain questions:
 * *"I don't preach as many series as I used to, I will probably do more
 * standalones."*
 *
 * So standalone sermons — `series_id is null` — get their own section, and it
 * is placed FIRST because it is now the common case. A series is a grouping a
 * sermon may have, not a parent it must have.
 */
export default async function SermonsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: series }, { data: standalone }] = await Promise.all([
    supabase
      .from("sermon_series")
      .select("id,title,subtitle,status,start_date,end_date")
      .order("created_at", { ascending: false }),
    supabase
      .from("sermons")
      .select("id,title,status,preach_date,key_text,big_idea")
      .is("series_id", null)
      // preach_date, not created_at: `position` orders a sermon inside a
      // series and means nothing to a standalone, and what he wants to see is
      // what is coming up.
      .order("preach_date", { ascending: false, nullsFirst: false }),
  ]);

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Sermons</h1>
          <p className="mt-1 text-sm text-slate-500">
            Standalone messages and series, outlines, and downstream resources.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">New standalone sermon</h2>
        <p className="mt-1 text-xs text-slate-500">
          One message, belonging to no series. Add it to a series later if it turns into one.
        </p>
        <form
          className="mt-3 grid gap-3 md:grid-cols-2"
          action="/sermons/sermon/new"
          method="post"
          data-toast="Sermon created"
        >
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="title"
            placeholder="Sermon title"
            required
          />
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="preach_date"
            type="date"
          />
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="key_text"
            placeholder="Key text"
          />
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="status"
            defaultValue="planning"
          >
            <option value="planning">planning</option>
            <option value="writing">writing</option>
            <option value="review">review</option>
            <option value="delivered">delivered</option>
            <option value="archive">archive</option>
          </select>
          <textarea
            className="md:col-span-2 min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="big_idea"
            placeholder="Big idea — one sentence"
          />
          <button
            className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
            type="submit"
          >
            Save Sermon
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Standalone sermons</h2>
        <div className="mt-3 grid gap-3">
          {(standalone || []).map((item) => (
            <Link
              key={item.id}
              href={`/sermons/sermon/${item.id}`}
              className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm"
            >
              <div className="text-base font-semibold">{item.title}</div>
              {item.big_idea && <div className="text-sm text-slate-600">{item.big_idea}</div>}
              <div className="mt-1 text-xs text-slate-500">
                {item.preach_date || "no date"} · {item.status || "planning"}
                {item.key_text ? ` · ${item.key_text}` : ""}
              </div>
            </Link>
          ))}
          {standalone && standalone.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
              No standalone sermons yet.
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Create Series</h2>
        <form
          className="mt-3 grid gap-3 md:grid-cols-2"
          action="/sermons/new"
          method="post"
          data-toast="Series created"
        >
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
          <Link key={item.id} href={`/sermons/${item.id}`} className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
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
