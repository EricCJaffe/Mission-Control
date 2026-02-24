"use client";

import { useEffect } from "react";
import BookInsightsClient from "@/components/BookInsightsClient";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

type ChapterOption = {
  id: string;
  title: string;
  position: number | null;
};

type BookOption = {
  id: string;
  title: string;
};

type ChatThread = {
  id: string;
  created_at: string;
};

type ChatMessage = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
};

export default function BookAiCompanionClient({
  bookId,
  chapterOptions,
  books,
  chatThreads,
  chatMessages,
  toast,
}: {
  bookId: string;
  chapterOptions: ChapterOption[];
  books: BookOption[];
  chatThreads: ChatThread[];
  chatMessages: ChatMessage[];
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
    if (toast === "place_ready") {
      pushToast({ title: "Concept placement ready", description: "Review the proposal in the AI Proposal Queue." });
    }
    if (toast === "place_failed") {
      pushToast({ title: "Concept placement failed", description: "AI response could not be parsed. Try again." });
    }
    if (toast === "refs_ready") {
      pushToast({ title: "Reference fixes ready", description: "Review them in the AI Proposal Queue." });
    }
    if (toast === "refs_none") {
      pushToast({ title: "No reference fixes needed", description: "AI did not return any changes." });
    }
    if (toast === "inline_ready") {
      pushToast({ title: "Inline review complete", description: "Review comments in the queue below." });
    }
  }, [toast, pushToast]);

  const toolCards = [
    { id: "reorder-dialog", title: "AI Reorder Plan", body: "Propose a better chapter order and updated flow." },
    { id: "toc-dialog", title: "AI Table of Contents", body: "Generate a structured TOC from the book concept." },
    { id: "dup-dialog", title: "Duplicate Scan", body: "Find redundant passages across chapters." },
    { id: "bulk-dialog", title: "AI Bulk Edit", body: "Apply consistent edits across all chapters." },
    { id: "merge-dialog", title: "AI Merge Chapters", body: "Merge a source chapter into a target chapter." },
    { id: "repair-dialog", title: "Repair References", body: "Fix internal chapter references after reordering." },
    { id: "inline-dialog", title: "AI Inline Review", body: "Generate anchored inline review comments." },
    { id: "normalize-dialog", title: "Normalize Titles", body: "Standardize chapter numbering + titles." },
    { id: "place-dialog", title: "Place Concept", body: "Insert a concept into the best chapter." },
  ];

  return (
    <>
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">AI Insights (Book)</h2>
              <p className="mt-1 text-xs text-slate-500">Ask about themes, gaps, or next edits.</p>
            </div>
            <div className="min-w-[220px]">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">Book</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={bookId}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next) window.location.href = `/books/${next}/ai`;
                }}
              >
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <BookInsightsClient bookId={bookId} threads={chatThreads} messages={chatMessages} />
        </div>

        <div className="grid gap-3">
          <div className="text-xs uppercase tracking-widest text-slate-500">AI Tools</div>
          <div className="grid gap-3 md:grid-cols-2">
            {toolCards.map((tool) => (
              <button
                key={tool.id}
                className="rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-left text-sm font-medium shadow-sm hover:border-slate-300"
                type="button"
                onClick={() => (document.getElementById(tool.id) as HTMLDialogElement)?.showModal()}
              >
                <div className="font-semibold">{tool.title}</div>
                <div className="mt-1 text-xs text-slate-500">{tool.body}</div>
              </button>
            ))}
          </div>
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

      <dialog id="inline-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">AI Inline Review</h3>
          <p className="mt-1 text-xs text-slate-500">Generate anchored inline review comments across the whole book.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/inline-review" method="post" data-progress="true" data-toast="Inline review started">
            <input type="hidden" name="book_id" value={bookId} />
            <textarea className="min-h-[100px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="prompt" placeholder="Optional: focus on clarity, tone, or theological consistency" />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Run Inline Review
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
                Generate TOC
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="dup-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Duplicate Scan</h3>
          <p className="mt-1 text-xs text-slate-500">Find repeated ideas or redundant passages.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/duplicates" method="post" data-progress="true" data-toast="Duplicate scan started">
            <input type="hidden" name="book_id" value={bookId} />
            <textarea className="min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="prompt" placeholder="Optional: focus on certain chapters or topics" />
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
          <p className="mt-1 text-xs text-slate-500">Apply a consistent edit across every chapter.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/bulk" method="post" data-progress="true" data-toast="Bulk edit started">
            <input type="hidden" name="book_id" value={bookId} />
            <textarea className="min-h-[100px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="prompt" placeholder="E.g. tighten intro paragraphs, add transitions, enforce tone..." required />
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
          <h3 className="text-lg font-semibold">Repair References</h3>
          <p className="mt-1 text-xs text-slate-500">Fix internal chapter references after reordering.</p>
          <form className="mt-4 grid gap-3" action="/books/ai/repair-references" method="post" data-progress="true" data-toast="Reference repair started">
            <input type="hidden" name="book_id" value={bookId} />
            <textarea className="min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="prompt" placeholder="Optional: focus on specific chapters or sections" />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Repair
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="normalize-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Normalize Titles</h3>
          <p className="mt-1 text-xs text-slate-500">Standardize chapter titles and numbering.</p>
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
            <textarea className="min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="instruction" placeholder="Optional: placement or tone notes" />
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
    </>
  );
}
