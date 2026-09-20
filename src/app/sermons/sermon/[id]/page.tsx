import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One sermon, on its own page.
 *
 * Before this there was no route for a sermon at all — only `/sermons/[id]`,
 * which is a SERIES and renders its sermons inside it. So a sermon belonging to
 * no series had nowhere to be seen even once the column allowed it to exist.
 * This is the third of the three layers named in
 * `20260920024853_a_sermon_can_stand_on_its_own.sql`.
 *
 * It serves a sermon in a series too, so there is one place a manuscript is
 * edited rather than two that drift.
 */
export default async function SermonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: sermon } = await supabase
    .from("sermons")
    .select("id,series_id,title,status,preach_date,key_text,big_idea,outline_md,manuscript_md,notes_md")
    .eq("id", id)
    .single();

  if (!sermon) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Sermon not found</h1>
        <Link className="mt-4 inline-block text-sm text-blue-700" href="/sermons">
          Back to sermons
        </Link>
      </main>
    );
  }

  const words = (sermon.manuscript_md || "").trim().split(/\s+/).filter(Boolean).length;

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link className="rounded-full border border-slate-200 bg-white px-3 py-1" href="/sermons">
          ← Sermons
        </Link>
        {sermon.series_id && (
          <Link
            className="rounded-full border border-slate-200 bg-white px-3 py-1"
            href={`/sermons/${sermon.series_id}`}
          >
            ← Its series
          </Link>
        )}
        {!sermon.series_id && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
            Standalone
          </span>
        )}
      </div>

      <h1 className="mt-3 text-3xl font-semibold">{sermon.title}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {sermon.preach_date || "no date set"} · {sermon.status || "planning"} ·{" "}
        {words.toLocaleString()} words in the manuscript
      </p>

      <form
        className="mt-6 grid gap-3"
        action="/sermons/sermon/update"
        method="post"
        data-toast="Sermon saved"
      >
        <input type="hidden" name="id" value={sermon.id} />
        {/* Empty for a standalone, which the update route reads as "no series". */}
        <input type="hidden" name="series_id" value={sermon.series_id || ""} />

        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="title"
            defaultValue={sermon.title || ""}
            placeholder="Title"
            required
          />
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="preach_date"
            type="date"
            defaultValue={sermon.preach_date || ""}
          />
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="key_text"
            defaultValue={sermon.key_text || ""}
            placeholder="Key text"
          />
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="status"
            defaultValue={sermon.status || "planning"}
          >
            <option value="planning">planning</option>
            <option value="outline">outline</option>
            <option value="writing">writing</option>
            <option value="review">review</option>
            <option value="delivered">delivered</option>
            <option value="archive">archive</option>
          </select>
        </div>

        <textarea
          className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2"
          name="big_idea"
          defaultValue={sermon.big_idea || ""}
          placeholder="Big idea — one sentence"
        />

        <label className="mt-2 text-sm font-medium text-slate-700">Outline</label>
        <textarea
          className="min-h-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
          name="outline_md"
          defaultValue={sermon.outline_md || ""}
        />

        <label className="mt-2 text-sm font-medium text-slate-700">Manuscript</label>
        <textarea
          className="min-h-[500px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
          name="manuscript_md"
          defaultValue={sermon.manuscript_md || ""}
        />

        <label className="mt-2 text-sm font-medium text-slate-700">Notes</label>
        <textarea
          className="min-h-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2"
          name="notes_md"
          defaultValue={sermon.notes_md || ""}
        />

        <button
          className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
          type="submit"
        >
          Save
        </button>
      </form>
    </main>
  );
}
