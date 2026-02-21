"use client";

import BookInsightsClient from "@/components/BookInsightsClient";

type ChapterOption = {
  id: string;
  title: string;
  position: number | null;
};

export default function BookPageClient({
  bookId,
  chapterOptions,
}: {
  bookId: string;
  chapterOptions: ChapterOption[];
}) {
  const options = chapterOptions.length
    ? chapterOptions
    : [{ id: "start", title: "Start", position: 1 }];

  return (
    <>
      <section className="mt-6 grid gap-4 xl:grid-cols-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <h2 className="text-sm font-semibold">AI Insights (Book)</h2>
          <p className="mt-1 text-xs text-slate-500">Ask about themes, gaps, or next edits.</p>
          <BookInsightsClient bookId={bookId} />
        </div>

        <button
          className="rounded-2xl border border-white/80 bg-white/70 p-4 text-left shadow-sm hover:border-slate-300"
          type="button"
          onClick={() => (document.getElementById("toc-dialog") as HTMLDialogElement)?.showModal()}
        >
          <div className="text-sm font-semibold">AI Table of Contents</div>
          <p className="mt-1 text-xs text-slate-500">Generate a chapter outline.</p>
        </button>

        <button
          className="rounded-2xl border border-white/80 bg-white/70 p-4 text-left shadow-sm hover:border-slate-300"
          type="button"
          onClick={() => (document.getElementById("bulk-dialog") as HTMLDialogElement)?.showModal()}
        >
          <div className="text-sm font-semibold">AI Bulk Edit</div>
          <p className="mt-1 text-xs text-slate-500">Apply changes across chapters.</p>
        </button>

        <button
          className="rounded-2xl border border-white/80 bg-white/70 p-4 text-left shadow-sm hover:border-slate-300"
          type="button"
          onClick={() => (document.getElementById("place-dialog") as HTMLDialogElement)?.showModal()}
        >
          <div className="text-sm font-semibold">Place Concept</div>
          <p className="mt-1 text-xs text-slate-500">Route text to best chapter.</p>
        </button>

        <button
          className="rounded-2xl border border-white/80 bg-white/70 p-4 text-left shadow-sm hover:border-slate-300"
          type="button"
          onClick={() => (document.getElementById("chapter-dialog") as HTMLDialogElement)?.showModal()}
        >
          <div className="text-sm font-semibold">Add Chapter</div>
          <p className="mt-1 text-xs text-slate-500">Create a new chapter.</p>
        </button>

        <button
          className="rounded-2xl border border-white/80 bg-white/70 p-4 text-left shadow-sm hover:border-slate-300"
          type="button"
          onClick={() => (document.getElementById("section-dialog") as HTMLDialogElement)?.showModal()}
        >
          <div className="text-sm font-semibold">Add Section Break</div>
          <p className="mt-1 text-xs text-slate-500">Group chapters into sections.</p>
        </button>
      </section>

      <dialog id="toc-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">AI Table of Contents</h3>
          <form className="mt-4 grid gap-3" action="/books/ai/toc" method="post" data-progress="true" data-toast="TOC generation started">
            <input type="hidden" name="book_id" value={bookId} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="concept" placeholder="Book concept or summary" required />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="count" type="number" min="1" placeholder="# Chapters" />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Generate
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="bulk-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">AI Bulk Edit</h3>
          <form className="mt-4 grid gap-3" action="/books/ai/bulk" method="post" data-progress="true" data-toast="Bulk edit started">
            <input type="hidden" name="book_id" value={bookId} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="instruction" placeholder="Add 3 reflection questions per chapter" required />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="mode" defaultValue="bulk-edit">
              <option value="bulk-edit">Bulk edit</option>
              <option value="editor-review">Editor review</option>
              <option value="reflection-questions">Reflection questions</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Run AI
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="place-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Place Concept</h3>
          <form className="mt-4 grid gap-3" action="/books/ai/place" method="post" data-progress="true" data-toast="Concept routing started">
            <input type="hidden" name="book_id" value={bookId} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="concept" placeholder="Paste concept to route" required />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Find Chapter
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="chapter-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Add Chapter</h3>
          <form className="mt-4 grid gap-3" action={`/books/${bookId}/chapters/new`} method="post" data-toast="Chapter added">
            <input type="hidden" name="book_id" value={bookId} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Chapter title" required />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="summary" placeholder="Summary / theme" />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="status" defaultValue="outline">
              <option value="outline">outline</option>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="final">final</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Add Chapter
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="section-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Add Section Break</h3>
          <form className="mt-4 grid gap-3" action={`/books/${bookId}/sections/new`} method="post" data-toast="Section added">
            <input type="hidden" name="book_id" value={bookId} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Section title" required />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="position" defaultValue="1">
              {options.map((ch, idx) => (
                <option key={ch.id} value={ch.position ?? idx + 1}>
                  Before: {ch.title || `Chapter ${idx + 1}`}
                </option>
              ))}
              <option value={options.length + 1}>After last chapter</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Add Section
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
