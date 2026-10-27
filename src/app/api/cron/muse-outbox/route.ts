import { outboxAck, outboxReplies } from '@/lib/muse/handlers';
import { museDeps } from '@/lib/muse/server';

export const dynamic = 'force-dynamic';

/**
 * Muse replies waiting for the brain. Bearer CRON_SECRET.
 *
 *   GET  -> answered rows with handed_off_at null, oldest answer first
 *   POST {id, ref} -> ack one: handed_off_at = now, handoff_ref = the
 *           channel/to-grokbot/ note it became
 *
 * The brain-side pull acks only after that note is committed, so a crash
 * between the two re-delivers rather than drops (same as brief-outbox).
 */
export async function GET(req: Request) {
  return outboxReplies(req, museDeps());
}

export async function POST(req: Request) {
  return outboxAck(req, museDeps());
}
