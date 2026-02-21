"use client";

import { diffLines } from "diff";

type Proposal = {
  id: string;
  chapter_id: string;
  instruction: string | null;
  proposed_markdown: string;
};

type Chapter = {
  id: string;
  title: string;
  markdown_current: string | null;
};

export default function BookProposalsClient({
  proposals,
  chapterMap,
  bookId,
}: {
  proposals: Proposal[];
  chapterMap: Record<string, Chapter>;
  bookId: string;
}) {
  if (proposals.length === 0) {
    return <div className="mt-3 text-xs text-slate-500">No pending AI proposals.</div>;
  }

  return (
    <div className="mt-3 grid gap-3 text-sm">
      {proposals.map((proposal) => {
        const chapter = chapterMap[proposal.chapter_id];
        const current = chapter?.markdown_current || "";
        const diff = diffLines(current, proposal.proposed_markdown || "");
        return (
          <div key={proposal.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="font-medium">{chapter?.title || "Chapter"}</div>
            <div className="mt-1 text-xs text-slate-500">{proposal.instruction || "AI proposal"}</div>
            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <summary className="cursor-pointer">Preview diff</summary>
              <div className="mt-2 font-mono text-[11px] leading-relaxed">
                {diff.map((part, idx) => {
                  const color = part.added ? "text-emerald-700 bg-emerald-50" : part.removed ? "text-red-700 bg-red-50" : "text-slate-600";
                  return (
                    <div key={idx} className={`${color} whitespace-pre-wrap`}>
                      {part.value}
                    </div>
                  );
                })}
              </div>
            </details>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <form action="/books/chapters/proposals/apply" method="post" data-progress="true" data-toast="Applying proposal">
                <input type="hidden" name="proposal_id" value={proposal.id} />
                <input type="hidden" name="chapter_id" value={proposal.chapter_id} />
                <input type="hidden" name="redirect" value={`/books/${bookId}?tab=outline`} />
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                  Apply
                </button>
              </form>
              <form action="/books/chapters/proposals/reject" method="post" data-toast="Proposal rejected">
                <input type="hidden" name="proposal_id" value={proposal.id} />
                <input type="hidden" name="redirect" value={`/books/${bookId}?tab=outline`} />
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                  Reject
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
