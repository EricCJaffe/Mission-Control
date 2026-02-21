import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import BookChaptersBoard from "@/components/BookChaptersBoard";
import BookChat from "@/components/BookChat";

export const dynamic = "force-dynamic";

function wordCount(markdown?: string | null) {
  if (!markdown) return 0;
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export default async function BookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: book } = await supabase
    .from("books")
    .select("id,title,description")
    .eq("id", id)
    .single();

  if (!book) {
    return (
      <main className="pt-8">
        <h1 className="text-3xl font-semibold">Book not found</h1>
      </main>
    );
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title,status,position,markdown_current")
    .eq("book_id", id)
    .order("position", { ascending: true });

  const query = resolvedSearch?.q?.trim() || "";
  let researchQuery = supabase
    .from("research_notes")
    .select("id,title,content_md,tags")
    .eq("scope_type", "book")
    .eq("scope_id", id)
    .order("created_at", { ascending: false });

  if (query) {
    researchQuery = researchQuery.or(`title.ilike.%${query}%,content_md.ilike.%${query}%`);
  }

  const { data: researchNotes } = await researchQuery;

  const { data: bookThread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("scope_type", "book")
    .eq("scope_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: bookMessages } = bookThread?.id
    ? await supabase
        .from("chat_messages")
        .select("id,role,content,created_at")
        .eq("thread_id", bookThread.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const chapterList = (chapters || []).map((ch) => ({
    id: ch.id,
    title: ch.title,
    status: ch.status,
    position: ch.position,
    wordCount: wordCount(ch.markdown_current),
  }));

  return (
    <main className="pt-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{book.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{book.description || "No description"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" href={`/books/${book.id}/export?format=zip`}>
            Export ZIP
          </a>
          <a className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" href={`/books/${book.id}/export?format=md`}>
            Export MD
          </a>
          <Link className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" href="/books">
            Back to Books
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Add Chapter</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" action={`/books/${book.id}/chapters/new`} method="post">
          <input type="hidden" name="book_id" value={book.id} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Chapter title" required />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="summary" placeholder="Summary / theme" />
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="status" defaultValue="outline">
            <option value="outline">outline</option>
            <option value="draft">draft</option>
            <option value="review">review</option>
            <option value="final">final</option>
          </select>
          <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Add Chapter
          </button>
        </form>
      </section>

      <section className="mt-6">
        <BookChaptersBoard bookId={book.id} chapters={chapterList} />
      </section>

      <section className="mt-8 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Research Notes (Book)</h2>
        <form className="mt-2" action={`/books/${book.id}`} method="get">
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            name="q"
            placeholder="Search notes..."
            defaultValue={query}
          />
        </form>
        <form className="mt-3 grid gap-3" action={`/books/${book.id}/research`} method="post">
          <input type="hidden" name="scope_type" value="book" />
          <input type="hidden" name="scope_id" value={book.id} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Note title" required />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="tags" placeholder="tags (comma-separated)" />
          <textarea className="min-h-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm" name="content_md" placeholder="Markdown content" />
          <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Add Note
          </button>
        </form>

        <div className="mt-4 grid gap-2">
          {(researchNotes || []).map((note) => (
            <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-medium">{note.title}</div>
              <div className="mt-1 text-xs text-slate-500">{(note.tags || []).join(", ")}</div>
              <div className="mt-2 text-xs whitespace-pre-line text-slate-600">{note.content_md}</div>
            </div>
          ))}
          {researchNotes && researchNotes.length === 0 && (
            <div className="text-xs text-slate-500">No research notes yet.</div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <BookChat bookId={book.id} initialMessages={bookMessages || []} />
      </section>
    </main>
  );
}
