import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AICompanionPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: books } = await supabase
    .from("books")
    .select("id,title")
    .order("created_at", { ascending: false });

  const { data: chapterProposals } = await supabase
    .from("chapter_proposals")
    .select("id,chapter_id,created_at,instruction,status")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: bookProposals } = await supabase
    .from("book_proposals")
    .select("id,book_id,proposal_type,created_at,status,payload")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const bookMap = Object.fromEntries((books || []).map((book) => [book.id, book]));

  const { data: chapterTitles } = await supabase
    .from("chapters")
    .select("id,book_id,title")
    .order("created_at", { ascending: false });

  const chapterMap = Object.fromEntries((chapterTitles || []).map((ch) => [ch.id, ch]));

  const { data: commentQueue } = await supabase
    .from("chapter_comments")
    .select("id,chapter_id,comment,anchor_text,suggested_patch,status,created_at")
    .or("status.is.null,status.eq.open")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">AI Companion</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor AI queues and navigate to review.</p>
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <div className="text-sm font-semibold">Book-level Proposals</div>
          <div className="mt-3 grid gap-2 text-xs">
            {(bookProposals || []).map((proposal) => (
              <div key={proposal.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="font-medium">{proposal.proposal_type}</div>
                <div className="text-[11px] text-slate-500">
                  {bookMap[proposal.book_id]?.title || "Book"}
                </div>
                <div className="text-slate-500">{new Date(proposal.created_at).toLocaleString()}</div>
                {proposal.proposal_type === "reorder" && Array.isArray((proposal.payload as any)?.ordered_ids) && (
                  <div className="mt-2 text-[11px] text-slate-600">
                    Proposed order: {((proposal.payload as any).ordered_ids as string[]).length} chapters
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <form action="/books/book-proposals/apply" method="post" data-progress="true" data-toast="Applying proposal">
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <input type="hidden" name="redirect" value="/ai" />
                    <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                      Apply
                    </button>
                  </form>
                  <form action="/books/book-proposals/reject" method="post" data-toast="Proposal rejected">
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <input type="hidden" name="redirect" value="/ai" />
                    <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                      Reject
                    </button>
                  </form>
                  <a className="rounded-full border border-slate-200 bg-white px-3 py-1" href={`/books/${proposal.book_id}?tab=outline`}>
                    View Book
                  </a>
                </div>
              </div>
            ))}
            {(!bookProposals || bookProposals.length === 0) && (
              <div className="text-slate-500">No pending book proposals.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <div className="text-sm font-semibold">Chapter Proposals</div>
          <div className="mt-3 grid gap-2 text-xs">
            {(chapterProposals || []).map((proposal) => (
              <div key={proposal.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="font-medium">{proposal.instruction || "AI proposal"}</div>
                <div className="text-slate-500">{new Date(proposal.created_at).toLocaleString()}</div>
                <div className="mt-2 text-[11px] text-slate-600">
                  {chapterMap[proposal.chapter_id]?.title ? `Chapter: ${chapterMap[proposal.chapter_id]?.title}` : "Chapter proposal"}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <form action="/books/chapters/proposals/apply" method="post" data-progress="true" data-toast="Applying proposal">
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <input type="hidden" name="chapter_id" value={proposal.chapter_id} />
                    <input type="hidden" name="redirect" value="/ai" />
                    <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                      Apply
                    </button>
                  </form>
                  <form action="/books/chapters/proposals/reject" method="post" data-toast="Proposal rejected">
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <input type="hidden" name="redirect" value="/ai" />
                    <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                      Reject
                    </button>
                  </form>
                  {chapterMap[proposal.chapter_id]?.book_id && (
                    <>
                      <a className="rounded-full border border-slate-200 bg-white px-3 py-1" href={`/books/${chapterMap[proposal.chapter_id].book_id}?tab=outline`}>
                        View Book
                      </a>
                      <a className="rounded-full border border-slate-200 bg-white px-3 py-1" href={`/books/${chapterMap[proposal.chapter_id].book_id}/chapters/${proposal.chapter_id}`}>
                        View Chapter
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
            {(!chapterProposals || chapterProposals.length === 0) && (
              <div className="text-slate-500">No pending chapter proposals.</div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="text-sm font-semibold">Inline Review Queue</div>
        <p className="mt-1 text-xs text-slate-500">Anchored editor comments waiting for review.</p>
        <div className="mt-3 grid gap-2 text-xs">
          {(commentQueue || []).map((comment) => (
            <div key={comment.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="font-medium">{comment.comment || "Editor note"}</div>
              {comment.anchor_text && (
                <div className="mt-1 text-[11px] text-slate-500">Anchor: {comment.anchor_text}</div>
              )}
              {comment.suggested_patch && (
                <div className="mt-1 text-[11px] text-slate-600">Suggested: {comment.suggested_patch.slice(0, 140)}…</div>
              )}
              <div className="mt-1 text-[11px] text-slate-500">
                {chapterMap[comment.chapter_id]?.title ? `Chapter: ${chapterMap[comment.chapter_id]?.title}` : "Chapter comment"} ·{" "}
                {new Date(comment.created_at).toLocaleString()}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {comment.suggested_patch ? (
                  <form action="/books/chapters/comments/apply" method="post" data-progress="true" data-toast="Applying suggestion">
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <input type="hidden" name="chapter_id" value={comment.chapter_id} />
                    <input type="hidden" name="redirect" value="/ai" />
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
                  <input type="hidden" name="redirect" value="/ai" />
                  <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                    Reject
                  </button>
                </form>
                {chapterMap[comment.chapter_id]?.book_id && (
                  <a className="rounded-full border border-slate-200 bg-white px-3 py-1" href={`/books/${chapterMap[comment.chapter_id].book_id}/chapters/${comment.chapter_id}`}>
                    View Chapter
                  </a>
                )}
              </div>
            </div>
          ))}
          {(!commentQueue || commentQueue.length === 0) && (
            <div className="text-slate-500">No inline comments pending.</div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="text-sm font-semibold">Books</div>
        <div className="mt-3 grid gap-2 text-sm">
          {(books || []).map((book) => (
            <a key={book.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2" href={`/books/${book.id}?tab=outline`}>
              {book.title}
            </a>
          ))}
          {(!books || books.length === 0) && <div className="text-xs text-slate-500">No books yet.</div>}
        </div>
      </section>
    </main>
  );
}
