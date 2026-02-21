"use client";

import { useMemo, useState } from "react";

type Chapter = {
  id: string;
  title: string;
  status: string | null;
  position: number | null;
  wordCount: number;
};

type Section = {
  id: string;
  title: string;
  position: number | null;
};

type Props = {
  bookId: string;
  chapters: Chapter[];
  sections: Section[];
};

export default function BookChaptersBoard({ bookId, chapters, sections }: Props) {
  const [order, setOrder] = useState(chapters);
  const ordered = useMemo(() => [...order].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [order]);
  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [sections]
  );

  function onDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.setData("text/plain", id);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) return;

    const next = [...ordered];
    const sourceIndex = next.findIndex((c) => c.id === sourceId);
    const targetIndex = next.findIndex((c) => c.id === targetId);
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);

    setOrder(next.map((c, idx) => ({ ...c, position: idx + 1 })));

    await fetch(`/books/${bookId}/chapters/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_ids: next.map((c) => c.id) }),
    });
  }

  function renderSectionsFor(position: number) {
    return orderedSections
      .filter((section) => (section.position ?? 0) === position)
      .map((section) => (
        <div key={section.id} className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-3 text-sm font-semibold text-slate-600">
          {section.title}
        </div>
      ));
  }

  const lastPosition = ordered.length ? Math.max(...ordered.map((c) => c.position ?? 0)) : 0;
  const remainingSections = orderedSections.filter((section) => (section.position ?? 0) > lastPosition);

  return (
    <div className="grid gap-3">
      {ordered.map((chapter) => (
        <div key={chapter.id} className="grid gap-3">
          {renderSectionsFor(chapter.position ?? 0)}
          <div
            draggable
            onDragStart={(e) => onDragStart(e, chapter.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, chapter.id)}
            className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-semibold">{chapter.title}</div>
                <div className="text-xs text-slate-500">
                  Status: {chapter.status || "outline"} · Words: {chapter.wordCount}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <a className="rounded-full border border-slate-200 bg-white px-3 py-1" href={`/books/${bookId}/chapters/${chapter.id}`}>
                  Open
                </a>
                <a className="rounded-full border border-slate-200 bg-white px-3 py-1" href={`/books/${bookId}/chapters/${chapter.id}/export`}>
                  Export
                </a>
                <form action={`/books/${bookId}/chapters/duplicate`} method="post">
                  <input type="hidden" name="chapter_id" value={chapter.id} />
                  <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                    Duplicate
                  </button>
                </form>
                <form action={`/books/${bookId}/chapters/delete`} method="post">
                  <input type="hidden" name="chapter_id" value={chapter.id} />
                  <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ))}
      {remainingSections.map((section) => (
        <div key={section.id} className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-3 text-sm font-semibold text-slate-600">
          {section.title}
        </div>
      ))}
      {ordered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
          No chapters yet. Add your first chapter below.
        </div>
      )}
    </div>
  );
}
