"use client";

import { useMemo, useState } from "react";

type Comment = {
  id: string;
  chapter_id: string;
  comment: string | null;
  suggested_patch: string | null;
  anchor_text: string | null;
  created_at: string;
};

type ChapterMap = Record<
  string,
  { title?: string | null; book_id?: string | null }
>;

type Props = {
  comments: Comment[];
  chapterMap: ChapterMap;
  redirect?: string;
};

export default function InlineReviewQueueClient({ comments, chapterMap, redirect = "/ai" }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allSelected = selectedIds.length > 0 && selectedIds.length === comments.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(comments.map((comment) => comment.id));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const selectedInputs = useMemo(
    () => selectedIds.map((id) => <input key={id} type="hidden" name="comment_ids" value={id} />),
    [selectedIds]
  );

  if (!comments || comments.length === 0) {
    return <div className="text-slate-500">No inline comments pending.</div>;
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          className="rounded-full border border-slate-200 bg-white px-3 py-1"
          type="button"
          onClick={toggleAll}
        >
          {allSelected ? "Clear All" : "Select All"}
        </button>
        <form action="/books/chapters/comments/bulk-apply" method="post" data-progress="true" data-toast="Applying inline comments">
          {selectedInputs}
          <input type="hidden" name="redirect" value={redirect} />
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1 disabled:opacity-60"
            type="submit"
            disabled={selectedIds.length === 0}
          >
            Apply Selected
          </button>
        </form>
        <form action="/books/chapters/comments/bulk-reject" method="post" data-toast="Rejecting inline comments">
          {selectedInputs}
          <input type="hidden" name="redirect" value={redirect} />
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1 disabled:opacity-60"
            type="submit"
            disabled={selectedIds.length === 0}
          >
            Reject Selected
          </button>
        </form>
        <form action="/books/chapters/comments/bulk-apply" method="post" data-progress="true" data-toast="Applying inline comments">
          {comments.map((comment) => (
            <input key={comment.id} type="hidden" name="comment_ids" value={comment.id} />
          ))}
          <input type="hidden" name="redirect" value={redirect} />
          <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
            Apply All
          </button>
        </form>
        <form action="/books/chapters/comments/bulk-reject" method="post" data-toast="Rejecting inline comments">
          {comments.map((comment) => (
            <input key={comment.id} type="hidden" name="comment_ids" value={comment.id} />
          ))}
          <input type="hidden" name="redirect" value={redirect} />
          <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
            Reject All
          </button>
        </form>
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  checked={selectedIds.includes(comment.id)}
                  onChange={() => toggleOne(comment.id)}
                />
                <div>
                  <div className="font-medium">{comment.comment || "Editor note"}</div>
                  {comment.anchor_text && (
                    <div className="mt-1 text-[11px] text-slate-500">Anchor: {comment.anchor_text}</div>
                  )}
                  {comment.suggested_patch && (
                    <div className="mt-1 text-[11px] text-slate-600 whitespace-pre-wrap">
                      Suggested: {comment.suggested_patch}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-slate-500">
                    {chapterMap[comment.chapter_id]?.title
                      ? `Chapter: ${chapterMap[comment.chapter_id]?.title}`
                      : "Chapter comment"} · {new Date(comment.created_at).toLocaleString()}
                  </div>
                </div>
              </label>
              <div className="flex flex-wrap gap-2 text-xs">
                {comment.suggested_patch ? (
                  <form action="/books/chapters/comments/apply" method="post" data-progress="true" data-toast="Applying suggestion">
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <input type="hidden" name="chapter_id" value={comment.chapter_id} />
                    <input type="hidden" name="redirect" value={redirect} />
                    <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                      Apply
                    </button>
                  </form>
                ) : (
                  <form action="/books/chapters/comments/suggest" method="post" data-progress="true" data-toast="Suggestion queued">
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <input type="hidden" name="chapter_id" value={comment.chapter_id} />
                    <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                      AI Suggest
                    </button>
                  </form>
                )}
                <form action="/books/chapters/comments/reject" method="post" data-toast="Comment rejected">
                  <input type="hidden" name="comment_id" value={comment.id} />
                  <input type="hidden" name="redirect" value={redirect} />
                  <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                    Reject
                  </button>
                </form>
                {chapterMap[comment.chapter_id]?.book_id && (
                  <a
                    className="rounded-full border border-slate-200 bg-white px-3 py-1"
                    href={`/books/${chapterMap[comment.chapter_id].book_id}/chapters/${comment.chapter_id}`}
                  >
                    View Chapter
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
