import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: books, error } = await supabase
    .from("books")
    .select("id,title,description,created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Books</h1>
        <p className="mt-1 text-sm text-slate-500">Create and manage manuscripts.</p>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm md:grid-cols-2" action="/books/new" method="post">
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Book title" required />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="description" placeholder="Short description" />
        <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Add Book
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading books: {error.message}
        </div>
      )}

      <div className="mt-6 grid gap-3">
        {(books || []).map((book) => (
          <Link key={book.id} href={`/books/${book.id}`} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="text-base font-semibold">{book.title}</div>
            <div className="mt-1 text-xs text-slate-500">{book.description || "No description"}</div>
          </Link>
        ))}
        {books && books.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No books yet. Create your first manuscript above.
          </div>
        )}
      </div>
    </main>
  );
}
