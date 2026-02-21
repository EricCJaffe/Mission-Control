import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatTags(tags: string[] | string | null) {
  if (!tags) return "No tags";
  if (Array.isArray(tags)) return tags.join(", ");
  return tags;
}

export default async function NotesPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id,title,tags,updated_at,created_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Notes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Markdown-first knowledge capture with tags.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm sm:grid-cols-[1fr_auto]" action="/notes/new" method="post">
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
          name="title"
          placeholder="New note title…"
          required
        />
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          name="tags"
          placeholder="tags (comma-separated)"
        />
        <button className="sm:col-span-2 rounded-xl bg-blue-700 text-white px-4 py-2 text-sm font-medium shadow-sm" type="submit">
          Add Note
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading notes: {error.message}
        </div>
      )}

      <div className="mt-6 grid gap-4">
        {(notes || []).map((note) => (
          <Link
            key={note.id}
            href={`/notes/${note.id}`}
            className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-base font-semibold">{note.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              Tags: {formatTags(note.tags)} · Updated:{" "}
              {note.updated_at ? new Date(note.updated_at).toLocaleString() : "n/a"}
            </div>
          </Link>
        ))}

        {notes && notes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No notes yet. Add your first entry above.
          </div>
        )}
      </div>
    </main>
  );
}
