"use client";

import { useMemo, useState } from "react";
import RtfEditor from "@/components/RtfEditor";

type ChapterOption = { id: string; title: string };

type ResearchNote = {
  id: string;
  title: string;
  content_md: string | null;
  tags: string[] | null;
  scope_type: string;
  scope_id: string;
};

function snippet(text: string, max = 200) {
  const cleaned = text
    .replace(/[#*_>`]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

export default function BookResearchNotesClient({
  bookId,
  chapters,
  notes,
}: {
  bookId: string;
  chapters: ChapterOption[];
  notes: ResearchNote[];
}) {
  const [filterScope, setFilterScope] = useState<"all" | "book" | "chapter">("all");
  const [filterText, setFilterText] = useState("");
  const [addScope, setAddScope] = useState<"book" | "chapter">("book");
  const [addScopeId, setAddScopeId] = useState(bookId);
  const [addTitle, setAddTitle] = useState("");
  const [addTags, setAddTags] = useState("");
  const [addContent, setAddContent] = useState("");

  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editScope, setEditScope] = useState<"book" | "chapter">("book");
  const [editScopeId, setEditScopeId] = useState(bookId);

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      if (filterScope !== "all" && note.scope_type !== filterScope) return false;
      if (!filterText.trim()) return true;
      const hay = `${note.title} ${(note.tags || []).join(" ")} ${note.content_md || ""}`.toLowerCase();
      return hay.includes(filterText.toLowerCase());
    });
  }, [notes, filterScope, filterText]);

  function openEdit(note: ResearchNote) {
    setEditNoteId(note.id);
    setEditTitle(note.title);
    setEditTags((note.tags || []).join(", "));
    setEditContent(note.content_md || "");
    const scope = note.scope_type === "chapter" ? "chapter" : "book";
    setEditScope(scope);
    setEditScopeId(scope === "book" ? bookId : note.scope_id);
    (document.getElementById("edit-note-dialog") as HTMLDialogElement | null)?.showModal();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Filter</label>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value as "all" | "book" | "chapter")}
          >
            <option value="all">All scopes</option>
            <option value="book">Book only</option>
            <option value="chapter">Chapter only</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-slate-500">Search</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search notes..."
          />
        </div>
        <button
          className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
          type="button"
          onClick={() => (document.getElementById("add-note-dialog") as HTMLDialogElement | null)?.showModal()}
        >
          Add Note
        </button>
      </div>

      <dialog id="add-note-dialog" className="w-[92vw] max-w-2xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Add Research Note</h3>
          <form className="mt-4 grid gap-3" action={`/books/${bookId}/research`} method="post" data-toast="Research note added">
            <input type="hidden" name="redirect" value={`/books/${bookId}?tab=notes`} />
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500">Scope</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  name="scope_type"
                  value={addScope}
                  onChange={(e) => {
                    const next = e.target.value as "book" | "chapter";
                    setAddScope(next);
                    setAddScopeId(next === "book" ? bookId : chapters[0]?.id || bookId);
                  }}
                >
                  <option value="book">Book</option>
                  <option value="chapter">Chapter</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Chapter</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  name="scope_id"
                  value={addScopeId}
                  onChange={(e) => setAddScopeId(e.target.value)}
                  disabled={addScope !== "chapter"}
                >
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
                {addScope === "book" && <input type="hidden" name="scope_id" value={bookId} />}
              </div>
            </div>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              name="title"
              placeholder="Note title"
              required
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              name="tags"
              placeholder="tags (comma-separated)"
              value={addTags}
              onChange={(e) => setAddTags(e.target.value)}
            />
            <input type="hidden" name="content_md" value={addContent} />
            <RtfEditor value={addContent} onChange={setAddContent} placeholder="Write the note..." minHeight="160px" />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Save Note
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="edit-note-dialog" className="w-[92vw] max-w-2xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Edit Research Note</h3>
          <form className="mt-4 grid gap-3" action="/books/research/update" method="post" data-toast="Research note updated">
            <input type="hidden" name="note_id" value={editNoteId || ""} />
            <input type="hidden" name="redirect" value={`/books/${bookId}?tab=notes`} />
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500">Scope</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  name="scope_type"
                  value={editScope}
                  onChange={(e) => {
                    const next = e.target.value as "book" | "chapter";
                    setEditScope(next);
                    setEditScopeId(next === "book" ? bookId : chapters[0]?.id || bookId);
                  }}
                >
                  <option value="book">Book</option>
                  <option value="chapter">Chapter</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Chapter</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  name="scope_id"
                  value={editScopeId}
                  onChange={(e) => setEditScopeId(e.target.value)}
                  disabled={editScope !== "chapter"}
                >
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
                {editScope === "book" && <input type="hidden" name="scope_id" value={bookId} />}
              </div>
            </div>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              name="title"
              placeholder="Note title"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              name="tags"
              placeholder="tags (comma-separated)"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
            />
            <input type="hidden" name="content_md" value={editContent} />
            <RtfEditor value={editContent} onChange={setEditContent} placeholder="Write the note..." minHeight="160px" />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Update Note
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {filtered.map((note) => (
          <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{note.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {(note.tags || []).join(", ") || "No tags"}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Scope: {note.scope_type === "chapter" ? "Chapter" : "Book"}
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <button className="rounded-full border border-slate-200 px-3 py-1" type="button" onClick={() => openEdit(note)}>
                  Edit
                </button>
                <form action="/books/research/delete" method="post" data-toast="Research note deleted">
                  <input type="hidden" name="note_id" value={note.id} />
                  <input type="hidden" name="redirect" value={`/books/${bookId}?tab=notes`} />
                  <button className="rounded-full border border-slate-200 px-3 py-1" type="submit">
                    Delete
                  </button>
                </form>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-600">{snippet(note.content_md || "") || "No content yet."}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-xs text-slate-500">No notes match your filters.</div>}
      </div>
    </div>
  );
}
