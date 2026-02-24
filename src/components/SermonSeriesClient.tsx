"use client";

import { useState } from "react";
import RtfEditor from "@/components/RtfEditor";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

type Series = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: string | null;
  theme: string | null;
  start_date: string | null;
  end_date: string | null;
};

type Sermon = {
  id: string;
  title: string;
  status: string | null;
  position: number | null;
  outline_md: string | null;
  manuscript_md: string | null;
  preach_date: string | null;
  key_text: string | null;
  big_idea: string | null;
  word_count: number;
};

type Asset = {
  id: string;
  asset_type: string;
  status: string | null;
  content_md: string;
  created_at: string;
};

type BookOption = {
  id: string;
  title: string;
};

export default function SermonSeriesClient({
  series,
  sermons,
  books,
  assets,
  tab,
}: {
  series: Series;
  sermons: Sermon[];
  books: BookOption[];
  assets: Asset[];
  tab: string;
}) {
  const { pushToast } = useUiFeedback();
  const [seriesTitle, setSeriesTitle] = useState(series.title);
  const [seriesSubtitle, setSeriesSubtitle] = useState(series.subtitle || "");
  const [seriesStatus, setSeriesStatus] = useState(series.status || "planning");
  const [seriesTheme, setSeriesTheme] = useState(series.theme || "");
  const [seriesDescription, setSeriesDescription] = useState(series.description || "");

  const [newSermonTitle, setNewSermonTitle] = useState("");
  const [newSermonPreachDate, setNewSermonPreachDate] = useState("");

  const [editingSermon, setEditingSermon] = useState<Sermon | null>(null);
  const [outlineDraft, setOutlineDraft] = useState("");
  const [manuscriptDraft, setManuscriptDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");
  const [manualBookId, setManualBookId] = useState("");

  function openSermon(sermon: Sermon) {
    setEditingSermon(sermon);
    setOutlineDraft(sermon.outline_md || "");
    setManuscriptDraft(sermon.manuscript_md || "");
    setNotesDraft("");
    (document.getElementById("edit-sermon-dialog") as HTMLDialogElement | null)?.showModal();
  }

  return (
    <section className="mt-6 grid gap-6">
      <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Series Details</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" action="/sermons/update" method="post" data-toast="Series updated">
          <input type="hidden" name="id" value={series.id} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" value={seriesTitle} onChange={(e) => setSeriesTitle(e.target.value)} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="subtitle" value={seriesSubtitle} onChange={(e) => setSeriesSubtitle(e.target.value)} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="theme" value={seriesTheme} onChange={(e) => setSeriesTheme(e.target.value)} placeholder="Theme / big idea" />
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="status" value={seriesStatus} onChange={(e) => setSeriesStatus(e.target.value)}>
            <option value="planning">planning</option>
            <option value="writing">writing</option>
            <option value="review">review</option>
            <option value="delivered">delivered</option>
            <option value="archive">archive</option>
          </select>
          <textarea className="md:col-span-2 min-h-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2" name="description" value={seriesDescription} onChange={(e) => setSeriesDescription(e.target.value)} />
          <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Save Series
          </button>
        </form>
      </div>

      {tab === "outline" && (
        <div className="grid gap-6">
          <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Sermons</h2>
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                type="button"
                onClick={() => (document.getElementById("new-sermon-dialog") as HTMLDialogElement | null)?.showModal()}
              >
                Add Sermon
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              {sermons.map((sermon) => (
                <div key={sermon.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{sermon.title}</div>
                      <div className="text-xs text-slate-500">
                        Status: {sermon.status || "outline"} · Preach: {sermon.preach_date || "n/a"}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{sermon.word_count} words</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      type="button"
                      onClick={() => openSermon(sermon)}
                    >
                      Edit
                    </button>
                    <form action="/sermons/sermon/delete" method="post" data-toast="Sermon deleted">
                      <input type="hidden" name="id" value={sermon.id} />
                      <input type="hidden" name="series_id" value={series.id} />
                      <button className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              {sermons.length === 0 && <div className="text-xs text-slate-500">No sermons yet.</div>}
            </div>
          </section>
        </div>
      )}

      {tab === "assets" && (
        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Generated Assets</h2>
          <div className="mt-3 grid gap-3 text-sm">
            {assets.map((asset) => (
              <div key={asset.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{asset.asset_type}</div>
                  <div className="text-xs text-slate-500">Status: {asset.status || "draft"}</div>
                </div>
                <div className="mt-2 text-xs text-slate-500">{new Date(asset.created_at).toLocaleString()}</div>
                <div className="mt-2 whitespace-pre-line text-sm">{asset.content_md}</div>
              </div>
            ))}
            {assets.length === 0 && <div className="text-xs text-slate-500">No assets generated yet.</div>}
          </div>
        </section>
      )}

      {tab === "ai" && (
        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">AI Tools</h2>
          <div className="mt-3 grid gap-2 text-xs text-slate-500">
            <div>Use the buttons below to generate outlines and downstream resources.</div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <form action="/sermons/ai/outline-series" method="post" data-progress="true" data-toast="Series outline queued">
              <input type="hidden" name="series_id" value={series.id} />
              <button className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="submit">
                Generate Series Outline
              </button>
            </form>
            <form action="/sermons/ai/series-to-book" method="post" data-progress="true" data-toast="Book outline proposal queued">
              <input type="hidden" name="series_id" value={series.id} />
              <button className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="submit">
                Convert Series → Book Outline
              </button>
            </form>
            <form action="/sermons/ai/book-to-series" method="post" data-progress="true" data-toast="Series outline queued">
              <input type="hidden" name="series_id" value={series.id} />
              <label className="grid gap-1 text-xs text-slate-500">
                Select Book
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  name="book_id_select"
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value)}
                >
                  <option value="">Choose a book</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                Or paste Book ID
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  name="book_id"
                  placeholder="Paste book ID"
                  value={manualBookId}
                  onChange={(e) => setManualBookId(e.target.value)}
                />
              </label>
              <button className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="submit">
                Convert Book → Series
              </button>
            </form>
            <form action="/sermons/ai/generate-assets" method="post" data-progress="true" data-toast="Assets queued">
              <input type="hidden" name="series_id" value={series.id} />
              <button className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="submit">
                Generate Guides + Social Pack
              </button>
            </form>
          </div>
        </section>
      )}

      <dialog id="new-sermon-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Add Sermon</h3>
          <form
            className="mt-4 grid gap-3"
            action="/sermons/sermon/new"
            method="post"
            data-toast="Sermon created"
            onSubmit={() => {
              pushToast({ title: "Sermon created", description: "Opening the new sermon..." });
            }}
          >
            <input type="hidden" name="series_id" value={series.id} />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              name="title"
              placeholder="Sermon title"
              required
              value={newSermonTitle}
              onChange={(e) => setNewSermonTitle(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              name="preach_date"
              type="date"
              value={newSermonPreachDate}
              onChange={(e) => setNewSermonPreachDate(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="button" onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}>
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Save Sermon
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="edit-sermon-dialog" className="w-[92vw] max-w-4xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">{editingSermon?.title || "Sermon"}</h3>
              <div className="text-xs text-slate-500">Outline-first editing</div>
            </div>
          </div>
          {editingSermon && (
            <form className="mt-4 grid gap-3" action="/sermons/sermon/update" method="post" data-toast="Sermon saved">
              <input type="hidden" name="id" value={editingSermon.id} />
              <input type="hidden" name="series_id" value={series.id} />
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" defaultValue={editingSermon.title} />
              <div className="grid gap-3 md:grid-cols-3">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="preach_date" type="date" defaultValue={editingSermon.preach_date || ""} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="key_text" placeholder="Key text" defaultValue={editingSermon.key_text || ""} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="big_idea" placeholder="Big idea" defaultValue={editingSermon.big_idea || ""} />
              </div>
              <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="status" defaultValue={editingSermon.status || "outline"}>
                <option value="outline">outline</option>
                <option value="draft">draft</option>
                <option value="review">review</option>
                <option value="delivered">delivered</option>
                <option value="archive">archive</option>
              </select>
              <input type="hidden" name="outline_md" value={outlineDraft} />
              <input type="hidden" name="manuscript_md" value={manuscriptDraft} />
              <input type="hidden" name="notes_md" value={notesDraft} />
              <div>
                <label className="text-xs text-slate-500">Outline</label>
                <RtfEditor value={outlineDraft} onChange={setOutlineDraft} placeholder="Outline bullets, points, scripture..." minHeight="200px" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Manuscript (optional)</label>
                <RtfEditor value={manuscriptDraft} onChange={setManuscriptDraft} placeholder="Manuscript text..." minHeight="200px" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Notes</label>
                <RtfEditor value={notesDraft} onChange={setNotesDraft} placeholder="Personal notes, illustrations..." minHeight="160px" />
              </div>
              <div className="flex justify-end gap-2">
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="button" onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement | null)?.close()}>
                  Close
                </button>
                <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                  Save Sermon
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </section>
  );
}
