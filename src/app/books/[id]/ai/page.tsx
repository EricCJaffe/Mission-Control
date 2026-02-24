import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import BookAiCompanionClient from "@/components/BookAiCompanionClient";
import BookProposalsClient from "@/components/BookProposalsClient";
import BookLevelProposalsClient from "@/components/BookLevelProposalsClient";
import InlineReviewQueueClient from "@/components/InlineReviewQueueClient";

export const dynamic = "force-dynamic";

function wordCount(markdown?: string | null) {
  if (!markdown) return 0;
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export default async function BookAiCompanionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ toast?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const toast = resolvedSearch?.toast;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: books } = await supabase
    .from("books")
    .select("id,title")
    .order("created_at", { ascending: false });

  const { data: book } = await supabase
    .from("books")
    .select("id,title,description,status,target_word_count")
    .eq("id", id)
    .single();

  if (!book) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Book not found</h1>
      </main>
    );
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,status,position,markdown_current,word_count,section_id,book_id")
    .eq("book_id", id)
    .neq("status", "archive")
    .order("position", { ascending: true });

  const chapterMap = Object.fromEntries((chapters || []).map((ch) => [ch.id, ch]));
  const chapterList = (chapters || []).map((ch) => ({
    id: ch.id,
    title: ch.title,
    status: ch.status,
    position: ch.position,
    wordCount: ch.word_count ?? wordCount(ch.markdown_current),
  }));

  const chapterIds = (chapters || []).map((ch) => ch.id);
  const { data: proposals } = chapterIds.length
    ? await supabase
        .from("chapter_proposals")
        .select("id,chapter_id,instruction,status,created_at,proposed_markdown")
        .in("chapter_id", chapterIds)
        .eq("status", "pending")
    : { data: [] };

  const { data: bookProposals } = await supabase
    .from("book_proposals")
    .select("id,proposal_type,status,created_at,payload")
    .eq("book_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  let commentQuery = supabase
    .from("chapter_comments")
    .select("id,chapter_id,comment,anchor_text,suggested_patch,status,created_at")
    .in("chapter_id", chapterIds)
    .order("created_at", { ascending: false })
    .limit(50);

  commentQuery = commentQuery.or("status.is.null,status.eq.open");

  const { data: commentQueue } = chapterIds.length ? await commentQuery : { data: [] };

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">AI Companion</h1>
          <p className="mt-1 text-sm text-slate-500">
            {book.title} · {book.status || "planning"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" href={`/books/${book.id}?tab=outline`}>
            Back to Book
          </Link>
        </div>
      </div>

      <BookAiCompanionClient
        bookId={book.id}
        chapterOptions={chapterList.map((ch) => ({ id: ch.id, title: ch.title, position: ch.position ?? null }))}
        books={books || []}
        toast={toast}
      />

      <section className="mt-8 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">AI Proposal Queue</h2>
        <p className="mt-1 text-xs text-slate-500">Review and apply AI changes per chapter (with diff preview).</p>
        <BookProposalsClient proposals={proposals || []} chapterMap={chapterMap} bookId={book.id} />
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Book-level Proposals</h2>
        <p className="mt-1 text-xs text-slate-500">Approve larger changes like reordering chapters.</p>
        <BookLevelProposalsClient proposals={bookProposals || []} chapterMap={chapterMap} bookId={book.id} />
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="text-sm font-semibold">Inline Review Queue</div>
        <p className="mt-1 text-xs text-slate-500">Anchored editor comments waiting for review.</p>
        <InlineReviewQueueClient comments={commentQueue || []} chapterMap={chapterMap} redirect={`/books/${book.id}/ai`} />
      </section>
    </main>
  );
}
