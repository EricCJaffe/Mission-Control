import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { DEFAULT_CATEGORIES, uniqueCategoryKey, wouldCycle } from '@/lib/spirit/prayer';

export const dynamic = 'force-dynamic';

const MODES = ['praise', 'submission', 'provision', 'repentance', 'protection', 'kingdom'];
const STATUSES = ['open', 'waiting', 'answered', 'closed'];
const CADENCES = ['daily', 'weekly', 'monthly', 'once', 'rotation'];

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

type Supa = Awaited<ReturnType<typeof supabaseServer>>;

/**
 * The category keys this user actually has.
 *
 * Categories used to be a CHECK constraint, so validating against a constant
 * was the same thing as validating against the database. Now that they are
 * editable, the list has to be read — otherwise the heading a user just
 * created would be rejected as invalid by the very route that created it.
 *
 * Seeds the journal's ten defaults on first touch so an account that predates
 * the categories table is never left with an empty taxonomy and nothing to
 * file a new subject under.
 */
async function categoryKeys(supabase: Supa, userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('prayer_categories')
    .select('key')
    .eq('user_id', userId);

  if (data && data.length > 0) return new Set(data.map((c) => c.key));

  await supabase.from('prayer_categories').upsert(
    DEFAULT_CATEGORIES.map((c, i) => ({
      user_id: userId,
      key: c.key,
      label: c.label,
      position: i,
    })),
    { onConflict: 'user_id,key' }
  );
  return new Set(DEFAULT_CATEGORIES.map((c) => c.key));
}

/**
 * Where a new subject goes in its sibling group: last.
 *
 * Positions are spaced by tens so a later drag between two neighbours usually
 * only has to rewrite the row that moved.
 */
async function nextPosition(
  supabase: Supa,
  userId: string,
  parentId: string | null,
  category: string
): Promise<number> {
  let q = supabase
    .from('prayer_subjects')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null).eq('category', category);
  const { data } = await q;
  return ((data?.[0]?.position as number | undefined) ?? 0) + 10;
}

/**
 * Creates a category, a subject, or a request, depending on `kind`.
 *
 * A new request may create its subject in the same call — "pray for Dave about
 * his surgery" is one thought, and splitting it across two forms is how a
 * capture flow stops getting used.
 */
export async function POST(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kind = body?.kind === 'subject' || body?.kind === 'category' ? body.kind : 'request';

  if (kind === 'category') {
    const label = str(body?.label);
    if (!label) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

    const existing = await categoryKeys(supabase, user.id);
    // The key is derived once and never regenerated on rename, so renaming a
    // heading can never detach the subjects filed under it.
    const key = uniqueCategoryKey(label, existing);

    const { data: last } = await supabase
      .from('prayer_categories')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1);

    const { data, error } = await supabase
      .from('prayer_categories')
      .insert({
        user_id: user.id,
        key,
        label,
        position: ((last?.[0]?.position as number | undefined) ?? -1) + 1,
      })
      .select('id, key, label, position, archived')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, category: data });
  }

  const categories = await categoryKeys(supabase, user.id);
  const pickCategory = (v: unknown) => (typeof v === 'string' && categories.has(v) ? v : 'other');

  if (kind === 'subject') {
    const name = str(body?.name);
    if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

    const parentId = str(body?.parent_id);
    const category = pickCategory(body?.category);

    const { data, error } = await supabase
      .from('prayer_subjects')
      .insert({
        user_id: user.id,
        name,
        category,
        parent_id: parentId,
        notes: str(body?.notes),
        position: await nextPosition(supabase, user.id, parentId, category),
      })
      .select('id, name, category, notes, scripture_refs, parent_id, position, archived')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, subject: data });
  }

  const text = str(body?.body);
  if (!text) return NextResponse.json({ error: 'The prayer text is required' }, { status: 400 });

  let subjectId = str(body?.subject_id);
  let createdSubject = null;
  const newSubjectName = str(body?.new_subject_name);

  if (!subjectId && newSubjectName) {
    const parentId = str(body?.parent_id);
    const category = pickCategory(body?.category);
    const { data, error } = await supabase
      .from('prayer_subjects')
      .insert({
        user_id: user.id,
        name: newSubjectName,
        category,
        parent_id: parentId,
        position: await nextPosition(supabase, user.id, parentId, category),
      })
      .select('id, name, category, notes, scripture_refs, parent_id, position, archived')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    subjectId = data.id;
    createdSubject = data;
  }

  const { data, error } = await supabase
    .from('prayer_requests')
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      body: text,
      mode: MODES.includes(body?.mode) ? body.mode : null,
      status: STATUSES.includes(body?.status) ? body.status : 'open',
      urgent: body?.urgent === true,
      // Defaults to a one-off. Repeats are something you add deliberately —
      // every new prayer silently joining a recurring cycle is how a list
      // becomes a treadmill.
      cadence: CADENCES.includes(body?.cadence) ? body.cadence : 'once',
      cadence_anchor: str(body?.cadence_anchor),
      due_date: str(body?.due_date),
    })
    .select('id, subject_id, body, mode, status, urgent, last_prayed_at, prayed_count, cadence, cadence_anchor, due_date')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, request: data, subject: createdSubject });
}

/**
 * Updates a category, a subject, a batch of subject positions, or a request.
 *
 * On requests, `action` covers the shortcuts the rotation view uses:
 * 'prayed' | 'note' | 'edit_log' | 'delete_log' | 'answered' | 'reopen'.
 * Everything else is a field edit, and only keys actually present in the body
 * are written — a partial edit cannot blank a field it never mentioned.
 */
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);

  /**
   * A drag lands here: the new order of one sibling group, applied as a batch.
   *
   * Sent as a whole group rather than a single "moved to index 3" because the
   * client already knows the resulting order and the server would otherwise
   * have to reconstruct it from a position that may have shifted under it.
   */
  if (body?.kind === 'subject-order') {
    const moves = Array.isArray(body?.moves) ? body.moves : [];
    if (moves.length === 0) return NextResponse.json({ ok: true, moved: 0 });
    if (moves.length > 500) {
      return NextResponse.json({ error: 'Too many moves in one request' }, { status: 400 });
    }

    const { data: all } = await supabase
      .from('prayer_subjects')
      .select('id, parent_id')
      .eq('user_id', user.id);

    const categories = await categoryKeys(supabase, user.id);
    const now = new Date().toISOString();

    for (const move of moves) {
      const id = str(move?.id);
      if (!id) continue;
      const parentId = str(move?.parent_id);
      // A cycle here means the tree render never terminates. The picker
      // excludes descendants, but a stale client and a drag onto a collapsed
      // branch both reach this point.
      if (wouldCycle(all ?? [], id, parentId)) {
        return NextResponse.json(
          { error: 'That move would put a subject inside itself' },
          { status: 400 }
        );
      }

      const patch: Record<string, unknown> = { parent_id: parentId, updated_at: now };
      if (typeof move?.position === 'number' && Number.isFinite(move.position)) {
        patch.position = Math.trunc(move.position);
      }
      if (typeof move?.category === 'string' && categories.has(move.category)) {
        patch.category = move.category;
      }

      const { error } = await supabase
        .from('prayer_subjects')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, moved: moves.length });
  }

  const id = str(body?.id);
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  if (body?.kind === 'category') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('label' in body) {
      const label = str(body.label);
      if (!label) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
      // Deliberately does not touch `key`. The label is what you read; the key
      // is what 120 subject rows point at.
      patch.label = label;
    }
    if ('position' in body && typeof body.position === 'number') {
      patch.position = Math.trunc(body.position);
    }
    if ('archived' in body) patch.archived = body.archived === true;

    const { error } = await supabase
      .from('prayer_categories')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body?.kind === 'subject') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('name' in body) {
      const name = str(body.name);
      if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
      patch.name = name;
    }
    if ('category' in body) {
      const categories = await categoryKeys(supabase, user.id);
      if (categories.has(body.category)) patch.category = body.category;
    }
    if ('notes' in body) patch.notes = str(body.notes);
    if ('archived' in body) patch.archived = body.archived === true;
    if ('position' in body && typeof body.position === 'number') {
      patch.position = Math.trunc(body.position);
    }
    if ('parent_id' in body) {
      const parentId = str(body.parent_id);
      const { data: all } = await supabase
        .from('prayer_subjects')
        .select('id, parent_id')
        .eq('user_id', user.id);
      if (wouldCycle(all ?? [], id, parentId)) {
        return NextResponse.json(
          { error: 'That would put a subject inside itself' },
          { status: 400 }
        );
      }
      patch.parent_id = parentId;
    }

    const { error } = await supabase
      .from('prayer_subjects')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const action = body?.action;

  /**
   * Edit or remove a single history entry.
   *
   * Only reflections are editable. A checkmark is a record that something
   * happened on a day, and rewriting it would make the rotation's own
   * bookkeeping negotiable; a reflection is prose, and prose gets fixed.
   * `id` is the log row here, not the request.
   */
  if (action === 'edit_log' || action === 'delete_log') {
    const { data: entry } = await supabase
      .from('prayer_logs')
      .select('id, kind, request_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (entry.kind !== 'note') {
      return NextResponse.json(
        { error: 'Only reflections can be edited. Prayed marks are a record of what happened.' },
        { status: 400 }
      );
    }

    if (action === 'delete_log') {
      const { error } = await supabase
        .from('prayer_logs')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const note = str(body?.note);
    if (!note) return NextResponse.json({ error: 'A reflection cannot be empty' }, { status: 400 });

    const patch: Record<string, unknown> = { note, updated_at: new Date().toISOString() };
    const at = logInstant(body?.date, body?.prayed_at);
    if (at) patch.prayed_at = at;

    const { error } = await supabase
      .from('prayer_logs')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  /**
   * A reflection: something worth recording about this prayer, on a date.
   *
   * Explicitly does NOT touch last_prayed_at, prayed_count or the rotation.
   * Writing about something you are still carrying should not tell the app you
   * are finished with it for the day — that conflation is the reason the only
   * way to say anything about a prayer used to be to close it out.
   */
  if (action === 'note') {
    const note = str(body?.note);
    if (!note) return NextResponse.json({ error: 'A reflection cannot be empty' }, { status: 400 });

    const { data, error } = await supabase
      .from('prayer_logs')
      .insert({
        user_id: user.id,
        request_id: id,
        kind: 'note',
        prayed_at: logInstant(body?.date, body?.prayed_at) ?? new Date().toISOString(),
        note,
      })
      .select('id, kind, prayed_at, note')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data });
  }

  if (action === 'prayed') {
    const prayedAt = logInstant(body?.date, body?.prayed_at) ?? new Date().toISOString();

    // The log is the record; last_prayed_at and prayed_count are a denormalised
    // convenience for sorting. Write the log first so a failure halfway leaves
    // a real entry rather than an incremented counter with nothing behind it.
    const { error: logError } = await supabase.from('prayer_logs').insert({
      user_id: user.id,
      request_id: id,
      kind: 'prayed',
      prayed_at: prayedAt,
      note: str(body?.note),
    });
    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

    // Count from the log rather than incrementing, so a retried request cannot
    // inflate the total past the number of entries that actually exist.
    // Reflections are excluded — writing about a prayer four times is not
    // praying it four times.
    const { count } = await supabase
      .from('prayer_logs')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', id)
      .eq('user_id', user.id)
      .eq('kind', 'prayed');

    // Backdating must not drag last_prayed_at backwards: filling in that you
    // also prayed this on Tuesday would otherwise make it due again today.
    const { data: current } = await supabase
      .from('prayer_requests')
      .select('last_prayed_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    const latest =
      current?.last_prayed_at && new Date(current.last_prayed_at) > new Date(prayedAt)
        ? current.last_prayed_at
        : prayedAt;

    const { error } = await supabase
      .from('prayer_requests')
      .update({
        last_prayed_at: latest,
        prayed_count: count ?? 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, prayed_at: prayedAt, prayed_count: count ?? 1 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === 'answered') {
    patch.status = 'answered';
    patch.answered_at = new Date().toISOString();
    patch.answer_note = str(body?.answer_note);
  } else if (action === 'reopen') {
    // Reopening keeps answered_at and the note. If something was answered once
    // and has come round again, that history is worth more than a tidy record.
    patch.status = 'open';
  }

  if ('body' in body) {
    const text = str(body.body);
    if (!text) return NextResponse.json({ error: 'The prayer text cannot be empty' }, { status: 400 });
    patch.body = text;
  }
  if ('mode' in body) patch.mode = MODES.includes(body.mode) ? body.mode : null;
  if ('urgent' in body) patch.urgent = body.urgent === true;
  if ('subject_id' in body) patch.subject_id = str(body.subject_id);
  if ('cadence' in body && CADENCES.includes(body.cadence)) patch.cadence = body.cadence;
  if ('cadence_anchor' in body) patch.cadence_anchor = str(body.cadence_anchor);
  if ('due_date' in body) patch.due_date = str(body.due_date);
  if ('answer_note' in body && action !== 'answered') patch.answer_note = str(body.answer_note);
  if ('status' in body && !action && STATUSES.includes(body.status)) {
    patch.status = body.status;
    if (body.status === 'answered') patch.answered_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('prayer_requests')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * The instant a history entry belongs to.
 *
 * A bare 'YYYY-MM-DD' from a date input is anchored at midday rather than
 * midnight, so that a reflection dated the 3rd still reads as the 3rd once the
 * browser renders it back in a timezone behind UTC. Midnight-anchored dates
 * are the reason "yesterday" appears on half the entries in apps that get this
 * wrong. Returns null when nothing usable was sent, so the caller can fall
 * back to now().
 */
function logInstant(date: unknown, instant: unknown): string | null {
  const raw = str(instant);
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const day = str(date);
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const d = new Date(`${day}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/**
 * Deletes a request, a category, or a subject and everything beneath it.
 *
 * Subject deletion cascades to descendants and their requests, so it counts
 * the subtree first and reports what went — losing a branch of a prayer list
 * silently is the failure worth engineering against. The UI shows that count
 * before asking, and offers archiving as the softer path.
 */
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const kindParam = searchParams.get('kind');
  const kind =
    kindParam === 'subject' || kindParam === 'category' ? kindParam : 'request';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  if (kind === 'category') {
    const { data: category } = await supabase
      .from('prayer_categories')
      .select('id, key')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    // Everything filed under it has to land somewhere. Deleting a heading is a
    // decision about a heading, never about the people underneath it.
    const fallbackKey = searchParams.get('reassign_to');
    const { data: others } = await supabase
      .from('prayer_categories')
      .select('key')
      .eq('user_id', user.id)
      .neq('id', id)
      .eq('archived', false)
      .order('position');

    const available = new Set((others ?? []).map((c) => c.key));
    const target =
      fallbackKey && available.has(fallbackKey)
        ? fallbackKey
        : available.has('other')
          ? 'other'
          : (others?.[0]?.key ?? null);

    if (!target) {
      return NextResponse.json(
        { error: 'This is the last category — rename it rather than deleting it.' },
        { status: 400 }
      );
    }

    const { count: moved } = await supabase
      .from('prayer_subjects')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('category', category.key);

    const { error: moveError } = await supabase
      .from('prayer_subjects')
      .update({ category: target, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('category', category.key);

    if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 });

    const { error } = await supabase
      .from('prayer_categories')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, moved: moved ?? 0, target });
  }

  if (kind === 'request') {
    const { error } = await supabase
      .from('prayer_requests')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: all } = await supabase
    .from('prayer_subjects')
    .select('id, parent_id')
    .eq('user_id', user.id);

  const subtree = subtreeIds(all ?? [], id);

  const { count: requestCount } = await supabase
    .from('prayer_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('subject_id', subtree);

  const { error } = await supabase
    .from('prayer_subjects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    removed: { subjects: subtree.length, requests: requestCount ?? 0 },
  });
}

/** A subject and every descendant, walked iteratively so a bad reparent cannot hang. */
function subtreeIds(all: Array<{ id: string; parent_id: string | null }>, rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const s of all) {
    if (!s.parent_id) continue;
    const list = childrenOf.get(s.parent_id);
    if (list) list.push(s.id);
    else childrenOf.set(s.parent_id, [s.id]);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const nodeId = stack.pop()!;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    out.push(nodeId);
    stack.push(...(childrenOf.get(nodeId) ?? []));
  }
  return out;
}

/**
 * Reads one request's history, or counts what a subject deletion would take
 * with it — so the confirmation can say "this removes 12 people and 4
 * requests" instead of "are you sure?".
 */
export async function GET(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // History for one request: every checkmark and every reflection, as one
  // timeline. Newest first, because the recent entries are the ones being
  // looked for; the whole run is there for the times it is being reread.
  const logFor = searchParams.get('log_for');
  if (logFor) {
    const { data, error } = await supabase
      .from('prayer_logs')
      .select('id, kind, prayed_at, note')
      .eq('user_id', user.id)
      .eq('request_id', logFor)
      .order('prayed_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data ?? [] });
  }

  const id = searchParams.get('subtree_of');
  if (!id) return NextResponse.json({ error: 'subtree_of or log_for is required' }, { status: 400 });

  const { data: all } = await supabase
    .from('prayer_subjects')
    .select('id, parent_id')
    .eq('user_id', user.id);

  const subtree = subtreeIds(all ?? [], id);

  const { count } = await supabase
    .from('prayer_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('subject_id', subtree);

  return NextResponse.json({ subjects: subtree.length, requests: count ?? 0 });
}
