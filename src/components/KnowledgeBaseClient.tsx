'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, ChevronRight, ChevronDown, FolderPlus, FilePlus, Loader2, Tag, BookOpen,
} from 'lucide-react';

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  sort: number;
  icon: string | null;
};
type NoteRow = {
  id: string;
  title: string;
  tags: string[] | null;
  category_id: string | null;
  category_path: string | null;
  updated_at: string;
  status: string | null;
};

export default function KnowledgeBaseClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selected, setSelected] = useState<string>(''); // category path, '' = all
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (q: string, category: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/notes/kb?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`
      );
      const data = await res.json();
      if (data.needsMigration) setNeedsMigration(true);
      setCategories(data.categories ?? []);
      setNotes(data.notes ?? []);
    } catch {
      /* leave prior state */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load('', '');
  }, [load]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(query, selected), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, selected, load]);

  const topLevel = useMemo(
    () => categories.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort),
    [categories]
  );
  const childrenOf = useCallback(
    (id: string) => categories.filter((c) => c.parent_id === id).sort((a, b) => a.sort - b.sort),
    [categories]
  );
  const countInPath = useCallback(
    (path: string) =>
      notes.filter((n) => n.category_path === path || (n.category_path ?? '').startsWith(`${path}/`))
        .length,
    [notes]
  );

  async function newNote(categoryId: string | null) {
    setBusy(true);
    try {
      const res = await fetch('/api/notes/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'new-note', category_id: categoryId }),
      });
      const data = await res.json();
      if (data.ok) router.push(`/notes/${data.note_id}`);
    } finally {
      setBusy(false);
    }
  }

  async function newCategory(parentId: string | null) {
    const name = window.prompt(parentId ? 'New subcategory name' : 'New category name');
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/notes/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'new-category', name: name.trim(), parent_id: parentId }),
      });
      await load(query, selected);
      if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    } finally {
      setBusy(false);
    }
  }

  if (needsMigration) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
        <p className="text-sm font-medium text-amber-900">Knowledge base needs a one-time setup</p>
        <p className="mt-1 text-xs text-amber-800">
          Apply the <code>20260726120000_knowledge_base.sql</code> migration in Supabase, then reload.
        </p>
      </div>
    );
  }

  const shown = notes; // already filtered server-side by category + search

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
      {/* Category tree */}
      <aside className="rounded-2xl border-2 border-slate-300 bg-white p-3 shadow-sm h-max">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Categories
          </span>
          <button
            onClick={() => newCategory(null)}
            title="New top-level category"
            className="text-slate-400 hover:text-blue-600"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => setSelected('')}
          className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm min-h-[40px] ${
            selected === '' ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="h-4 w-4" /> All notes
          <span className="ml-auto text-xs text-slate-400">{notes.length}</span>
        </button>

        {topLevel.map((cat) => {
          const kids = childrenOf(cat.id);
          const isOpen = expanded.has(cat.id);
          return (
            <div key={cat.id}>
              <div
                className={`flex items-center gap-1 rounded-lg pr-1 ${
                  selected === cat.path ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                {kids.length > 0 ? (
                  <button
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat.id)) next.delete(cat.id);
                        else next.add(cat.id);
                        return next;
                      })
                    }
                    className="p-1 text-slate-400"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="w-6" />
                )}
                <button
                  onClick={() => setSelected(cat.path)}
                  className={`flex-1 py-2 text-left text-sm min-h-[40px] ${
                    selected === cat.path ? 'font-semibold text-blue-700' : 'text-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
                <span className="text-xs text-slate-400">{countInPath(cat.path)}</span>
                <button
                  onClick={() => newCategory(cat.id)}
                  title="New subcategory"
                  className="p-1 text-slate-300 hover:text-blue-600"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </div>
              {isOpen &&
                kids.map((kid) => (
                  <button
                    key={kid.id}
                    onClick={() => setSelected(kid.path)}
                    className={`ml-7 flex w-[calc(100%-1.75rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-sm min-h-[36px] ${
                      selected === kid.path
                        ? 'bg-blue-50 font-semibold text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {kid.name}
                    <span className="ml-auto text-xs text-slate-400">{countInPath(kid.path)}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </aside>

      {/* Search + note list */}
      <section className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your knowledge base…"
              className="min-h-[44px] w-full rounded-xl border-2 border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
          <button
            onClick={() => newNote(categories.find((c) => c.path === selected)?.id ?? null)}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
            New note
          </button>
        </div>

        {selected && (
          <p className="text-xs text-slate-500">
            In <span className="font-medium text-slate-700">{selected}</span> ·{' '}
            <button onClick={() => setSelected('')} className="text-blue-600 hover:underline">
              clear
            </button>
          </p>
        )}

        {loading ? (
          <div className="rounded-2xl border-2 border-slate-300 bg-white p-10 text-center shadow-sm">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border-2 border-slate-300 bg-white p-10 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              {query ? 'No notes match your search.' : 'No notes here yet.'}
            </p>
            <button
              onClick={() => newNote(categories.find((c) => c.path === selected)?.id ?? null)}
              className="mt-3 text-sm font-medium text-blue-600 hover:underline"
            >
              Create the first one
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map((n) => (
              <button
                key={n.id}
                onClick={() => router.push(`/notes/${n.id}`)}
                className="block w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-left shadow-sm hover:border-slate-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-800">{n.title || 'Untitled note'}</p>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(n.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  {n.category_path && (
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {n.category_path}
                    </span>
                  )}
                  {n.tags && n.tags.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {n.tags.join(', ')}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
