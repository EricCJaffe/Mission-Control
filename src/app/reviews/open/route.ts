import { NextResponse } from 'next/server';

import { today as appToday } from '@/lib/day';
import { collectInto, ensureCycle } from '@/lib/reviews/collect';
import { isCycleKind, periodToReview, type CycleKind } from '@/lib/reviews/periods';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Open (or recompute) a review cycle from a plain form post, matching
 * `/ideas/new` — there is no state on the Reviews page worth hydrating a
 * client bundle for.
 *
 * 303, not Next's default 307. A 307 preserves the method, so the browser
 * would POST to the page it lands on; 303 is the code that exists for exactly
 * this — "your post succeeded, now GET this instead" — and it also means a
 * refresh cannot resubmit.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL('/login', req.url), 303);

  const form = await req.formData();
  const raw = String(form.get('kind') || 'weekly');
  const kind: CycleKind = isCycleKind(raw) ? raw : 'weekly';

  // On the first morning of a period there is nothing in it yet, so this hands
  // back the period that just ended. See `periodToReview`.
  const period = periodToReview(kind, appToday());

  try {
    const { id } = await ensureCycle(supabase, user.id, kind, period.start);
    await collectInto(supabase, user.id, {
      id,
      kind,
      period_start: period.start,
      period_end: period.end,
    });
    return NextResponse.redirect(new URL(`/reviews/${id}`, req.url), 303);
  } catch {
    // The dashboard is still readable without the recompute, and an error page
    // here would lose whatever is already on it.
    return NextResponse.redirect(new URL('/reviews?error=collect', req.url), 303);
  }
}
