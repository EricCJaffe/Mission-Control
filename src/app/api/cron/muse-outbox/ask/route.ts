import { outboxAsk } from '@/lib/muse/handlers';
import { museDeps } from '@/lib/muse/server';

export const dynamic = 'force-dynamic';

/** A bot posts an ask for Muse Code. Bearer CRON_SECRET. Body {from, ask}. */
export async function POST(req: Request) {
  return outboxAsk(req, museDeps());
}
