import { museInbox } from '@/lib/muse/handlers';
import { museDeps } from '@/lib/muse/server';

export const dynamic = 'force-dynamic';

/** Muse Code: open asks, oldest first. Bearer MUSE_MAILBOX_TOKEN. See docs/muse-mailbox.md. */
export async function GET(req: Request) {
  return museInbox(req, museDeps());
}
