import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from '@/lib/supabase/schema';

export const dynamic = 'force-dynamic';

/**
 * The grokbot outbox: mail for Eric that this app stored instead of sending.
 *
 *   GET  -> every row with handoff_requested_at set and handed_off_at null,
 *           oldest first, with the HTML and subject to route
 *   POST {id, ref} -> ack one row: handed_off_at = now, handoff_ref = the
 *           channel/to-grokbot/ note it became
 *
 * The caller is the brain-side pull on ubuntu-dev. It routes each row through
 * jobs/lib/brief-via-grokbot.py (Sabbath hold included) and acks only after
 * that note is committed, so a crash between the two re-routes rather than
 * drops. Vercel cannot reach the brain checkout; this is why it is a pull.
 *
 * `oldest_pending_hours` is the health number: a red row that sits here is a
 * red alert Eric has not seen, and the puller escalates on it.
 *
 * Bearer CRON_SECRET, fail-closed, like every cron here. Service role, because
 * there is no session and RLS would return nothing — which looks like "empty".
 */
function setup(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.MC_USER_ID;
  if (!secret || !supabaseUrl || !serviceKey || !userId) {
    return { error: NextResponse.json({ error: 'The brief outbox is not configured on this deployment.' }, { status: 503 }) };
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { supabase, userId };
}

export async function GET(req: Request) {
  const s = setup(req);
  if ('error' in s) return s.error;

  const { data, error } = await s.supabase
    .from('briefs')
    .select('id, kind, severity, subject, period_start, period_end, html, handoff_requested_at')
    .eq('user_id', s.userId)
    .not('handoff_requested_at', 'is', null)
    .is('handed_off_at', null)
    .order('handoff_requested_at', { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const oldest = rows[0]?.handoff_requested_at;
  const oldestHours = oldest ? (Date.now() - new Date(oldest).getTime()) / 3_600_000 : null;
  return NextResponse.json({
    ok: true,
    pending: rows,
    count: rows.length,
    oldest_pending_hours: oldestHours === null ? null : Math.round(oldestHours * 10) / 10,
  });
}

export async function POST(req: Request) {
  const s = setup(req);
  if ('error' in s) return s.error;

  let body: { id?: unknown; ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: {id, ref}' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || typeof body.ref !== 'string' || !body.ref) {
    return NextResponse.json({ error: 'id and ref are required strings' }, { status: 400 });
  }

  const { data, error } = await s.supabase
    .from('briefs')
    .update({ handed_off_at: new Date().toISOString(), handoff_ref: body.ref })
    .eq('id', body.id)
    .eq('user_id', s.userId)
    .is('handed_off_at', null)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Zero rows: unknown id, or already acked. Either way the caller must not
  // think it just closed something.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No pending row with that id' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: body.id, ref: body.ref });
}
