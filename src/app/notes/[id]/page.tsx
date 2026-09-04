import { Paperclip } from "lucide-react";

import AttachmentUploadButton from "@/components/AttachmentUploadButton";
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

  let note: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  const primary = await supabase
    .from("notes")
    .select("id,title,content_md,tags,updated_at,created_at,status")
    .eq("id", id)
    .single();

  if (primary.error?.message?.includes("column notes.status does not exist")) {
    const fallback = await supabase
      .from("notes")
      .select("id,title,content_md,tags,updated_at,created_at")
      .eq("id", id)
      .single();
    note = fallback.data ? { ...fallback.data, status: null } : null;
    error = fallback.error;
  } else {
    note = primary.data;
    error = primary.error;
  }

  const { data: attachments } = await supabase
    .from("attachments")
    .select("id,filename,storage_path,created_at,size_bytes,mime_type")
    .eq("scope_type", "note")
    .eq("scope_id", id)
    .order("created_at", { ascending: false });

  if (error || !note) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Note not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The note could not be loaded. Check the URL or return to the list.
        </p>
      </main>
    );
  }

  return (
    <main className="pt-4 md:pt-8">
      <h1 className="text-3xl font-semibold">Edit Note</h1>
      <p className="mt-1 text-sm text-slate-500">
        Update the markdown content and tags below.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
          href={`/notes/${String(note.id)}/export`}
        >
          Download Markdown
        </a>
        <form action={`/notes/${note.id}/export-vault`} method="post" data-progress="true" data-toast="Exporting note to vault">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
            type="submit"
          >
            Export to Vault
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <form id="note-form" className="grid gap-4" action="/notes/update" method="post" data-toast="Note saved">
          <input type="hidden" name="id" value={String(note.id)} />

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500" htmlFor="note-title">
              Title
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              id="note-title"
              name="title"
              defaultValue={String(note.title || "")}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500" htmlFor="note-status">
                Status
              </label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                id="note-status"
                name="status"
                defaultValue={String(note.status || "inbox")}
              >
                <option value="inbox">Inbox</option>
                <option value="in_process">In Process</option>
                <option value="review">Review</option>
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500" htmlFor="note-tags">
                Tags
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                id="note-tags"
                name="tags"
                defaultValue={formatTags((note.tags as string[] | string | null) ?? null)}
                placeholder="comma-separated"
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500" htmlFor="note-content">
              Markdown
            </label>
            <textarea
              className="mt-2 min-h-[320px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
              id="note-content"
              name="content"
              defaultValue={String(note.content_md || "")}
            />
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <AttachmentUploadButton scopeType="note" scopeId={String(note.id)} />
          {(attachments || []).map((file) => (
            <span
              key={file.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
            >
              {file.mime_type?.startsWith("image/") ? (
                <img
                  src={`/attachments/${file.id}/download`}
                  alt={file.filename}
                  className="h-5 w-5 rounded border border-slate-200 object-cover"
                />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
              <a className="font-medium hover:underline" href={`/attachments/${file.id}/download`}>
                {file.filename}
              </a>
              <span className="text-slate-400">{Math.round((file.size_bytes || 0) / 1024)} KB</span>
            </span>
          ))}
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <button
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
            form="note-form"
            type="submit"
          >
            Save Changes
          </button>
        </div>
      </div>

    </main>
  );
}
