"use client";

import { useEffect } from "react";
import BookInsightsClient from "@/components/BookInsightsClient";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

type ChapterOption = {
  id: string;
  title: string;
  position: number | null;
};

export default function BookPageClient({
  bookId,
  chapterOptions,
  toast,
}: {
  bookId: string;
  chapterOptions: ChapterOption[];
  toast?: string | null;
}) {
  const options = chapterOptions.length
    ? chapterOptions
    : [{ id: "start", title: "Start", position: 1 }];
  const { pushToast } = useUiFeedback();

  useEffect(() => {
    if (!toast) return;
    if (toast === "reorder_failed") {
      pushToast({ title: "Reorder failed", description: "AI response could not be parsed. Try again." });
    }
    if (toast === "reorder_ready") {
      pushToast({ title: "Reorder proposal ready", description: "Review it below before applying." });
    }
    if (toast === "merge_ready") {
      pushToast({ title: "Merge proposal ready", description: "Review it below before applying." });
    }
    if (toast === "merge_failed") {
      pushToast({ title: "Merge failed", description: "AI response could not be parsed. Try again." });
    }
    if (toast === "duplicates_ready") {
      pushToast({ title: "Duplicate proposals ready", description: "Review them in the AI Proposal Queue below." });
    }
    if (toast === "duplicates_none") {
      pushToast({ title: "No duplicates found", description: "AI did not return any edits. Try a more specific prompt." });
    }
  }, [toast, pushToast]);

  return (
    <>
      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <div className="grid gap-3">
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("reorder-dialog") as HTMLDialogElement)?.showModal()}
          >
            AI Reorder Plan
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("toc-dialog") as HTMLDialogElement)?.showModal()}
          >
            AI Table of Contents
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("dup-dialog") as HTMLDialogElement)?.showModal()}
          >
            Duplicate Scan
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("bulk-dialog") as HTMLDialogElement)?.showModal()}
          >
            AI Bulk Edit
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("merge-dialog") as HTMLDialogElement)?.showModal()}
          >
            AI Merge Chapters
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("repair-dialog") as HTMLDialogElement)?.showModal()}
          >
            Repair References
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("normalize-dialog") as HTMLDialogElement)?.showModal()}
          >
            Normalize Titles
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("place-dialog") as HTMLDialogElement)?.showModal()}
          >
            Place Concept
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("chapter-dialog") as HTMLDialogElement)?.showModal()}
          >
            Add Chapter
          </button>
          <button
            className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
            type="button"
            onClick={() => (document.getElementById("section-dialog") as HTMLDialogElement)?.showModal()}
          >
            Add Section Break
          </button>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">AI Insights (Book)</h2>
          <p className="mt-1 text-xs text-slate-500">Ask about themes, gaps, or next edits.</p>
          <BookInsightsClient bookId={bookId} />
        </div>
      </section>

      <dialog id="reorder-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">AI Reorder Plan</h3>
          <p className="mt-1 text-xs text-slate-500">Ask AI to propose a better chapter order and updated TOC.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/reorder" method="post" data-progress="true" data-toast="Reorder plan requested">
            <input type="hidden" name="book_id" value={bookId} />
            <textarea className="min-h-[100px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="prompt" placeholder="Optional: focus on reader flow, tighten pacing, move theology earlier..." />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Generate Plan
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="merge-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">AI Merge Chapters</h3>
          <p className="mt-1 text-xs text-slate-500">Merge a source chapter into a target chapter. Source will be archived on apply.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/merge" method="post" data-progress="true" data-toast="Merge proposal requested">
            <input type="hidden" name="book_id" value={bookId} />
            <label className="text-xs text-slate-600">
              Source chapter (to merge + archive)
              <select name="source_id" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" required>
                <option value="">Select source</option>
                {options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.position ? `${opt.position}. ` : ""}{opt.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Target chapter (will receive merged content)
              <select name="target_id" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" required>
                <option value="">Select target</option>
                {options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.position ? `${opt.position}. ` : ""}{opt.title}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="min-h-[100px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              name="prompt"
              placeholder="Optional: instructions for how to merge, tone, or structure"
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
                Generate Merge
              </button>
            </div>
          </form>
        </div>
      </dialog>

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

      <dialog id="dup-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Duplicate Scan</h3>
          <p className="mt-1 text-xs text-slate-500">Find redundant content and propose cleanup edits.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/duplicates" method="post" data-progress="true" data-toast="Duplicate scan started">
            <input type="hidden" name="book_id" value={bookId} />
            <textarea className="min-h-[100px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="prompt" placeholder="Optional: focus on cutting repetition and tightening flow..." />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Run Scan
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

      <dialog id="repair-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Repair Chapter References</h3>
          <p className="mt-1 text-xs text-slate-500">Update “Chapter X” references to match the current order.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/repair-references" method="post" data-progress="true" data-toast="Reference repair started">
            <input type="hidden" name="book_id" value={bookId} />
            <textarea className="min-h-[100px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="prompt" placeholder="Optional: only update hard references, ignore soft mentions..." />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Run Repair
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="normalize-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Normalize Chapter Titles</h3>
          <p className="mt-1 text-xs text-slate-500">Remove leading “Chapter X” from titles and keep numbering separate.</p>
          <form className="mt-4 grid gap-3" action="/books/chapters/normalize" method="post" data-progress="true" data-toast="Normalizing titles">
            <input type="hidden" name="book_id" value={bookId} />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Normalize
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
