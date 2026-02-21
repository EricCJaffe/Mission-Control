import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatTags(tags: string[] | string | null) {
  if (!tags) return "";
  if (Array.isArray(tags)) return tags.join(", ");
  return tags;
}

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: note, error } = await supabase
    .from("notes")
    .select("id,title,content_md,tags,updated_at,created_at")
    .eq("id", id)
    .single();

  const { data: attachments } = await supabase
    .from("attachments")
    .select("id,filename,storage_path,created_at,size_bytes,mime_type")
    .eq("scope_type", "note")
    .eq("scope_id", id)
    .order("created_at", { ascending: false });

  if (error || !note) {
    return (
      <main className="pt-8">
        <h1 className="text-3xl font-semibold">Note not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The note could not be loaded. Check the URL or return to the list.
        </p>
      </main>
    );
  }

  return (
    <main className="pt-8">
      <h1 className="text-3xl font-semibold">Edit Note</h1>
      <p className="mt-1 text-sm text-slate-500">
        Update the markdown content and tags below.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
          href={`/notes/${note.id}/export`}
        >
          Download Markdown
        </a>
        <form action={`/notes/${note.id}/export-vault`} method="post">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
            type="submit"
          >
            Export to Vault
          </button>
        </form>
      </div>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Attachments</h2>
        <form className="mt-3 grid gap-2" action="/attachments/upload" method="post" encType="multipart/form-data">
          <input type="hidden" name="scope_type" value="note" />
          <input type="hidden" name="scope_id" value={note.id} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="file" type="file" />
          <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Upload Attachment
          </button>
        </form>
        <div className="mt-3 grid gap-2 text-xs">
          {(attachments || []).map((file) => (
            <div key={file.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{file.filename}</div>
                <a className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px]" href={`/attachments/${file.id}/download`}>
                  Download
                </a>
              </div>
              {file.mime_type?.startsWith("image/") && (
                <img
                  src={`/attachments/${file.id}/download`}
                  alt={file.filename}
                  className="mt-2 max-h-48 rounded border border-slate-200 object-contain"
                />
              )}
              <div className="text-slate-500">
                {Math.round((file.size_bytes || 0) / 1024)} KB · {new Date(file.created_at).toLocaleString()}
              </div>
            </div>
          ))}
          {attachments && attachments.length === 0 && <div className="text-xs text-slate-500">No attachments yet.</div>}
        </div>
      </section>

      <form className="mt-6 grid gap-4" action="/notes/update" method="post">
        <input type="hidden" name="id" value={note.id} />
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <label className="text-xs uppercase tracking-wide text-slate-500">Title</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="title"
            defaultValue={note.title || ""}
            required
          />
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <label className="text-xs uppercase tracking-wide text-slate-500">Tags</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            name="tags"
            defaultValue={formatTags(note.tags)}
            placeholder="comma-separated"
          />
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <label className="text-xs uppercase tracking-wide text-slate-500">Markdown</label>
          <textarea
            className="mt-2 min-h-[320px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
            name="content"
            defaultValue={note.content_md || ""}
          />
        </div>

        <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Save Changes
        </button>
      </form>
    </main>
  );
}
