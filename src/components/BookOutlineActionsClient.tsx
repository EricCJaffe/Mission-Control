"use client";

type ChapterOption = {
  id: string;
  title: string;
  position: number | null;
};

export default function BookOutlineActionsClient({
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
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
          type="button"
          onClick={() => (document.getElementById("chapter-dialog") as HTMLDialogElement)?.showModal()}
        >
          Add Chapter
        </button>
        <button
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
          type="button"
          onClick={() => (document.getElementById("section-dialog") as HTMLDialogElement)?.showModal()}
        >
          Add Section Break
        </button>
      </div>

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
