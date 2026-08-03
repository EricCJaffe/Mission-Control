import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MODES = ['praise', 'submission', 'provision', 'repentance', 'protection', 'kingdom'];
const STATUSES = ['open', 'waiting', 'answered', 'closed'];
const CADENCES = ['daily', 'weekly', 'monthly', 'once', 'rotation'];
const CATEGORIES = [
  'family', 'friends', 'church', 'missions', 'government',
  'world', 'work', 'finances', 'self', 'other',
];

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/**
 * Creates a request, or a subject, depending on `kind`.
 *
 * A new request may create its subject in the same call — "pray for Dave about
 * his surgery" is one thought, and splitting it across two forms is how a
 * capture flow stops getting used.
 */
export async function POST(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kind = body?.kind === 'subject' ? 'subject' : 'request';

  if (kind === 'subject') {
    const name = str(body?.name);
    if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('prayer_subjects')
      .insert({
        user_id: user.id,
        name,
        category: CATEGORIES.includes(body?.category) ? body.category : 'other',
        parent_id: str(body?.parent_id),
        notes: str(body?.notes),
      })
      .select('id, name, category, notes, scripture_refs, parent_id, position')
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
    const { data, error } = await supabase
      .from('prayer_subjects')
      .insert({
        user_id: user.id,
        name: newSubjectName,
        category: CATEGORIES.includes(body?.category) ? body.category : 'other',
        parent_id: str(body?.parent_id),
      })
      .select('id, name, category, notes, scripture_refs, parent_id, position')
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
 * Updates a request or a subject.
 *
 * `action: 'prayed' | 'answered' | 'reopen'` are the shortcuts the rotation
 * view uses; everything else is a field edit. Only keys actually present in
 * the body are written, so a partial edit cannot blank a field it never
 * mentioned.
 */
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = str(body?.id);
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  if (body?.kind === 'subject') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('name' in body) {
      const name = str(body.name);
      if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
      patch.name = name;
    }
    if ('category' in body && CATEGORIES.includes(body.category)) patch.category = body.category;
    if ('notes' in body) patch.notes = str(body.notes);
    if ('archived' in body) patch.archived = body.archived === true;
    if ('parent_id' in body) {
      const parentId = str(body.parent_id);
      // Cheap guard against the obvious cycle. Deeper ones are prevented by the
      // picker excluding descendants.
      if (parentId === id) {
        return NextResponse.json({ error: 'A subject cannot be its own parent' }, { status: 400 });
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

  if (action === 'prayed') {
    const prayedAt = new Date().toISOString();

    // The log is the record; last_prayed_at and prayed_count are a denormalised
    // convenience for sorting. Write the log first so a failure halfway leaves
    // a real entry rather than an incremented counter with nothing behind it.
    const { error: logError } = await supabase.from('prayer_logs').insert({
      user_id: user.id,
      request_id: id,
      prayed_at: prayedAt,
      note: str(body?.note),
    });
    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

    // Count from the log rather than incrementing, so a retried request cannot
    // inflate the total past the number of entries that actually exist.
    const { count } = await supabase
      .from('prayer_logs')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', id)
      .eq('user_id', user.id);

    const { error } = await supabase
      .from('prayer_requests')
      .update({
        last_prayed_at: prayedAt,
        prayed_count: count ?? 1,
        updated_at: prayedAt,
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
 * Deletes a request, or a subject and everything beneath it.
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
  const kind = searchParams.get('kind') === 'subject' ? 'subject' : 'request';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

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

  const childrenOf = new Map<string, string[]>();
  for (const s of all ?? []) {
    if (!s.parent_id) continue;
    const list = childrenOf.get(s.parent_id);
    if (list) list.push(s.id);
    else childrenOf.set(s.parent_id, [s.id]);
  }

  const subtree: string[] = [];
  const walk = (nodeId: string) => {
    subtree.push(nodeId);
    for (const child of childrenOf.get(nodeId) ?? []) walk(child);
  };
  walk(id);

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

/**
 * Counts what a subject deletion would take with it, so the confirmation can
 * say "this removes 12 people and 4 requests" instead of "are you sure?".
 */
export async function GET(req: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // History for one request — when it was prayed, and any note left at the time.
  const logFor = searchParams.get('log_for');
  if (logFor) {
    const { data, error } = await supabase
      .from('prayer_logs')
      .select('prayed_at, note')
      .eq('user_id', user.id)
      .eq('request_id', logFor)
      .order('prayed_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data ?? [] });
  }

  const id = searchParams.get('subtree_of');
  if (!id) return NextResponse.json({ error: 'subtree_of or log_for is required' }, { status: 400 });

  const { data: all } = await supabase
    .from('prayer_subjects')
    .select('id, parent_id')
    .eq('user_id', user.id);

  const childrenOf = new Map<string, string[]>();
  for (const s of all ?? []) {
    if (!s.parent_id) continue;
    const list = childrenOf.get(s.parent_id);
    if (list) list.push(s.id);
    else childrenOf.set(s.parent_id, [s.id]);
  }

  const subtree: string[] = [];
  const walk = (nodeId: string) => {
    subtree.push(nodeId);
    for (const child of childrenOf.get(nodeId) ?? []) walk(child);
  };
  walk(id);

  const { count } = await supabase
    .from('prayer_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('subject_id', subtree);

  return NextResponse.json({ subjects: subtree.length, requests: count ?? 0 });
}
