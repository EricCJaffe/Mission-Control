import { supabaseServer } from '@/lib/supabase/server';
import { CHART_HTML } from './chart';

export const dynamic = 'force-dynamic';

/**
 * The estate authority chart: which Claude session on ubuntu-dev may write
 * where, and how the rules reach the other dev boxes.
 *
 * Eric, 2026-09-29: it was published as a claude.ai artifact, which only the
 * account that published it can open, and he was signed in with another one.
 * So it lives here, behind the Mission Control login like the rest of /admin,
 * as a permanent record.
 *
 * Served as the static page it was designed as, rather than ported into
 * React: it is a document, not a surface anything writes to. Regenerate it
 * from the operating-level session when the tiers change.
 *
 * The middleware matcher already covers /admin/:path*; the user check here
 * is the second fence, not the first.
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new Response('Not signed in', { status: 401 });
  return new Response(CHART_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } });
}
