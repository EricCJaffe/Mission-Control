/**
 * GET  /api/notes/kb?q=&category=   — the knowledge base: category tree + notes,
 *                                     optionally filtered by category and search.
 * POST /api/notes/kb                — actions: new-category, new-note, move-note.
 *
 * Pure data + light mutations, no AI, so it loads freely. Seeds the user's
 * default category tree on first load (idempotent).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  sort: number;
  icon: string | null;
};

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const category = req.nextUrl.searchParams.get('category')?.trim() ?? '';

  // Load categories; if the table isn't there yet, the KB migration hasn't been
  // applied — tell the UI so it can show a setup hint instead of erroring.
  const catRes = await supabase
    .from('note_categories')
    .select('id, name, parent_id, path, sort, icon')
    .eq('user_id', user.id)
    .order('sort', { ascending: true });

  if (catRes.error) {
    if (/does not exist|schema cache/i.test(catRes.error.message)) {
      return NextResponse.json({ ok: true, needsMigration: true, categories: [], notes: [] });
    }
    return NextResponse.json({ ok: false, error: catRes.error.message }, { status: 500 });
  }

  let categories = (catRes.data ?? []) as Category[];

  // First visit → seed the default tree, then reload.
  if (categories.length === 0) {
    await supabase.rpc('seed_default_note_categories', { p_user_id: user.id });
    const reload = await supabase
      .from('note_categories')
      .select('id, name, parent_id, path, sort, icon')
      .eq('user_id', user.id)
      .order('sort', { ascending: true });
    categories = (reload.data ?? []) as Category[];
  }

  // Only honour a category the user actually owns — validating against the
  // loaded paths eliminates any PostgREST filter injection through this value
  // (no need to interpolate untrusted text into a filter string).
  const validCategory = category && categories.some((c) => c.path === category) ? category : '';
  // Escape PostgREST-reserved and ILIKE metacharacters before interpolation.
  const escapeFilter = (s: string) => s.replace(/[\\%_,().:*]/g, (ch) => `\\${ch}`);

  // Notes: filter by category subtree (path prefix) and/or full-text search.
  let notesQuery = supabase
    .from('notes')
    .select('id, title, tags, category_id, category_path, updated_at, status')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(500);

  if (validCategory) {
    const safe = escapeFilter(validCategory);
    // Include the category and its descendants (path or path/…).
    notesQuery = notesQuery.or(`category_path.eq.${safe},category_path.like.${safe}/%`);
  }
  if (q) {
    // Prefer the FTS index (parameterised, injection-safe); fall back to an
    // escaped ilike only if the search column isn't there yet.
    const fts = await supabase
      .from('notes')
      .select('id, title, tags, category_id, category_path, updated_at, status')
      .eq('user_id', user.id)
      .textSearch('search_tsv', q, { type: 'websearch' })
      .limit(500);
    if (!fts.error) {
      let rows = fts.data ?? [];
      if (validCategory) {
        rows = rows.filter(
          (n) =>
            n.category_path === validCategory ||
            (n.category_path ?? '').startsWith(`${validCategory}/`)
        );
      }
      return NextResponse.json({ ok: true, categories, notes: rows, query: q });
    }
    const safeQ = escapeFilter(q);
    notesQuery = notesQuery.or(`title.ilike.%${safeQ}%,content_md.ilike.%${safeQ}%`);
  }

  const notesRes = await notesQuery;
  if (notesRes.error) {
    return NextResponse.json({ ok: false, error: notesRes.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, categories, notes: notesRes.data ?? [], query: q });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const action = body.action as string;

  if (action === 'new-category') {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ ok: false, error: 'Name required' }, { status: 400 });
    const parentId = (body.parent_id as string) || null;

    let parentPath = '';
    if (parentId) {
      const { data: parent } = await supabase
        .from('note_categories')
        .select('path')
        .eq('id', parentId)
        .eq('user_id', user.id)
        .maybeSingle();
      parentPath = parent?.path ? `${parent.path}/` : '';
    }
    const { data, error } = await supabase
      .from('note_categories')
      .insert({ user_id: user.id, name, parent_id: parentId, path: `${parentPath}${name}`, sort: 100 })
      .select('id, name, parent_id, path, sort, icon')
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, category: data });
  }

  if (action === 'new-note') {
    const categoryId = (body.category_id as string) || null;
    const title = String(body.title ?? 'Untitled note').trim() || 'Untitled note';
    let categoryPath: string | null = null;
    if (categoryId) {
      const { data: cat } = await supabase
        .from('note_categories')
        .select('path')
        .eq('id', categoryId)
        .eq('user_id', user.id)
        .maybeSingle();
      categoryPath = cat?.path ?? null;
    }
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        title,
        content_md: '',
        category_id: categoryId,
        category_path: categoryPath,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, note_id: data.id });
  }

  if (action === 'move-note') {
    const noteId = String(body.note_id ?? '');
    const categoryId = (body.category_id as string) || null;
    let categoryPath: string | null = null;
    if (categoryId) {
      const { data: cat } = await supabase
        .from('note_categories')
        .select('path')
        .eq('id', categoryId)
        .eq('user_id', user.id)
        .maybeSingle();
      categoryPath = cat?.path ?? null;
    }
    const { error } = await supabase
      .from('notes')
      .update({ category_id: categoryId, category_path: categoryPath })
      .eq('id', noteId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
