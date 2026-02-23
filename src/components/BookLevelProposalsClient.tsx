"use client";

import { diffLines } from "diff";

type Proposal = {
  id: string;
  proposal_type: string;
  payload: any;
};

type Chapter = {
  id: string;
  title: string;
  markdown_current: string | null;
};

export default function BookLevelProposalsClient({
  proposals,
  chapterMap,
  bookId,
}: {
  proposals: Proposal[];
  chapterMap: Record<string, Chapter>;
  bookId: string;
}) {
  if (!proposals || proposals.length === 0) {
    return <div className="mt-3 text-xs text-slate-500">No book-level proposals pending.</div>;
  }

  return (
    <div className="mt-4 grid gap-3 text-sm">
      {proposals.map((proposal) => {
        const payload = proposal.payload || {};
        const orderedIds = Array.isArray(payload?.ordered_ids) ? payload.ordered_ids : [];
        const tocItems = Array.isArray(payload?.toc) ? payload.toc : [];
        const mergePlan = Array.isArray(payload?.merge_plan) ? payload.merge_plan : [];
        const sourceId = payload?.source_id as string | undefined;
        const targetId = payload?.target_id as string | undefined;
        const mergedMarkdown = payload?.merged_markdown as string | undefined;
        const targetMarkdown = targetId ? chapterMap[targetId]?.markdown_current || "" : "";
        const diff = mergedMarkdown ? diffLines(targetMarkdown, mergedMarkdown) : [];

        return (
          <div key={proposal.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-medium">{proposal.proposal_type}</div>
            {payload?.rationale && <div className="mt-1 text-xs text-slate-500">{payload.rationale}</div>}

            {proposal.proposal_type === "reorder" && orderedIds.length > 0 && (
              <div className="mt-2 text-xs text-slate-600">
                Proposed order:
                <ol className="mt-2 grid gap-1">
                  {orderedIds.map((cid: string, idx: number) => (
                    <li key={cid}>
                      Chapter {idx + 1}: {chapterMap[cid]?.title || "Untitled"}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {proposal.proposal_type === "reorder" && mergePlan.length > 0 && (
              <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium">Merge plan</summary>
                <div className="mt-2 grid gap-2 text-slate-600">
                  {mergePlan.map((merge: any, idx: number) => (
                    <div key={`${merge.source_id}-${merge.target_id}-${idx}`}>
                      <div className="font-medium text-slate-800">
                        Merge: {chapterMap[merge.source_id]?.title || "Source chapter"} →{" "}
                        {chapterMap[merge.target_id]?.title || "Target chapter"}
                      </div>
                      {merge.summary && <div className="mt-1">Summary: {merge.summary}</div>}
                      {merge.integration_notes && <div className="mt-1">Notes: {merge.integration_notes}</div>}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {proposal.proposal_type === "reorder" && tocItems.length > 0 && (
              <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium">Proposed TOC</summary>
                <ol className="mt-2 grid gap-2 text-slate-600">
                  {tocItems.map((item: any, idx: number) => (
                    <li key={`${item.id || idx}`}>
                      <div className="font-medium text-slate-800">
                        {idx + 1}. {item.title || chapterMap[item.id]?.title || "Untitled"}
                      </div>
                      {item.summary && <div className="mt-1">{item.summary}</div>}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {proposal.proposal_type === "merge" && (
              <div className="mt-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">
                  Merge: {chapterMap[sourceId || ""]?.title || "Source chapter"} →{" "}
                  {chapterMap[targetId || ""]?.title || "Target chapter"}
                </div>
                {payload?.summary && <div className="mt-1">Summary: {payload.summary}</div>}
                {payload?.integration_notes && <div className="mt-1">Notes: {payload.integration_notes}</div>}
                {mergedMarkdown && (
                  <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer font-medium text-slate-800">Preview merged diff</summary>
                    <div className="mt-2 font-mono text-[11px] leading-relaxed">
                      {diff.map((part, idx) => {
                        const color = part.added
                          ? "text-emerald-700 bg-emerald-50"
                          : part.removed
                          ? "text-red-700 bg-red-50"
                          : "text-slate-600";
                        return (
                          <div key={idx} className={`${color} whitespace-pre-wrap`}>
                            {part.value}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <form action="/books/book-proposals/apply" method="post" data-progress="true" data-toast="Applying proposal">
                <input type="hidden" name="proposal_id" value={proposal.id} />
                <input type="hidden" name="redirect" value={`/books/${bookId}?tab=outline`} />
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                  Apply
                </button>
              </form>
              <form action="/books/book-proposals/reject" method="post" data-toast="Proposal rejected">
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
