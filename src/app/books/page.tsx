import { supabaseServer } from "@/lib/supabase/server";
import BooksListClient from "@/components/BooksListClient";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: books, error } = await supabase
    .from("books")
    .select("id,title,description,created_at,status,target_word_count")
    .order("created_at", { ascending: false });

  const bookIds = (books || []).map((book) => book.id);
  const { data: chapterWords } = bookIds.length
    ? await supabase
        .from("chapters")
        .select("book_id,word_count")
        .in("book_id", bookIds)
    : { data: [] };

  const wordTotals = (chapterWords || []).reduce<Record<string, number>>((acc, row) => {
    const current = acc[row.book_id] || 0;
    acc[row.book_id] = current + (row.word_count || 0);
    return acc;
  }, {});

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Books</h1>
        <p className="mt-1 text-sm text-slate-500">Create and manage manuscripts.</p>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm md:grid-cols-2" action="/books/new" method="post">
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Book title" required />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="description" placeholder="Short description" />
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
          name="target_word_count"
          placeholder="Target word count (e.g. 50000)"
          type="number"
          min="0"
        />
        <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Add Book
        </button>
      </form>

      <form className="mt-4 grid gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 shadow-sm" action="/books/upload" method="post" encType="multipart/form-data">
        <div className="text-sm font-medium">Upload Manuscript (DOCX or Markdown)</div>
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="file" type="file" accept=".docx,.md,text/markdown" required />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="title" placeholder="Book title (optional, inferred if omitted)" />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="description" placeholder="Short description (optional)" />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="target_word_count" placeholder="Target word count" type="number" min="0" />
        <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Upload & Build Chapters
        </button>
        <p className="text-xs text-slate-500">Max file size: 50MB. We store the original file in Supabase Storage.</p>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading books: {error.message}
        </div>
      )}

      <BooksListClient books={books || []} wordTotals={wordTotals} />
    </main>
  );
}
