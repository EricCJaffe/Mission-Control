"use client";

export default function BooksPageClient() {
  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
          type="button"
          onClick={() => {
            const dialog = document.getElementById("add-book-dialog") as HTMLDialogElement | null;
            dialog?.showModal();
          }}
        >
          Add Book
        </button>
        <button
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
          type="button"
          onClick={() => {
            const dialog = document.getElementById("upload-book-dialog") as HTMLDialogElement | null;
            dialog?.showModal();
          }}
        >
          Upload & Build Chapters
        </button>
      </div>

      <dialog id="add-book-dialog" className="rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h2 className="text-lg font-semibold">Add Book</h2>
          <form className="mt-4 grid gap-3" action="/books/new" method="post" data-toast="Book created">
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Book title" required />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="description" placeholder="Short description" />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              name="target_word_count"
              placeholder="Target word count (e.g. 50000)"
              type="number"
              min="0"
            />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Create
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="upload-book-dialog" className="rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h2 className="text-lg font-semibold">Upload Manuscript</h2>
          <p className="mt-1 text-xs text-slate-500">DOCX or Markdown up to 50MB.</p>
          <form className="mt-4 grid gap-3" action="/books/upload" method="post" encType="multipart/form-data" data-progress="true" data-toast="Upload started">
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="file" type="file" accept=".docx,.md,text/markdown" required />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="title" placeholder="Book title (optional, inferred if omitted)" />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="description" placeholder="Short description (optional)" />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="target_word_count" placeholder="Target word count" type="number" min="0" />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Upload
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
