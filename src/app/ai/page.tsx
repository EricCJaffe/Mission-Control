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
    .select("id,book_id,proposal_type,created_at,status")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

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
                <div className="text-slate-500">{new Date(proposal.created_at).toLocaleString()}</div>
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
              </div>
            ))}
            {(!chapterProposals || chapterProposals.length === 0) && (
              <div className="text-slate-500">No pending chapter proposals.</div>
            )}
          </div>
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
