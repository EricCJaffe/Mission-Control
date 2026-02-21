import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import BookChaptersBoard from "@/components/BookChaptersBoard";
import BookProposalsClient from "@/components/BookProposalsClient";
import BookChat from "@/components/BookChat";
import BookPageClient from "@/components/BookPageClient";

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
  searchParams?: Promise<{ q?: string; tab?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

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
    .select("id,title,status,position,markdown_current,word_count,section_id")
    .eq("book_id", id)
    .order("position", { ascending: true });

  const { data: sections } = await supabase
    .from("chapter_sections")
    .select("id,title,position")
    .eq("book_id", id)
    .order("position", { ascending: true });

  const { data: bookTasks } = await supabase
    .from("tasks")
    .select("id,title,status,category,due_date")
    .eq("book_id", id)
    .order("created_at", { ascending: false });

  const { data: milestones } = await supabase
    .from("book_milestones")
    .select("id,title,due_date,status")
    .eq("book_id", id)
    .order("due_date", { ascending: true });

  const { data: uploads } = await supabase
    .from("book_uploads")
    .select("id,filename,storage_path,created_at,size_bytes")
    .eq("book_id", id)
    .order("created_at", { ascending: false });

  const { data: attachments } = await supabase
    .from("attachments")
    .select("id,filename,storage_path,created_at,size_bytes,mime_type")
    .eq("scope_type", "book")
    .eq("scope_id", id)
    .order("created_at", { ascending: false });

  const chapterIds = (chapters || []).map((ch) => ch.id);
  const { data: proposals } = chapterIds.length
    ? await supabase
        .from("chapter_proposals")
        .select("id,chapter_id,instruction,status,created_at,proposed_markdown")
        .in("chapter_id", chapterIds)
        .eq("status", "pending")
    : { data: [] };

  const rawQuery = resolvedSearch?.q;
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
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
    wordCount: ch.word_count ?? wordCount(ch.markdown_current),
  }));

  const totalWords = chapterList.reduce((acc, ch) => acc + ch.wordCount, 0);
  const targetWords = book.target_word_count || 0;
  const progress = targetWords > 0 ? Math.min(100, Math.round((totalWords / targetWords) * 100)) : 0;
  const rawTab = resolvedSearch?.tab;
  const tab = typeof rawTab === "string" ? rawTab : "outline";

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{book.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{book.description || "No description"}</p>
          <div className="mt-2 text-xs text-slate-500">
            Status: <span className="font-medium text-slate-700">{book.status || "planning"}</span>
          </div>
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Progress</div>
            <div className="text-xs text-slate-500">
              {totalWords.toLocaleString()} words · {targetWords ? `${progress}% of ${targetWords.toLocaleString()}` : "No target set"}
            </div>
          </div>
          <form className="grid gap-2 md:grid-cols-3" action="/books/update" method="post" data-toast="Book updated">
            <input type="hidden" name="id" value={book.id} />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="status" defaultValue={book.status || "planning"}>
              <option value="planning">planning</option>
              <option value="drafting">drafting</option>
              <option value="review">review</option>
              <option value="final">final</option>
              <option value="archive">archive</option>
            </select>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              name="target_word_count"
              placeholder="Target words"
              type="number"
              min="0"
              defaultValue={book.target_word_count || ""}
            />
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Update
            </button>
          </form>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <Link className={`rounded-full border px-3 py-1 ${tab === "outline" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/books/${book.id}?tab=outline`}>
          Outline
        </Link>
        <Link className={`rounded-full border px-3 py-1 ${tab === "tasks" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/books/${book.id}?tab=tasks`}>
          Tasks
        </Link>
        <Link className={`rounded-full border px-3 py-1 ${tab === "timeline" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/books/${book.id}?tab=timeline`}>
          Timeline
        </Link>
        <Link className={`rounded-full border px-3 py-1 ${tab === "notes" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/books/${book.id}?tab=notes`}>
          Research Notes
        </Link>
        <Link className={`rounded-full border px-3 py-1 ${tab === "files" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/books/${book.id}?tab=files`}>
          Files
        </Link>
      </div>

      {tab === "outline" && (
        <>
          <BookPageClient bookId={book.id} chapterOptions={chapterList.map((ch) => ({ id: ch.id, title: ch.title, position: ch.position ?? null }))} />

          <section className="mt-6">
            <BookChaptersBoard bookId={book.id} chapters={chapterList} sections={sections || []} />
          </section>

          <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
            <h2 className="text-base font-semibold">AI Proposal Queue</h2>
            <p className="mt-1 text-xs text-slate-500">
              Review and apply AI changes per chapter (with diff preview).
            </p>
            <BookProposalsClient
              proposals={proposals || []}
              chapterMap={Object.fromEntries((chapters || []).map((ch) => [ch.id, ch]))}
              bookId={book.id}
            />
          </section>
        </>
      )}

{tab === "tasks" && (
        <section className="mt-8 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Book Tasks</h2>
          <form className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]" action="/tasks/new" method="post" data-toast="Task added">
            <input type="hidden" name="book_id" value={book.id} />
            <input type="hidden" name="redirect" value={`/books/${book.id}?tab=tasks`} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Task title" required />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="category" placeholder="category" />
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Add Task
            </button>
          </form>
          <div className="mt-4 grid gap-2">
            {(bookTasks || []).map((task) => (
              <form key={task.id} action="/tasks/update" method="post" className="rounded-xl border border-slate-200 bg-white p-3 text-sm" data-toast="Task updated">
                <input type="hidden" name="id" value={task.id} />
                <input type="hidden" name="redirect" value={`/books/${book.id}?tab=tasks`} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{task.title}</div>
                  <select className="rounded-full border border-slate-200 px-2 py-1 text-xs" name="status" defaultValue={task.status || "open"}>
                    <option value="open">open</option>
                    <option value="in_progress">in progress</option>
                    <option value="done">done</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {task.category || "Uncategorized"} · {task.due_date || "no due date"}
                </div>
                <button className="mt-2 rounded-full border border-slate-200 px-2 py-1 text-xs" type="submit">
                  Update
                </button>
              </form>
            ))}
            {bookTasks && bookTasks.length === 0 && <div className="text-xs text-slate-500">No tasks yet.</div>}
          </div>
        </section>
      )}

      {tab === "timeline" && (
        <section className="mt-8 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Timeline</h2>
          <form className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]" action={`/books/${book.id}/milestones/new`} method="post" data-toast="Milestone added">
            <input type="hidden" name="book_id" value={book.id} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Milestone title" required />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="due_date" type="date" />
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Add Milestone
            </button>
          </form>
          <div className="mt-4 grid gap-2 text-sm">
            {(milestones || []).map((milestone) => (
              <form key={milestone.id} action={`/books/${book.id}/milestones/update`} method="post" className="rounded-xl border border-slate-200 bg-white p-3" data-toast="Milestone updated">
                <input type="hidden" name="id" value={milestone.id} />
                <input type="hidden" name="book_id" value={book.id} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{milestone.title}</div>
                  <select className="rounded-full border border-slate-200 px-2 py-1 text-xs" name="status" defaultValue={milestone.status || "planned"}>
                    <option value="planned">planned</option>
                    <option value="in_progress">in progress</option>
                    <option value="done">done</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>
                <div className="mt-1 text-xs text-slate-500">Due: {milestone.due_date || "tbd"}</div>
                <button className="mt-2 rounded-full border border-slate-200 px-2 py-1 text-xs" type="submit">
                  Update
                </button>
              </form>
            ))}
            {milestones && milestones.length === 0 && <div className="text-xs text-slate-500">No milestones yet.</div>}
          </div>
        </section>
      )}

      {tab === "notes" && (
        <>
          <section className="mt-8 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
            <h2 className="text-base font-semibold">Research Notes (Book)</h2>
            <form className="mt-2" action={`/books/${book.id}`} method="get">
              <input type="hidden" name="tab" value="notes" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="q"
                placeholder="Search notes..."
                defaultValue={query}
              />
            </form>
            <form className="mt-3 grid gap-3" action={`/books/${book.id}/research`} method="post" data-toast="Research note added">
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
        </>
      )}

      {tab === "files" && (
        <section className="mt-8 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Uploaded Files</h2>
          <form className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]" action="/attachments/upload" method="post" encType="multipart/form-data" data-progress="true" data-toast="Attachment uploading">
            <input type="hidden" name="scope_type" value="book" />
            <input type="hidden" name="scope_id" value={book.id} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="file" type="file" />
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Upload Attachment
            </button>
          </form>
          <div className="mt-4 grid gap-2 text-sm">
            {(attachments || []).map((file) => (
              <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{file.filename}</div>
                  <a
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs"
                    href={`/attachments/${file.id}/download`}
                  >
                    Download
                  </a>
                </div>
                {file.mime_type?.startsWith("image/") && (
                  <img
                    src={`/attachments/${file.id}/download`}
                    alt={file.filename}
                    className="mt-2 max-h-48 rounded-lg border border-slate-200 object-contain"
                  />
                )}
                <div className="mt-1 text-xs text-slate-500">
                  {Math.round((file.size_bytes || 0) / 1024)} KB · {new Date(file.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {(uploads || []).map((file) => (
              <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-medium">{file.filename}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {Math.round((file.size_bytes || 0) / 1024)} KB · {new Date(file.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {attachments && uploads && attachments.length === 0 && uploads.length === 0 && (
              <div className="text-xs text-slate-500">No files yet.</div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
