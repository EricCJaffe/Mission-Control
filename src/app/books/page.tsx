import { supabaseServer } from "@/lib/supabase/server";
import BooksListClient from "@/components/BooksListClient";
import BooksPageClient from "@/components/BooksPageClient";

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

      <BooksPageClient />

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading books: {error.message}
        </div>
      )}

      <BooksListClient books={books || []} wordTotals={wordTotals} />
    </main>
  );
}
