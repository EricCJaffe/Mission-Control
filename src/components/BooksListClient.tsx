"use client";

import Link from "next/link";
import { useState } from "react";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

type Book = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  target_word_count: number | null;
};

export default function BooksListClient({
  books,
  wordTotals,
}: {
  books: Book[];
  wordTotals: Record<string, number>;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const { startProgress } = useUiFeedback();

  function handleDelete(id: string) {
    const ok = window.confirm("Delete this book and all chapters? This cannot be undone.");
    if (!ok) return;
    setDeleting(id);
    startProgress();
    window.sessionStorage.setItem("mc:toast", "Book deletion started");
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/books/delete";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "id";
    input.value = id;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div className="mt-6 grid gap-3">
      {books.map((book) => {
        const total = wordTotals[book.id] || 0;
        const target = book.target_word_count || 0;
        const progress = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
        return (
          <div key={book.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/books/${book.id}`} className="text-base font-semibold">
                  {book.title}
                </Link>
                <div className="mt-1 text-xs text-slate-500">{book.description || "No description"}</div>
                <div className="mt-2 text-xs text-slate-500">
                  Status: <span className="font-medium text-slate-700">{book.status || "planning"}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-xs">
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1"
                  type="button"
                  onClick={() => handleDelete(book.id)}
                  disabled={deleting === book.id}
                >
                  {deleting === book.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{total.toLocaleString()} words</span>
                <span>{target ? `${progress}% of ${target.toLocaleString()}` : "No target set"}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        );
      })}
      {books.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
          No books yet. Create your first manuscript above.
        </div>
      )}
    </div>
  );
}
